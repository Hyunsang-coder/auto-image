//! "Is there a newer build?" — one GET against the GitHub releases API.
//!
//! Deliberately in Rust rather than the webview: the page's CSP is
//! `connect-src 'self'`, and widening it (or re-adding the HTTP plugin) would
//! hand every script in the webview a way out to the network for the sake of one
//! request. Deliberately `curl` rather than an HTTP crate: it ships with macOS —
//! the only platform this app runs on — so a once-per-launch check costs no TLS
//! stack, no new supply chain, and nothing to keep patched.

use std::process::Command;

use serde_json::{json, Value};
use tauri::AppHandle;

const LATEST_API: &str = "https://api.github.com/repos/Hyunsang-coder/auto-image/releases/latest";
pub const RELEASES_PAGE: &str = "https://github.com/Hyunsang-coder/auto-image/releases/latest";

/// `v0.1.11` → `[0, 1, 11]`. Anything unparseable becomes 0, so a tag that
/// breaks the convention can never *look* newer than a real version.
fn parts(version: &str) -> Vec<u32> {
    version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .map(|p| {
            p.chars()
                .take_while(char::is_ascii_digit)
                .collect::<String>()
                .parse()
                .unwrap_or(0)
        })
        .collect()
}

fn is_newer(latest: &str, current: &str) -> bool {
    let (a, b) = (parts(latest), parts(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Value, String> {
    let current = app.package_info().version.to_string();

    let out = tauri::async_runtime::spawn_blocking(|| {
        Command::new("curl")
            .args([
                "-sSL",
                "--max-time",
                "10",
                "-H",
                "Accept: application/vnd.github+json",
                // GitHub rejects API calls without one.
                "-H",
                "User-Agent: ScreenshotStudio",
                LATEST_API,
            ])
            .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("could not run curl: {e}"))?;

    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }

    let body: Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    let latest = body
        .get("tag_name")
        .and_then(Value::as_str)
        // A rate-limited or errored response is JSON too, just without a tag.
        .ok_or_else(|| {
            body.get("message")
                .and_then(Value::as_str)
                .unwrap_or("the releases API returned no tag")
                .to_string()
        })?;

    Ok(json!({
        "current": current,
        "latest": latest.trim_start_matches('v'),
        "newer": is_newer(latest, &current),
        "url": RELEASES_PAGE,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions_field_by_field() {
        assert!(is_newer("v0.1.2", "0.1.1"));
        assert!(is_newer("0.2.0", "0.1.11"));
        assert!(is_newer("v1.0.0", "0.9.9"));
        assert!(!is_newer("v0.1.1", "0.1.1"));
        assert!(!is_newer("v0.1.0", "0.1.1"));
    }

    #[test]
    fn a_longer_version_only_wins_on_a_nonzero_tail() {
        assert!(is_newer("0.1.1.1", "0.1.1"));
        assert!(!is_newer("0.1.1.0", "0.1.1"));
    }

    #[test]
    fn junk_never_looks_like_an_upgrade() {
        assert!(!is_newer("nightly", "0.1.1"));
        assert!(!is_newer("", "0.1.1"));
        // A suffix on an equal version is not an upgrade either.
        assert!(!is_newer("v0.1.1-beta", "0.1.1"));
    }
}
