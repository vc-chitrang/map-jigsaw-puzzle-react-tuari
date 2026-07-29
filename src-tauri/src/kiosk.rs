//! Kiosk window mode.
//!
//! `tauri.conf.json` deliberately declares a *windowed, decorated* 540×960 window
//! and this module promotes it to kiosk mode at startup. 540×960 is 9:16, so it
//! is pixel-identical to the kiosk at a third of the scale, it fits a 1080p
//! developer display, and it matches the agreed pixel-parity capture size. It
//! never ships: release builds go fullscreen below. Doing it here rather than
//! in the config means `npm run tauri:dev` does not hand the developer a
//! fullscreen always-on-top window that covers their editor, while packaged
//! builds still lock down completely.
//!
//! Kiosk mode is applied when EITHER:
//!   * the build is a release build (`!debug_assertions`), or
//!   * `MAP_KIOSK=1` is set — lets a developer test the real thing on demand.
//!
//! The staff exit hatch (double-Esc) lives on the JavaScript side and is
//! installed before React renders — see src/kiosk/exitHatch.ts.

use tauri::{Manager, WebviewWindow};

const KIOSK_ENV_VAR: &str = "MAP_KIOSK";

fn kiosk_requested() -> bool {
    if !cfg!(debug_assertions) {
        return true;
    }
    matches!(
        std::env::var(KIOSK_ENV_VAR).as_deref(),
        Ok("1") | Ok("true") | Ok("TRUE")
    )
}

/// Promote the main window to kiosk mode.
///
/// Failures are logged, never fatal: a kiosk that opens windowed is recoverable
/// by staff, one that fails to open at all is not.
pub fn apply(app: &tauri::AppHandle) {
    if !kiosk_requested() {
        log::info!("kiosk mode off (debug build, {KIOSK_ENV_VAR} unset)");
        return;
    }

    let Some(window) = app.get_webview_window("main") else {
        log::error!("no window labelled \"main\"; cannot apply kiosk mode");
        return;
    };

    lock_down(&window);
}

fn lock_down(window: &WebviewWindow) {
    // Order matters: drop decorations before going fullscreen, or Windows can
    // leave a one-frame title bar artefact on the way in.
    if let Err(error) = window.set_decorations(false) {
        log::error!("set_decorations(false) failed: {error}");
    }
    if let Err(error) = window.set_resizable(false) {
        log::error!("set_resizable(false) failed: {error}");
    }
    if let Err(error) = window.set_fullscreen(true) {
        log::error!("set_fullscreen(true) failed: {error}");
    }
    if let Err(error) = window.set_always_on_top(true) {
        log::error!("set_always_on_top(true) failed: {error}");
    }
    if let Err(error) = window.set_focus() {
        log::error!("set_focus() failed: {error}");
    }

    log::info!("kiosk mode applied: fullscreen, undecorated, always-on-top");
}
