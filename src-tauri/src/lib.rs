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
        ])
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
