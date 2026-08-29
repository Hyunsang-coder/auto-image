//! Agent bridge: lets an external MCP server drive the *live* editor window.
//!
//! Transport is newline-delimited JSON over a Unix domain socket rather than a
//! loopback HTTP port. A browser cannot open a unix socket, which removes the
//! whole localhost-CSRF / DNS-rebinding class of attack against a desktop app
//! that can write files; access control is the socket's 0600 mode, i.e. exactly
//! "this user only". See docs/adr.md.
//!
//! Rust owns the socket but not the data — the project lives in the webview's
//! store. So each request is forwarded to the webview as a `bridge:request`
//! event and parked on a oneshot until the webview answers via `bridge_respond`.

use std::collections::HashMap;
use std::io;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::oneshot;

const SOCKET_NAME: &str = "agent-bridge.sock";

/// Generous enough for a full-resolution slide render, short enough that a
/// wedged webview surfaces as an error rather than an infinite hang.
const CALL_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Default)]
pub struct BridgeState {
    pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    next_id: AtomicU64,
    /// Set once the webview has mounted its listener. Without this a request
    /// that arrives before mount would sit until CALL_TIMEOUT for no reason.
    ready: AtomicBool,
}

/// Forward one call to the webview and wait for its answer.
async fn call(app: &AppHandle, method: &str, params: Value) -> Value {
    let state = app.state::<BridgeState>();

    if !state.ready.load(Ordering::Acquire) {
        return json!({ "ok": false, "error": "editor window is not ready yet" });
    }

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = oneshot::channel();
    state.pending.lock().unwrap().insert(id, tx);

    let payload = json!({ "reqId": id, "method": method, "params": params });
    if let Err(e) = app.emit("bridge:request", payload) {
        state.pending.lock().unwrap().remove(&id);
        return json!({ "ok": false, "error": format!("could not reach the editor window: {e}") });
    }

    match tokio::time::timeout(CALL_TIMEOUT, rx).await {
        Ok(Ok(v)) => v,
        // Sender dropped without answering — the webview reloaded mid-call.
        Ok(Err(_)) => json!({ "ok": false, "error": "editor window dropped the request" }),
        Err(_) => {
            state.pending.lock().unwrap().remove(&id);
            json!({ "ok": false, "error": format!("timed out after {}s", CALL_TIMEOUT.as_secs()) })
        }
    }
}

/// The webview's answer to one `bridge:request`.
#[tauri::command]
pub fn bridge_respond(state: State<'_, BridgeState>, req_id: u64, payload: Value) -> Result<(), String> {
    let tx = state
        .pending
        .lock()
        .unwrap()
        .remove(&req_id)
        .ok_or_else(|| format!("no pending bridge request {req_id}"))?;
    tx.send(payload).map_err(|_| "bridge caller gave up".to_string())
}

/// The webview announces it has mounted its `bridge:request` listener.
#[tauri::command]
pub fn bridge_ready(state: State<'_, BridgeState>) {
    state.ready.store(true, Ordering::Release);
}

async fn handle_conn(app: AppHandle, stream: UnixStream) {
    let (read_half, mut write_half) = stream.into_split();
    let mut lines = BufReader::new(read_half).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        if line.trim().is_empty() {
            continue;
        }

        let mut response = match serde_json::from_str::<Value>(&line) {
            Ok(req) => {
                let method = req.get("method").and_then(Value::as_str).unwrap_or_default().to_owned();
                let params = req.get("params").cloned().unwrap_or_else(|| json!({}));
                let mut out = call(&app, &method, params).await;
                // Echo the client's own id so it can match responses to calls.
                if let (Some(obj), Some(id)) = (out.as_object_mut(), req.get("id")) {
                    obj.insert("id".to_owned(), id.clone());
                }
                out
            }
            Err(e) => json!({ "ok": false, "error": format!("malformed request: {e}") }),
        };

        if response.get("ok").is_none() {
            if let Some(obj) = response.as_object_mut() {
                obj.insert("ok".to_owned(), Value::Bool(false));
                obj.insert("error".to_owned(), Value::String("editor returned no verdict".into()));
            }
        }

        let mut buf = match serde_json::to_vec(&response) {
            Ok(b) => b,
            Err(_) => br#"{"ok":false,"error":"response was not serializable"}"#.to_vec(),
        };
        buf.push(b'\n');
        if write_half.write_all(&buf).await.is_err() {
            break; // client hung up
        }
    }
}

/// Bind the socket and start accepting. Returns the socket path for logging.
pub fn start(app: &AppHandle) -> io::Result<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| io::Error::other(e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))?;

    let path = dir.join(SOCKET_NAME);

    // A socket file outlives the process that made it, so a crash leaves one
    // behind and bind() would fail with EADDRINUSE. Probe before removing:
    // if something still answers, a second instance is live and must not steal
    // the first one's socket.
    if path.exists() {
        if std::os::unix::net::UnixStream::connect(&path).is_ok() {
            return Err(io::Error::new(
                io::ErrorKind::AddrInUse,
                "another Screenshot Studio instance already owns the agent bridge",
            ));
        }
        std::fs::remove_file(&path)?;
    }

    // Bind on the std listener: setup() runs outside the tokio runtime, and
    // tokio's own bind() panics without a reactor. Binding here (rather than
    // inside the spawned task) also keeps bind errors synchronous, so the
    // caller can log a real reason instead of a silent dead socket.
    let std_listener = std::os::unix::net::UnixListener::bind(&path)?;
    std_listener.set_nonblocking(true)?;
    // Bind honours the umask, so narrow it explicitly: this is the access check.
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let listener = match UnixListener::from_std(std_listener) {
            Ok(l) => l,
            Err(e) => {
                log::error!("agent bridge could not join the runtime: {e}");
                return;
            }
        };
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    tauri::async_runtime::spawn(handle_conn(handle.clone(), stream));
                }
                Err(e) => {
                    log::error!("agent bridge stopped accepting: {e}");
                    break;
                }
            }
        }
    });

    Ok(path)
}
