use base64::Engine;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

mod bridge;
mod document;
mod instance;
mod menu;
mod quit;
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

/// English on purpose: this fires before the webview (and `src/i18n/`) exists,
/// so there is no locale to ask.
const SECOND_INSTANCE_MESSAGE: &str =
  "Screenshot Studio is already running. Switch to the open window — two copies would overwrite each other's work.";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .manage(bridge::BridgeState::default())
    .manage(menu::MenuState::default())
    .manage(quit::QuitState::default())
    .invoke_handler(tauri::generate_handler![
      write_file,
      document::save_document,
      document::read_document,
      document::document_exists,
      document::default_document_dir,
      document::list_document_names,
      document::backup_original,
      document::recents_read,
      document::recents_write,
      document::rotate_backup,
      document::list_backups,
      menu::set_menu_labels,
      quit::close_ack,
      quit::confirm_close,
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
    .on_menu_event(|app, event| menu::on_event(app, event.id().as_ref()))
    // Every quit path lands here: the red button, ⌘W, and the custom ⌘Q item
    // (which calls quit::request directly). The window stays open until the
    // webview answers — or fails to prove it is alive. See quit.rs.
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if quit::on_window_close(window.app_handle()) {
          api.prevent_close();
        }
      }
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Two copies of the app share one localStorage origin, one crash mirror
      // and — now — one document file. Second one in gets told and shown out.
      if !instance::claim(app.handle()) {
        log::warn!("another Screenshot Studio instance is already running; exiting");
        if let Some(window) = app.get_webview_window("main") {
          // Hidden rather than closed: closing the last window exits the app,
          // which would take the dialog with it before anyone read it.
          let _ = window.hide();
        }
        let handle = app.handle().clone();
        app.dialog()
          .message(SECOND_INSTANCE_MESSAGE)
          .title("Screenshot Studio")
          .show(move |_| handle.exit(0));
        return Ok(());
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
