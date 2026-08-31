//! The native menu bar.
//!
//! macOS users press ⌘N / ⌘O / ⌘S / ⇧⌘S out of muscle memory; without a menu
//! every one of them did nothing. The items only *emit* — every handler already
//! exists in the webview, so the menu is a second way to reach them, not a
//! second implementation.
//!
//! **The labels come from the webview**, because `src/i18n/` lives there and a
//! Korean string hardcoded here would fork the dictionary. The consequence is
//! that the menu is built on demand (`set_menu_labels`) rather than at setup:
//! until the webview reports its locale, Tauri's own default menu stands, which
//! is fully working — it just has no File items.
//!
//! Quit is a custom item rather than `PredefinedMenuItem::quit`, so ⌘Q goes
//! through the close guard in `quit.rs` instead of terminating outright.

use std::sync::Mutex;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Recent documents currently on the menu, in the order they are listed. The
/// menu carries `recent:<index>` ids so a path never has to survive a round
/// trip through a menu id.
#[derive(Default)]
pub struct MenuState {
    recents: Mutex<Vec<String>>,
}

#[derive(Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct RecentLabel {
    pub path: String,
    pub name: String,
}

/// Every string the menu shows, supplied by the webview in its current locale.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MenuLabels {
    pub app: String,
    pub about: String,
    pub hide: String,
    pub hide_others: String,
    pub show_all: String,
    pub quit: String,
    pub file: String,
    pub new_project: String,
    pub open: String,
    pub open_recent: String,
    pub no_recents: String,
    pub save: String,
    pub save_as: String,
    pub close: String,
    pub edit: String,
    pub undo: String,
    pub redo: String,
    pub cut: String,
    pub copy: String,
    pub paste: String,
    pub select_all: String,
    pub window: String,
    pub minimize: String,
    pub zoom: String,
    pub fullscreen: String,
}

/// A label the webview left empty would render as a blank menu row, which is
/// worse than English.
fn or(text: &str, fallback: &str) -> String {
    if text.trim().is_empty() { fallback.to_string() } else { text.to_string() }
}

fn build<R: Runtime>(
    app: &AppHandle<R>,
    labels: &MenuLabels,
    recents: &[RecentLabel],
) -> tauri::Result<Menu<R>> {
    let quit = MenuItem::with_id(app, "quit", or(&labels.quit, "Quit"), true, Some("CmdOrCtrl+Q"))?;
    let app_menu = Submenu::with_items(
        app,
        or(&labels.app, "Screenshot Studio"),
        true,
        &[
            &PredefinedMenuItem::about(app, Some(&or(&labels.about, "About")), None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some(&or(&labels.hide, "Hide")))?,
            &PredefinedMenuItem::hide_others(app, Some(&or(&labels.hide_others, "Hide Others")))?,
            &PredefinedMenuItem::show_all(app, Some(&or(&labels.show_all, "Show All")))?,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let recent_items: Vec<MenuItem<R>> = recents
        .iter()
        .enumerate()
        .map(|(i, r)| {
            MenuItem::with_id(app, format!("recent:{i}"), &r.name, true, None::<&str>)
        })
        .collect::<tauri::Result<_>>()?;
    let empty;
    let recent_refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = if recent_items.is_empty() {
        // A disabled row, not an absent submenu: an "Open Recent" that vanishes
        // when the list is empty reads as a bug.
        empty = MenuItem::with_id(app, "recent:none", or(&labels.no_recents, "No Recent Projects"), false, None::<&str>)?;
        vec![&empty]
    } else {
        recent_items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<R>).collect()
    };
    let recent_menu = Submenu::with_items(app, or(&labels.open_recent, "Open Recent"), true, &recent_refs)?;

    let file_menu = Submenu::with_items(
        app,
        or(&labels.file, "File"),
        true,
        &[
            &MenuItem::with_id(app, "new", or(&labels.new_project, "New Project"), true, Some("CmdOrCtrl+N"))?,
            &MenuItem::with_id(app, "open", or(&labels.open, "Open…"), true, Some("CmdOrCtrl+O"))?,
            &recent_menu,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "save", or(&labels.save, "Save"), true, Some("CmdOrCtrl+S"))?,
            &MenuItem::with_id(app, "saveAs", or(&labels.save_as, "Save As…"), true, Some("Shift+CmdOrCtrl+S"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some(&or(&labels.close, "Close Window")))?,
        ],
    )?;

    // Kept because the OS text fields inside the webview stop responding to
    // ⌘C/⌘V entirely once a custom menu replaces the default one.
    let edit_menu = Submenu::with_items(
        app,
        or(&labels.edit, "Edit"),
        true,
        &[
            &PredefinedMenuItem::undo(app, Some(&or(&labels.undo, "Undo")))?,
            &PredefinedMenuItem::redo(app, Some(&or(&labels.redo, "Redo")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(&or(&labels.cut, "Cut")))?,
            &PredefinedMenuItem::copy(app, Some(&or(&labels.copy, "Copy")))?,
            &PredefinedMenuItem::paste(app, Some(&or(&labels.paste, "Paste")))?,
            &PredefinedMenuItem::select_all(app, Some(&or(&labels.select_all, "Select All")))?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        or(&labels.window, "Window"),
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some(&or(&labels.minimize, "Minimize")))?,
            &PredefinedMenuItem::maximize(app, Some(&or(&labels.zoom, "Zoom")))?,
            &PredefinedMenuItem::fullscreen(app, Some(&or(&labels.fullscreen, "Toggle Full Screen")))?,
        ],
    )?;

    Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &window_menu])
}

