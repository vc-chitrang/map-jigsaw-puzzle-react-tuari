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

/// Apply the window flags. Idempotent and silent, so it is safe to call twice.
fn enforce(window: &WebviewWindow) {
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
}

fn lock_down(window: &WebviewWindow) {
    enforce(window);
    if let Err(error) = window.set_focus() {
        log::error!("set_focus() failed: {error}");
    }

    log::info!("kiosk mode applied: fullscreen, undecorated, always-on-top");
    log_monitor(window);
}

/// Show the window. Called once the UI has painted, or by the startup timeout.
///
/// **The window is created hidden** (`visible: false` in `tauri.conf.json`) and
/// only revealed here. Without this the visitor saw the raw window for about a
/// second on launch: Tauri shows it at its declared 960x540 WITH decorations, then
/// `apply` promotes it to fullscreen from `setup` — which runs after the window is
/// already on screen — and WebView2 had not painted yet, so the frame was white.
/// Hiding it until the first paint removes both halves of that flash at once.
///
/// Idempotent: a second call is a no-op, which is what lets the readiness signal
/// and the timeout below race each other harmlessly.
pub fn reveal(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        log::error!("no window labelled \"main\"; cannot reveal it");
        return;
    };

    if matches!(window.is_visible(), Ok(true)) {
        return;
    }

    // Re-apply the flags BEFORE showing. Some of them do not stick on a hidden
    // window on Windows, and applying them after `show()` would put back the
    // small-decorated-frame flash this whole change exists to remove.
    if kiosk_requested() {
        enforce(&window);
    }

    if let Err(error) = window.show() {
        log::error!("show() failed: {error}");
    }
    if let Err(error) = window.set_focus() {
        log::error!("set_focus() on reveal failed: {error}");
    }

    log::info!("window revealed");
}

/// The renderer reports that it has painted, so the window can be shown.
///
/// Invoked from `src/main.tsx` after React's first frame.
#[tauri::command]
pub fn app_ready(app: tauri::AppHandle) {
    reveal(&app);
}

/// Log the display the kiosk actually landed on.
///
/// `set_fullscreen` fills whichever monitor the window is currently on, and the
/// window starts centred on the PRIMARY display. On a multi-monitor bench that is
/// not necessarily the kiosk panel, and the symptom — a fullscreen app on the
/// wrong screen — is indistinguishable from a config fault. Logging the size and
/// DPI scale makes it a one-line diagnosis, and confirms a 4K panel really is
/// reporting 3840x2160 rather than a scaled-down desktop resolution.
fn log_monitor(window: &WebviewWindow) {
    match window.current_monitor() {
        Ok(Some(monitor)) => {
            let size = monitor.size();
            log::info!(
                "kiosk display: {}x{} physical px, DPI scale {:.2}, name {:?}",
                size.width,
                size.height,
                monitor.scale_factor(),
                monitor.name()
            );
        }
        Ok(None) => log::warn!("no monitor reported for the kiosk window"),
        Err(error) => log::warn!("could not read the kiosk monitor: {error}"),
    }
}

/// Re-apply fullscreen and always-on-top.
///
/// Setting them once at startup is not enough on Windows. `HWND_TOPMOST` is lost
/// whenever another process takes the top slot — another app going fullscreen, a
/// UAC prompt, an Explorer restart, some installers and screen savers — and
/// fullscreen itself can be dropped by a display or resolution change. Without
/// this, "always in front of all apps" holds only until the first such event, and
/// the kiosk is then sitting behind something with no staff present.
///
/// Cheap and idempotent, so it is safe to call from a window event. Fullscreen is
/// checked before being set so the call is a no-op in the common case and cannot
/// recurse through the `Resized` event that setting it emits.
///
/// Deliberately does NOT call `set_focus()`. Grabbing focus back on every focus
/// loss fights UAC and system dialogs, and can leave a machine that is very hard
/// to service. Being topmost is enough: a tap lands on the kiosk and focus returns
/// with it, so the staff double-Esc still works.
pub fn reassert(app: &tauri::AppHandle) {
    if !kiosk_requested() {
        return;
    }

    // KEYBOARD GUARD: TabTip steals OS focus when it opens, which fires a
    // `Focused(false)` event here. If we reassert `always_on_top` at that
    // moment we instantly bury the keyboard behind the kiosk window.
    // Stand down while the keyboard is visible; normal kiosk protection
    // resumes the moment the visitor closes it (matches the stateless
    // IsCloaked check in the original Unity `OnScreenKeyboard.cs`).
    if crate::keyboard::is_tabtip_visible() {
        log::info!("[kiosk] TabTip keyboard visible — skipping reassert to avoid hiding it.");
        return;
    }

    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    if !matches!(window.is_fullscreen(), Ok(true)) {
        log::info!("kiosk fullscreen was lost; restoring");
        if let Err(error) = window.set_fullscreen(true) {
            log::error!("re-assert set_fullscreen(true) failed: {error}");
        }
    }

    if let Err(error) = window.set_always_on_top(true) {
        log::error!("re-assert set_always_on_top(true) failed: {error}");
    }
}
