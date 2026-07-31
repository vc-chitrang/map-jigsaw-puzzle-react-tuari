//! MAP Sliding Puzzle kiosk — Tauri shell.
//!
//! Responsibilities of the Rust side (docs/architecture.md §2.1):
//!   * kiosk window configuration                        — `kiosk` module
//!   * `collection_fetch` — holds the API base URL + key  — Phase 3
//!   * `image_fetch`      — CORS-free + disk cache        — Phase 3
//!   * high-score store                                   — Phase 1/5
//!
//! The API key must never reach the renderer or DevTools, which is the whole
//! reason the collection request is proxied here rather than issued from JS.

mod api;
mod config;
mod kiosk;
mod keyboard;

// `Manager` brings `app_handle()` into scope for the window-event handler below.
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            api::collection_fetch,
            api::image_fetch,
            api::public_config,
            keyboard::open_tabtip,
            keyboard::close_tabtip,
        ])
        // Keep the kiosk on top for the whole run, not just at startup.
        //
        // Windows takes `HWND_TOPMOST` away whenever another process claims it
        // (another app going fullscreen, a UAC prompt, an Explorer restart), and a
        // display or resolution change can drop fullscreen. Both arrive as one of
        // these two events, so re-asserting here is what makes "always fullscreen,
        // always in front" survive an unattended run rather than holding only until
        // the first interruption. `kiosk::reassert` is gated on kiosk mode and is a
        // no-op when nothing was lost.
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Focused(false) | tauri::WindowEvent::Resized(_) => {
                kiosk::reassert(window.app_handle());
            }
            _ => {}
        })
        .setup(|app| {
            kiosk::apply(app.handle());
            // Resolve the config at startup so a misconfiguration shows up in the
            // log immediately rather than on the visitor's first tap.
            let _ = config::get();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the MAP Jigsaw Puzzle shell");
}
