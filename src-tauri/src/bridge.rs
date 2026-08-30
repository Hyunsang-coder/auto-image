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
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::oneshot;

const SOCKET_NAME: &str = "agent-bridge.sock";

/// Presence of this file means "the user switched the bridge off". A file, not
/// a webview store: `setup()` has to know the answer before the webview (and
/// its localStorage) exists, or a bridge the user disabled would still listen
/// for the first seconds of every launch.
const DISABLED_MARKER: &str = "agent-bridge.disabled";

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
    /// Some while the accept loop is live; taking it and sending stops the loop.
    /// Doubles as the "is it running" answer for the status surface.
    shutdown: Mutex<Option<oneshot::Sender<()>>>,
    /// Why the last start attempt failed, so the UI can say more than "off".
    last_error: Mutex<Option<String>>,
}

/// Forward one call to the webview and wait for its answer.
async fn call<R: Runtime>(app: &AppHandle<R>, method: &str, params: Value) -> Value {
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

async fn handle_conn<R: Runtime>(app: AppHandle<R>, stream: UnixStream) {
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

fn config_dir<R: Runtime>(app: &AppHandle<R>) -> io::Result<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| io::Error::other(e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))?;
    Ok(dir)
}

fn socket_path<R: Runtime>(app: &AppHandle<R>) -> io::Result<PathBuf> {
    Ok(config_dir(app)?.join(SOCKET_NAME))
}

/// Whether the user has left the bridge switched on.
pub fn enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    config_dir(app).map(|d| !d.join(DISABLED_MARKER).exists()).unwrap_or(true)
}

/// Bind the socket and start accepting. Returns the socket path for logging.
pub fn start<R: Runtime>(app: &AppHandle<R>) -> io::Result<PathBuf> {
    let out = start_inner(app);
    if let Err(e) = &out {
        *app.state::<BridgeState>().last_error.lock().unwrap() = Some(e.to_string());
    }
    out
}

fn start_inner<R: Runtime>(app: &AppHandle<R>) -> io::Result<PathBuf> {
    let path = socket_path(app)?;
    if app.state::<BridgeState>().shutdown.lock().unwrap().is_some() {
        return Ok(path); // already listening
    }

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

    let (tx, mut shutdown_rx) = oneshot::channel();
    let state = app.state::<BridgeState>();
    *state.shutdown.lock().unwrap() = Some(tx);
    *state.last_error.lock().unwrap() = None;

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let listener = match UnixListener::from_std(std_listener) {
            Ok(l) => l,
            Err(e) => {
                log::error!("agent bridge could not join the runtime: {e}");
                fail(&handle, format!("could not join the runtime: {e}"));
                return;
            }
        };
        loop {
            tokio::select! {
                _ = &mut shutdown_rx => break,
                accepted = listener.accept() => match accepted {
                    Ok((stream, _)) => {
                        tauri::async_runtime::spawn(handle_conn(handle.clone(), stream));
                    }
                    Err(e) => {
                        log::error!("agent bridge stopped accepting: {e}");
                        fail(&handle, format!("stopped accepting: {e}"));
                        return;
                    }
                }
            }
        }
        log::info!("agent bridge stopped listening");
    });

    Ok(path)
}

/// The listener died on its own — clear the running flag so the status surface
/// stops claiming a socket nobody is behind.
fn fail<R: Runtime>(app: &AppHandle<R>, reason: String) {
    let state = app.state::<BridgeState>();
    state.shutdown.lock().unwrap().take();
    *state.last_error.lock().unwrap() = Some(reason);
}

/// Stop accepting and unlink the socket, leaving the preference alone.
pub fn stop<R: Runtime>(app: &AppHandle<R>) {
    let taken = app.state::<BridgeState>().shutdown.lock().unwrap().take();
    if let Some(tx) = taken {
        let _ = tx.send(());
    }
    // Unlinked here rather than in the task: a start() right after a stop()
    // must be able to bind a fresh socket without the dying task deleting it.
    if let Ok(path) = socket_path(app) {
        let _ = std::fs::remove_file(path);
    }
}

#[tauri::command]
pub fn bridge_status<R: Runtime>(app: AppHandle<R>) -> Value {
    let state = app.state::<BridgeState>();
    json!({
        "running": state.shutdown.lock().unwrap().is_some(),
        "enabled": enabled(&app),
        "socketPath": socket_path(&app).map(|p| p.display().to_string()).unwrap_or_default(),
        "error": state.last_error.lock().unwrap().clone(),
    })
}

#[tauri::command]
pub fn bridge_set_enabled<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<Value, String> {
    let marker = config_dir(&app).map_err(|e| e.to_string())?.join(DISABLED_MARKER);
    if enabled {
        // Remove the marker first: a start that fails still leaves the switch
        // on, with the reason reported through `error` rather than as a throw.
        if marker.exists() {
            std::fs::remove_file(&marker).map_err(|e| e.to_string())?;
        }
        let _ = start(&app);
    } else {
        std::fs::write(&marker, b"").map_err(|e| e.to_string())?;
        stop(&app);
        *app.state::<BridgeState>().last_error.lock().unwrap() = None;
    }
    Ok(bridge_status(app))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader as StdBufReader, Write};
    use std::os::unix::net::UnixStream as StdUnixStream;

    fn mock_app() -> tauri::App<tauri::test::MockRuntime> {
        tauri::test::mock_builder()
            .manage(BridgeState::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap()
    }

    /// One request/response over the socket. The webview never mounts here, so
    /// the answer is the "not ready" verdict — which still proves the listener
    /// accepted, read a line and wrote a reply back.
    fn roundtrip(path: &PathBuf) -> String {
        let mut stream = StdUnixStream::connect(path).expect("connect");
        stream.write_all(b"{\"method\":\"status\"}\n").expect("write");
        let mut line = String::new();
        StdBufReader::new(stream).read_line(&mut line).expect("read");
        line
    }

    #[test]
    fn stop_frees_the_socket_and_start_takes_it_back() {
        let app = mock_app();
        let handle = app.handle();

        let path = start(handle).expect("start");
        assert!(path.exists(), "socket file should exist while listening");
        assert!(roundtrip(&path).contains("not ready"));

        stop(handle);
        assert!(!path.exists(), "stop should unlink the socket");
        assert!(StdUnixStream::connect(&path).is_err(), "nothing should answer after stop");

        let again = start(handle).expect("restart");
        assert_eq!(again, path);
        assert!(roundtrip(&path).contains("not ready"));

        stop(handle);
    }

    #[test]
    fn the_disabled_marker_is_what_enabled_reads() {
        let app = mock_app();
        let handle = app.handle();
        let marker = config_dir(handle).unwrap().join(DISABLED_MARKER);

        let _ = std::fs::remove_file(&marker);
        assert!(enabled(handle));

        std::fs::write(&marker, b"").unwrap();
        assert!(!enabled(handle));

        std::fs::remove_file(&marker).unwrap();
        assert!(enabled(handle));
    }
}
