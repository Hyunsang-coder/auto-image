//! Durable file writing, and the crash-recovery autosave that depends on it.
//!
//! Two problems this solves, both of which lose work rather than annoy:
//!
//! 1. `fs::write` truncates the target before writing it. A crash, a force
//!    quit, or a power cut partway through leaves neither the old file nor the
//!    new one — just a short one. Every write here goes to a sibling temp file
//!    and is `rename`d over the target instead, which POSIX guarantees is
//!    atomic within one filesystem.
//! 2. The webview's own autosave is localStorage, which is capped (~5 MB across
//!    all three stores) and whose failures the app can only swallow. So the
//!    live project is mirrored to a real file here, outside that cap, and the
//!    app compares the two on launch.

use std::io;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime};

const AUTOSAVE_NAME: &str = "autosave.json";

/// Replace `full`'s contents durably. A crash before the rename leaves the
/// previous contents completely intact; there is no window in which the target
/// is half-written.
pub(crate) fn write_atomic(full: &Path, bytes: &[u8]) -> io::Result<()> {
    use std::io::Write;

    let parent = full
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no parent"))?;
    std::fs::create_dir_all(parent)?;

    // Sibling, not the system temp dir: rename is only atomic when both paths
    // live on the same filesystem, and /tmp routinely does not.
    let stem = full.file_name().and_then(|n| n.to_str()).unwrap_or("out");
    let tmp = parent.join(format!(".{stem}.tmp"));

    let write = (|| -> io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        // Without this the rename can land while the data is still in the page
        // cache, which on a power cut yields an atomically-renamed empty file.
        f.sync_all()
    })();
    if let Err(e) = write {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }

    if let Err(e) = std::fs::rename(&tmp, full) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }

    // Best effort: persists the directory entry itself. A failure here means
    // the data is written but the rename might not survive a power cut — not
    // worth failing an otherwise successful save over.
    if let Ok(dir) = std::fs::File::open(parent) {
        let _ = dir.sync_all();
    }
    Ok(())
}

fn autosave_path<R: Runtime>(app: &AppHandle<R>) -> io::Result<PathBuf> {
    Ok(crate::bridge::config_dir(app)?.join(AUTOSAVE_NAME))
}

/// Mirror the live project to disk. The payload is the project JSON as text,
/// not base64 — a recovery file nobody can read by hand is a worse recovery
/// file.
#[tauri::command]
pub fn autosave_write<R: Runtime>(app: AppHandle<R>, json: String) -> Result<(), String> {
    let path = autosave_path(&app).map_err(|e| e.to_string())?;
    write_atomic(&path, json.as_bytes()).map_err(|e| e.to_string())
}

/// The last mirrored project, or None when there has never been one. A file
/// that exists but cannot be read is an error, not a None — silently reporting
/// "no autosave" is how a recovery path stops recovering.
#[tauri::command]
pub fn autosave_read<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    let path = autosave_path(&app).map_err(|e| e.to_string())?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn autosave_clear<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let path = autosave_path(&app).map_err(|e| e.to_string())?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ss-save-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn replaces_contents_and_leaves_no_temp_behind() {
        let dir = scratch("replace");
        let target = dir.join("project.studio.zip");
        write_atomic(&target, b"first").unwrap();
        write_atomic(&target, b"second").unwrap();

        assert_eq!(std::fs::read(&target).unwrap(), b"second");
        let leftovers: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .filter(|n| n.ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "temp files left behind: {leftovers:?}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    // The whole point of the exercise: a write that cannot complete must not
    // take the previous version with it.
    #[test]
    fn a_failed_write_leaves_the_previous_file_intact() {
        let dir = scratch("failed");
        let target = dir.join("project.studio.zip");
        write_atomic(&target, b"precious").unwrap();

        // Read-only directory: creating the sibling temp file fails, which is
        // the same shape as a full disk or a revoked permission.
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o500)).unwrap();
        let result = write_atomic(&target, b"replacement");
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();

        assert!(result.is_err(), "expected the write to fail");
        assert_eq!(std::fs::read(&target).unwrap(), b"precious");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn creates_missing_parent_directories() {
        let dir = scratch("nested");
        let target = dir.join("a/b/c.json");
        write_atomic(&target, b"{}").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"{}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    // rename() is only atomic within one filesystem, so the temp file has to be
    // a sibling of the target rather than something under /tmp.
    #[test]
    fn temp_file_is_a_sibling_of_the_target() {
        let dir = scratch("sibling");
        let target = dir.join("out.bin");
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o500)).unwrap();
        let err = write_atomic(&target, b"x").unwrap_err();
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();

        // Had the temp lived elsewhere, a read-only *target* directory would
        // only have failed at the rename, not at creation.
        assert_eq!(err.kind(), io::ErrorKind::PermissionDenied);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
