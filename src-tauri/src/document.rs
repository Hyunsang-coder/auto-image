//! The document layer: a project is a file at a path the user chose.
//!
//! Everything here writes through `save::write_atomic`, so an interrupted save
//! leaves the previous version rather than a truncated one. Unlike
//! `write_file`, these commands take an absolute path with no directory guard —
//! the path came from a native save/open panel, i.e. from the user.
//!
//! The mirror (`save.rs`) and the document file answer different questions: the
//! file is what was last *saved*, the mirror is everything since. Neither
//! replaces the other.

use std::io;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};

use crate::save::{safe_name, write_atomic};

/// Where new projects land unless the user moves them with Save As.
const DEFAULT_FOLDER: &str = "Screenshot Studio";
const RECENTS_NAME: &str = "recents.json";
const BACKUPS_DIR: &str = "backups";
/// Written next to a document's backups so a restore knows which file the
/// rotated versions came from. Backups are keyed by project id, but what the
/// user restores *into* is a path.
const BACKUP_META: &str = "meta.json";

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn decode(data_base64: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| e.to_string())
}

/// Reject the shapes that would make a "path" mean something else: empty, or
/// relative (which would resolve against whatever the process's cwd happens to
/// be — for a bundled .app, `/`).
fn checked(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    if path.is_empty() || !p.is_absolute() {
        return Err(format!("not an absolute path: {path}"));
    }
    Ok(p.to_path_buf())
}

#[tauri::command]
pub fn save_document(path: String, data_base64: String) -> Result<(), String> {
    let full = checked(&path)?;
    let bytes = decode(&data_base64)?;
    write_atomic(&full, &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_document(path: String) -> Result<String, String> {
    let full = checked(&path)?;
    std::fs::read(&full).map(|b| b64(&b)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn document_exists(path: String) -> bool {
    Path::new(&path).is_file()
}

/// `~/Documents/Screenshot Studio`, created on demand. Falls back to the app
/// config dir on the (unlikely) machine with no Documents folder, so "new
/// project" never fails for want of a home.
#[tauri::command]
pub fn default_document_dir<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let dir = match app.path().document_dir() {
        Ok(docs) => docs.join(DEFAULT_FOLDER),
        Err(_) => crate::bridge::config_dir(&app).map_err(|e| e.to_string())?.join(DEFAULT_FOLDER),
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.display().to_string())
}

/// Every file name directly inside `dir`. The caller derives a non-colliding
/// name from this list (pure, and unit-tested on the TS side) rather than
/// asking here, so the naming rule has one home.
#[tauri::command]
pub fn list_document_names(dir: String) -> Result<Vec<String>, String> {
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.to_string()),
    };
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Some(name) = entry.file_name().to_str() {
            if !name.starts_with('.') {
                names.push(name.to_string());
            }
        }
    }
    Ok(names)
}

/// Keep a one-off copy of a file about to be rewritten under a newer schema.
/// Returns false when a `.bak` is already there — the point is to preserve what
/// the *migration* found, so a second save must not overwrite it with
/// already-migrated content.
#[tauri::command]
pub fn backup_original(path: String) -> Result<bool, String> {
    let full = checked(&path)?;
    if !full.is_file() {
        return Ok(false);
    }
    let bak = PathBuf::from(format!("{}.bak", full.display()));
    if bak.exists() {
        return Ok(false);
    }
    let bytes = std::fs::read(&full).map_err(|e| e.to_string())?;
    write_atomic(&bak, &bytes).map_err(|e| e.to_string())?;
    Ok(true)
}

fn recents_path<R: Runtime>(app: &AppHandle<R>) -> io::Result<PathBuf> {
    Ok(crate::bridge::config_dir(app)?.join(RECENTS_NAME))
}

#[tauri::command]
pub fn recents_read<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    let path = recents_path(&app).map_err(|e| e.to_string())?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn recents_write<R: Runtime>(app: AppHandle<R>, json: String) -> Result<(), String> {
    let path = recents_path(&app).map_err(|e| e.to_string())?;
    write_atomic(&path, json.as_bytes()).map_err(|e| e.to_string())
}

fn backup_dir<R: Runtime>(app: &AppHandle<R>, project_id: &str) -> Result<PathBuf, String> {
    let id = safe_name(project_id)?;
    Ok(crate::bridge::config_dir(app)
        .map_err(|e| e.to_string())?
        .join(BACKUPS_DIR)
        .join(id))
}

