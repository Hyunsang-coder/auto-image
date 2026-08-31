//! The close guard: stop a quit long enough to ask about unsaved work.
//!
//! Rust cannot answer "is there unsaved work" — the project lives in the
//! webview — so a close request is always parked and forwarded, and the webview
//! either answers straight away ("nothing to save, go ahead") or puts the
//! three-button prompt on screen.
//!
//! The hazard is the opposite of losing work: a wedged webview that never
//! answers would leave the user unable to quit at all. So the webview has to
//! prove it is alive within `ACK_TIMEOUT` — not decide within it. Once it has
//! acked, the user can take as long as they like, and a save that runs for ten
//! seconds is never cut short. If the ack never comes, the app exits: it could
//! not have saved anyway, and the mirror still holds the work.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Runtime};

/// How long the webview has to prove it is alive after being asked.
pub const ACK_TIMEOUT: Duration = Duration::from_secs(3);

/// What the window-close handler should do.
#[derive(Debug, PartialEq, Eq)]
pub enum OnClose {
    /// Forward to the webview and hold the window open.
    Ask(u64),
    /// A prompt is already up; hold the window open and say nothing more.
    AlreadyAsking,
    /// The answer is in and it was "quit" — let the close through.
    LetThrough,
}

#[derive(Default)]
pub struct QuitState {
    /// A close request is out with the webview and unanswered.
    asking: AtomicBool,
    /// The webview said it is alive, so the liveness timer no longer applies.
    acked: AtomicBool,
    /// Committed to exiting; further close events pass straight through.
    closing: AtomicBool,
    /// Bumped per ask, so a timer armed for an earlier request cannot kill a
    /// later one (close → cancel → close again inside the timeout window).
    generation: AtomicU64,
}

impl QuitState {
    pub fn on_close_requested(&self) -> OnClose {
        if self.closing.load(Ordering::Acquire) {
            return OnClose::LetThrough;
        }
        if self.asking.swap(true, Ordering::AcqRel) {
            return OnClose::AlreadyAsking;
        }
        self.acked.store(false, Ordering::Release);
        OnClose::Ask(self.generation.fetch_add(1, Ordering::AcqRel))
    }

    /// The webview received the request. Returns false for a late ack (the
    /// timer already fired, or nobody asked), which the caller ignores.
    pub fn on_ack(&self) -> bool {
        if !self.asking.load(Ordering::Acquire) {
            return false;
        }
        self.acked.store(true, Ordering::Release);
        true
    }

    /// True when the liveness timer should force the exit: still asking, never
    /// acked, and this is the timer for the ask that is actually outstanding.
    pub fn on_timeout(&self, generation: u64) -> bool {
        self.asking.load(Ordering::Acquire)
            && !self.acked.load(Ordering::Acquire)
            && self.generation.load(Ordering::Acquire) == generation + 1
    }

    /// The user's answer. True means exit now; false leaves the window open and
    /// re-arms for the next close request.
    pub fn on_answer(&self, close: bool) -> bool {
        self.asking.store(false, Ordering::Release);
        self.acked.store(false, Ordering::Release);
        if close {
            self.closing.store(true, Ordering::Release);
        }
        close
    }

    /// Force the exit path without an answer (liveness timeout).
    pub fn force(&self) {
        self.asking.store(false, Ordering::Release);
        self.closing.store(true, Ordering::Release);
    }
}

/// The ⌘Q menu item. There is no window event to hold back here, so a state
/// that has already been answered exits directly.
pub fn request<R: Runtime>(app: &AppHandle<R>) {
    match app.state::<QuitState>().on_close_requested() {
        OnClose::Ask(generation) => ask(app, generation),
        OnClose::AlreadyAsking => {}
        OnClose::LetThrough => exit(app),
    }
}

/// The red button and ⌘W. True means the close must be prevented while the
/// question is out with the webview.
pub fn on_window_close<R: Runtime>(app: &AppHandle<R>) -> bool {
    match app.state::<QuitState>().on_close_requested() {
        OnClose::Ask(generation) => {
            ask(app, generation);
            true
        }
        OnClose::AlreadyAsking => true,
        OnClose::LetThrough => false,
    }
}

/// Forward the close request and arm the liveness timer.
pub fn ask<R: Runtime>(app: &AppHandle<R>, generation: u64) {
    if app.emit("document:close-requested", ()).is_err() {
        // No window to ask — nothing can be unsaved that the user could act on.
        exit(app);
        return;
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(ACK_TIMEOUT).await;
        if handle.state::<QuitState>().on_timeout(generation) {
            log::warn!("editor window did not acknowledge the close request; exiting anyway");
            handle.state::<QuitState>().force();
            exit(&handle);
        }
    });
}

fn exit<R: Runtime>(app: &AppHandle<R>) {
    app.exit(0);
}

/// The webview confirms it got the request and is now asking the user.
#[tauri::command]
pub fn close_ack<R: Runtime>(app: AppHandle<R>) {
    app.state::<QuitState>().on_ack();
}

/// The user's answer to the three-button prompt (the webview has already saved
/// by the time it sends `close: true` after choosing 저장).
#[tauri::command]
pub fn confirm_close<R: Runtime>(app: AppHandle<R>, close: bool) {
    if app.state::<QuitState>().on_answer(close) {
        exit(&app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_close_asks_and_the_rest_are_swallowed() {
        let s = QuitState::default();
        assert_eq!(s.on_close_requested(), OnClose::Ask(0));
        // Mashing ⌘Q must not stack prompts.
        assert_eq!(s.on_close_requested(), OnClose::AlreadyAsking);
        assert_eq!(s.on_close_requested(), OnClose::AlreadyAsking);
    }

    #[test]
    fn cancelling_leaves_the_window_open_and_re_arms() {
        let s = QuitState::default();
        assert_eq!(s.on_close_requested(), OnClose::Ask(0));
        assert!(s.on_ack());
        assert!(!s.on_answer(false), "취소 must not exit");
        // And the next ⌘Q asks again rather than falling through.
        assert_eq!(s.on_close_requested(), OnClose::Ask(1));
    }

    #[test]
    fn answering_quit_exits_once_and_stops_guarding() {
        let s = QuitState::default();
        s.on_close_requested();
        assert!(s.on_answer(true));
        // The exit closes the window, which fires CloseRequested again; a
        // second prompt there would be a quit the user cannot complete.
        assert_eq!(s.on_close_requested(), OnClose::LetThrough);
    }

    #[test]
    fn a_wedged_webview_times_out_but_a_live_one_never_does() {
        let wedged = QuitState::default();
        let OnClose::Ask(generation) = wedged.on_close_requested() else { panic!() };
        assert!(wedged.on_timeout(generation), "no ack — the user must still be able to quit");

        let live = QuitState::default();
        let OnClose::Ask(generation) = live.on_close_requested() else { panic!() };
        assert!(live.on_ack());
        // The user is still reading the prompt, or a save is in flight. Neither
        // may be cut short.
        assert!(!live.on_timeout(generation));
    }

    #[test]
    fn a_timer_from_a_cancelled_request_cannot_kill_a_later_one() {
        let s = QuitState::default();
        let OnClose::Ask(first) = s.on_close_requested() else { panic!() };
        s.on_ack();
        s.on_answer(false); // cancelled
        let OnClose::Ask(second) = s.on_close_requested() else { panic!() };

        assert!(!s.on_timeout(first), "the stale timer must stand down");
        assert!(s.on_timeout(second));
    }

    #[test]
    fn an_ack_nobody_asked_for_is_ignored() {
        let s = QuitState::default();
        assert!(!s.on_ack());
    }
}
