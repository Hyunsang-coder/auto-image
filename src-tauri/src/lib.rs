use base64::Engine;

const KEYCHAIN_SERVICE: &str = "com.hyunsang.screenshotstudio";

// API keys live in the macOS Keychain (not localStorage) when running in the
// desktop shell. zustand's persist adapter drives these by item name; one
// Keychain entry holds the whole api-keys JSON blob.
#[tauri::command]
fn keychain_get(name: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &name).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn keychain_set(name: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &name).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn keychain_delete(name: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &name).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// Write one file under a user-chosen export directory. Custom command (not the
// fs plugin) so it can write into any folder the dialog returned without
// declaring an fs scope — fine for a local BYO-key desktop tool. Called once
// per PNG so a full export never holds every blob in a single IPC payload.
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
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&full, bytes).map_err(|e| e.to_string())?;
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
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      write_file,
      keychain_get,
      keychain_set,
      keychain_delete
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