/// Roll the version that was on disk into `<config>/backups/<projectId>/`, then
/// drop all but the newest `keep`. Names are caller-supplied timestamps, so the
/// ordering here is a plain lexicographic sort of ISO-ish stamps.
///
/// This is what makes the library store unnecessary: it snapshots without
/// anyone remembering to press anything.
#[tauri::command]
pub fn rotate_backup<R: Runtime>(
    app: AppHandle<R>,
    project_id: String,
    stamp: String,
    data_base64: String,
    keep: usize,
    meta_json: Option<String>,
) -> Result<(), String> {
    let dir = backup_dir(&app, &project_id)?;
    let name = safe_name(&format!("{stamp}.studio.zip"))?.to_string();
    write_atomic(&dir.join(&name), &decode(&data_base64)?).map_err(|e| e.to_string())?;
    if let Some(meta) = meta_json {
        write_atomic(&dir.join(BACKUP_META), meta.as_bytes()).map_err(|e| e.to_string())?;
    }

    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| e.file_name().to_str().map(str::to_owned))
        .filter(|n| n.ends_with(".studio.zip") && !n.starts_with('.'))
        .collect();
    names.sort();
    let keep = keep.max(1);
    if names.len() > keep {
        for stale in &names[..names.len() - keep] {
            let _ = std::fs::remove_file(dir.join(stale));
        }
    }
    Ok(())
}