/// Build (or rebuild) the menu in the webview's current locale, with its
/// current recents. Called on mount, on a language toggle, and whenever the
/// recents list changes.
#[tauri::command]
pub fn set_menu_labels<R: Runtime>(
    app: AppHandle<R>,
    labels: MenuLabels,
    recents: Vec<RecentLabel>,
) -> Result<(), String> {
    let menu = build(&app, &labels, &recents).map_err(|e| {
        // The webview can only swallow this — a missing menu bar is survivable
        // and there is nowhere on screen to report it — so it has to be
        // findable in the log instead.
        log::error!("could not build the menu: {e}");
        e.to_string()
    })?;
    *app.state::<MenuState>().recents.lock().unwrap_or_else(|e| e.into_inner()) =
        recents.into_iter().map(|r| r.path).collect();
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

/// Turn a menu click into the same event the webview's own shortcut handlers
/// listen for. `close` is absent on purpose: it is a predefined item that
/// closes the window, which the close guard already intercepts.
pub fn on_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if let Some(index) = id.strip_prefix("recent:") {
        let Ok(index) = index.parse::<usize>() else { return };
        let path = app
            .state::<MenuState>()
            .recents
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(index)
            .cloned();
        if let Some(path) = path {
            let _ = app.emit("menu:action", serde_json::json!({ "id": "openRecent", "path": path }));
        }
        return;
    }
    // ⌘Q takes the same guarded path as the red button rather than emitting:
    // the answer to "quit with unsaved work?" must not depend on which control
    // the user reached for.
    if id == "quit" {
        crate::quit::request(app);
        return;
    }
    if matches!(id, "new" | "open" | "save" | "saveAs") {
        let _ = app.emit("menu:action", serde_json::json!({ "id": id }));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // `build` itself cannot be unit-tested: muda refuses to create a menu item
    // off the main thread, and cargo's harness runs every test on a worker.
    // What is testable is the part that is ours — the fallback, and the index
    // that keeps filesystem paths out of menu ids. Whether the menu bar
    // actually appears is on the human checklist in docs/document-model.md,
    // and a build failure is logged rather than swallowed (see set_menu_labels).

    #[test]
    fn a_label_the_webview_left_empty_falls_back_rather_than_rendering_blank() {
        assert_eq!(or("", "Save"), "Save");
        assert_eq!(or("   ", "Save"), "Save");
        assert_eq!(or("저장", "Save"), "저장");
    }
}
