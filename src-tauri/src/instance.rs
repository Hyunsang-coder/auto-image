//! One instance at a time.
//!
//! Two copies of the app share one localStorage origin *and* one crash-recovery
//! mirror, so they overwrite each other's work with no warning and no undo.
//! With a document model on top the stakes go up: both would also think they
//! own the same file.
//!
//! The lock is a unix socket, the same signal the agent bridge already uses to
//! notice a second instance — a socket answers only while a live process is
//! behind it, so a crash leaves a stale file rather than a permanent lockout,
//! and the check needs nothing beyond std.

use std::io;
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const LOCK_NAME: &str = "instance.lock.sock";

/// Held for the life of the process: dropping the listener would unbind the
/// socket and let a second instance in.
static HELD: Mutex<Option<UnixListener>> = Mutex::new(None);

/// Where Tauri's `app_config_dir()` resolves to, derived without an AppHandle.
///
/// The claim has to happen *before* `Builder::build()`, because that is what
/// creates the window — and a rejected instance whose webview loads has
/// already rehydrated the shared localStorage, may rewrite the crash mirror on
/// its first debounce tick, and may run the orphan-image sweep with its own
/// stale keep-set. Being told "already running" after that has happened is too
/// late. So this is the one place that spells the path out instead of asking
/// the app: macOS `config_dir()` is `~/Library/Application Support`.
fn config_dir_for(identifier: &str) -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let dir = PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join(identifier);
    std::fs::create_dir_all(&dir).ok()?;
    let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    Some(dir)
}

/// Try to become *the* instance, before any window exists. False means another
/// one is already running and this process should say so and stop.
pub fn claim(identifier: &str) -> bool {
    let Some(dir) = config_dir_for(identifier) else {
        // No config dir means no mirror and no recents either; refusing to
        // start over a lock we cannot place would be the worse failure.
        return true;
    };
    match bind(&dir.join(LOCK_NAME)) {
        Ok(listener) => {
            *HELD.lock().unwrap_or_else(|e| e.into_inner()) = Some(listener);
            true
        }
        Err(_) => false,
    }
}

/// Tell the user why nothing opened.
///
/// `osascript` rather than the dialog plugin, for the same reason `update.rs`
/// shells out to `curl`: the plugin needs a built Tauri app, and building one
/// is exactly what must not happen here. English, because this runs before the
/// webview — and `src/i18n/` lives inside it.
pub fn notify_already_running() {
    let message = "Screenshot Studio is already running. Switch to the open window \u{2014} \
                   two copies would overwrite each other's work.";
    let _ = std::process::Command::new("osascript")
        .arg("-e")
        .arg(format!(
            "display alert \"Screenshot Studio\" message \"{message}\" as critical"
        ))
        .status();
}

/// Bind the lock socket, clearing a stale file first. `Err` means — and only
/// means — that somebody else answers on it.
fn bind(path: &Path) -> io::Result<UnixListener> {
    if path.exists() {
        // A socket file outlives its process, so existence proves nothing.
        // Connecting does: if anything accepts, that is the live instance.
        if UnixStream::connect(path).is_ok() {
            return Err(io::Error::new(io::ErrorKind::AddrInUse, "another instance is running"));
        }
        std::fs::remove_file(path)?;
    }
    let listener = UnixListener::bind(path)?;
    // Never accepted from — a pending connection in the backlog is all the
    // probe above needs, and it keeps this off the runtime entirely.
    listener.set_nonblocking(true)?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    Ok(listener)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ss-instance-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    // `claim` itself is a thin wrapper over this; testing `bind` directly keeps
    // the two cases (live peer vs. leftover file) apart from the one global
    // lock slot, which cargo's parallel tests would otherwise share.
    #[test]
    fn a_second_bind_is_refused_while_the_first_is_alive() {
        let dir = scratch("second");
        let path = dir.join(LOCK_NAME);

        let first = bind(&path).expect("first instance takes the lock");
        assert!(bind(&path).is_err(), "a second instance must be turned away");

        drop(first);
        // The file survives the process that made it — which is exactly the
        // state a crash leaves behind.
        assert!(path.exists());
        assert!(bind(&path).is_ok(), "a stale lock must not lock the user out");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_lock_socket_is_owner_only() {
        let dir = scratch("perms");
        let path = dir.join(LOCK_NAME);
        let _held = bind(&path).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