/// The rotated versions of one project, newest first, with the meta that says
/// which document they belong to.
#[tauri::command]
pub fn list_backups<R: Runtime>(app: AppHandle<R>, project_id: String) -> Result<Value, String> {
    let dir = backup_dir(&app, &project_id)?;
    let mut entries: Vec<Value> = Vec::new();
    if let Ok(read) = std::fs::read_dir(&dir) {
        for entry in read.filter_map(|e| e.ok()) {
            let name = match entry.file_name().to_str() {
                Some(n) if n.ends_with(".studio.zip") && !n.starts_with('.') => n.to_string(),
                _ => continue,
            };
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            entries.push(json!({
                "name": name,
                "path": entry.path().display().to_string(),
                "size": size,
            }));
        }
    }
    entries.sort_by(|a, b| b["name"].as_str().cmp(&a["name"].as_str()));
    let meta = std::fs::read_to_string(dir.join(BACKUP_META))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok());
    Ok(json!({ "dir": dir.display().to_string(), "entries": entries, "meta": meta }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ss-doc-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn mock_app() -> tauri::App<tauri::test::MockRuntime> {
        tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap()
    }

    #[test]
    fn a_document_round_trips_through_base64() {
        let dir = scratch("roundtrip");
        let path = dir.join("Memento.studio.zip").display().to_string();
        // Bytes, not text: a .studio.zip is a zip, and a lossy hop through
        // UTF-8 would corrupt every project ever saved.
        let bytes: Vec<u8> = (0u8..=255).collect();
        save_document(path.clone(), b64(&bytes)).unwrap();
        assert!(document_exists(path.clone()));
        assert_eq!(decode(&read_document(path).unwrap()).unwrap(), bytes);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn relative_paths_are_refused_rather_than_resolved_against_the_cwd() {
        assert!(save_document("relative.studio.zip".into(), b64(b"x")).is_err());
        assert!(save_document(String::new(), b64(b"x")).is_err());
        assert!(read_document("relative.studio.zip".into()).is_err());
        assert!(!document_exists("relative.studio.zip".into()));
    }

    // The reason the whole document layer sits on write_atomic: a save that
    // cannot complete must not take the user's file with it.
    #[test]
    fn a_failed_save_leaves_the_previous_document_intact() {
        use std::os::unix::fs::PermissionsExt;
        let dir = scratch("failed-save");
        let path = dir.join("Memento.studio.zip").display().to_string();
        save_document(path.clone(), b64(b"version one")).unwrap();

        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o500)).unwrap();
        let result = save_document(path.clone(), b64(b"version two"));
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();

        assert!(result.is_err());
        assert_eq!(decode(&read_document(path).unwrap()).unwrap(), b"version one");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_bak_copy_is_made_once_and_never_overwritten() {
        let dir = scratch("bak");
        let path = dir.join("Old.studio.zip").display().to_string();
        save_document(path.clone(), b64(b"v4 original")).unwrap();

        assert!(backup_original(path.clone()).unwrap());
        // A second save is already migrated content; overwriting the .bak with
        // it would destroy the only pre-migration copy.
        save_document(path.clone(), b64(b"v5 migrated")).unwrap();
        assert!(!backup_original(path.clone()).unwrap());
        assert_eq!(std::fs::read(format!("{path}.bak")).unwrap(), b"v4 original");

        // Nothing to preserve is not an error.
        assert!(!backup_original(dir.join("absent.studio.zip").display().to_string()).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn listing_a_folder_skips_dotfiles_and_tolerates_a_missing_one() {
        let dir = scratch("listing");
        std::fs::write(dir.join("A.studio.zip"), b"a").unwrap();
        std::fs::write(dir.join(".hidden"), b"h").unwrap();
        let mut names = list_document_names(dir.display().to_string()).unwrap();
        names.sort();
        assert_eq!(names, vec!["A.studio.zip"]);
        assert!(list_document_names(dir.join("nope").display().to_string()).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Both config-dir tests drive the one real app config dir; cargo runs
    /// tests in parallel, so they take turns.
    static CONFIG: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn recents_round_trip_and_a_missing_file_reads_as_none() {
        let _guard = CONFIG.lock().unwrap_or_else(|e| e.into_inner());
        let app = mock_app();
        let handle = app.handle().clone();
        let path = recents_path(&handle).unwrap();
        let _ = std::fs::remove_file(&path);

        assert_eq!(recents_read(handle.clone()).unwrap(), None);
        recents_write(handle.clone(), "[{\"path\":\"/x\"}]".into()).unwrap();
        assert_eq!(recents_read(handle).unwrap().as_deref(), Some("[{\"path\":\"/x\"}]"));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn rotation_keeps_the_newest_and_pushes_the_oldest_out() {
        let _guard = CONFIG.lock().unwrap_or_else(|e| e.into_inner());
        let app = mock_app();
        let handle = app.handle().clone();
        let id = "rotate-test-project";
        let _ = std::fs::remove_dir_all(backup_dir(&handle, id).unwrap());

        for n in 1..=10 {
            rotate_backup(
                handle.clone(),
                id.into(),
                format!("2026-08-31T00-00-{n:02}"),
                b64(format!("save {n}").as_bytes()),
                10,
                Some("{\"docPath\":\"/tmp/x.studio.zip\"}".into()),
            )
            .unwrap();
        }
        let listing = list_backups(handle.clone(), id.into()).unwrap();
        assert_eq!(listing["entries"].as_array().unwrap().len(), 10);
        assert_eq!(listing["meta"]["docPath"], "/tmp/x.studio.zip");
        // Newest first.
        assert_eq!(listing["entries"][0]["name"], "2026-08-31T00-00-10.studio.zip");

        rotate_backup(
            handle.clone(),
            id.into(),
            "2026-08-31T00-00-11".into(),
            b64(b"save 11"),
            10,
            None,
        )
        .unwrap();
        let listing = list_backups(handle.clone(), id.into()).unwrap();
        let names: Vec<&str> = listing["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["name"].as_str().unwrap())
            .collect();
        assert_eq!(names.len(), 10);
        assert!(names.contains(&"2026-08-31T00-00-11.studio.zip"));
        assert!(!names.contains(&"2026-08-31T00-00-01.studio.zip"));
        // The meta survives a rotation that did not resend it.
        assert_eq!(listing["meta"]["docPath"], "/tmp/x.studio.zip");

        let _ = std::fs::remove_dir_all(backup_dir(&handle, id).unwrap());
    }

    #[test]
    fn a_project_id_cannot_climb_out_of_the_backups_folder() {
        let _guard = CONFIG.lock().unwrap_or_else(|e| e.into_inner());
        let app = mock_app();
        let handle = app.handle().clone();
        assert!(backup_dir(&handle, "../../escape").is_err());
        assert!(list_backups(handle, "a/b".into()).is_err());
    }

    #[test]
    fn listing_backups_of_a_project_that_has_none_is_empty_not_an_error() {
        let _guard = CONFIG.lock().unwrap_or_else(|e| e.into_inner());
        let app = mock_app();
        let listing = list_backups(app.handle().clone(), "never-saved-project".into()).unwrap();
        assert!(listing["entries"].as_array().unwrap().is_empty());
        assert!(listing["meta"].is_null());
    }
}
