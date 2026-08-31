use base64::Engine;

mod bridge;
mod save;
mod update;

// Write one file under a user-chosen export directory. Custom command (not the
// fs plugin) so it can write into any folder the dialog returned without
// declaring an fs scope — fine for a local BYO-key desktop tool. Called once
// per PNG so a full export never holds every blob in a single IPC payload.
// The write itself is atomic (see save::write_atomic), so an interrupted export
// leaves whatever was already there rather than a truncated file.
#[tauri::command]
fn write_file(dir: String, path: String, data_base64: String, executable: bool) -> Result<(), String> {
    // Defense in depth: the relative path must stay under `dir`. An absolute
    // path would make `join` discard `dir`; a `..` component would climb out.
    let rel = std::path::Path::new(&path);
    if rel.is_absolute()
        || rel
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(format!("unsafe path: {path}"));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| e.to_string())?;
    let full = std::path::Path::new(&dir).join(&path);
    save::write_atomic(&full, &bytes).map_err(|e| e.to_string())?;
    if executable {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&full, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    fn b64(s: &str) -> String {
        base64::engine::general_purpose::STANDARD.encode(s.as_bytes())
    }

    #[test]
    fn write_file_rejects_absolute_and_traversal() {
        assert!(write_file("/tmp".into(), "/etc/x".into(), b64("x"), false).is_err());
        assert!(write_file("/tmp".into(), "../escape".into(), b64("x"), false).is_err());
        assert!(write_file("/tmp".into(), "a/../../escape".into(), b64("x"), false).is_err());
    }

    #[test]
    fn write_file_writes_nested_relative_path() {
        let dir = std::env::temp_dir().join("ss-write-file-test");
        let _ = std::fs::remove_dir_all(&dir);
        write_file(dir.to_string_lossy().into(), "a/b/c.txt".into(), b64("hello"), false).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("a/b/c.txt")).unwrap(), "hello");
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .manage(bridge::BridgeState::default())
    .invoke_handler(tauri::generate_handler![
      write_file,
      save::autosave_write,
      save::autosave_read,
      save::autosave_clear,
      save::autosave_image_names,
      save::autosave_put_image,
      save::autosave_read_image,
      save::autosave_delete_images,
      bridge::bridge_respond,
      bridge::bridge_ready,
      bridge::bridge_status,
      bridge::bridge_set_enabled,
      update::check_for_update
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // The agent bridge is best-effort: a desktop app that cannot open its
      // socket should still work as a plain editor.
      if bridge::enabled(app.handle()) {
        match bridge::start(app.handle()) {
          Ok(path) => log::info!("agent bridge listening on {}", path.display()),
          Err(e) => log::warn!("agent bridge unavailable: {e}"),
        }
      } else {
        log::info!("agent bridge switched off by preference");
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
