//! Collection API proxy.
//!
//! WHY THIS EXISTS: the API key must never reach renderer JavaScript, where it
//! would be readable from DevTools or a page script. The renderer asks for
//! *artwork*; only this module knows the credential (ADR-009).
//!
//! The response is passed through as raw JSON rather than re-modelled in Rust.
//! `src/api/types.ts` owns the schema; duplicating it here would give two places
//! to drift and would make an unexpected extra field a hard error.

use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use serde::Deserialize;
use tauri::ipc::Response;
use tauri::Manager;

use crate::config;

/// Kiosk-appropriate timeout: long enough for a slow gallery connection, short
/// enough that a visitor is not left staring at a spinner.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("the collection API is not configured")]
    NotConfigured,

    #[error("request failed: {0}")]
    Request(String),

    #[error("the collection API returned HTTP {0}")]
    Status(u16),

    #[error("the collection API returned a body that is not JSON")]
    Malformed,

    #[error("{0} is not an allowed image host")]
    HostNotAllowed(String),
}

// Tauri needs the error to serialise for the IPC boundary. The Display strings
// above are deliberately free of URLs and credentials, so they are safe to show.
impl serde::Serialize for ApiError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Query parameters, mirroring `BuildCollectionURL()` (docs/game-logic.md §8.4).
///
/// The renderer owns the sort-mode table, so `sort_by`/`sort_order` arrive as
/// resolved strings rather than an index.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CollectionParams {
    pub limit: Option<u32>,
    pub page: Option<u32>,
    pub q: Option<String>,
    pub department: Option<i64>,
    pub classification: Option<i64>,
    pub artist: Option<i64>,
    pub culture: Option<String>,
    pub date: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            // One pooled client for the process; rebuilding per request would
            // redo the TLS handshake every time.
            .user_agent(concat!("MAPJigsawPuzzle/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("failed to build the HTTP client")
    })
}

// ---------------------------------------------------------------------------
// OAuth token
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct LoginResponse {
    access_token: String,
    #[serde(default)]
    expires_in: u64,
}

struct CachedToken {
    value: String,
    /// When it stops being usable. `expires_in` is ~30 days in practice, so this
    /// realistically means "once per boot".
    expires_at: std::time::Instant,
}

/// Renew this long before the stated expiry, so a request can never race it.
const TOKEN_SAFETY_MARGIN: Duration = Duration::from_secs(300);

fn token_cache() -> &'static tokio::sync::Mutex<Option<CachedToken>> {
    static CACHE: OnceLock<tokio::sync::Mutex<Option<CachedToken>>> = OnceLock::new();
    CACHE.get_or_init(|| tokio::sync::Mutex::new(None))
}

/// Bearer token for the collection API, logging in on first use.
///
/// The lock is held across the network call on purpose: several screens can fetch
/// at once on boot, and without it each would perform its own login.
async fn bearer_token() -> Result<String, ApiError> {
    let config = config::get();
    if !config.oauth.is_usable() {
        return Err(ApiError::NotConfigured);
    }

    let mut cache = token_cache().lock().await;

    if let Some(cached) = cache.as_ref() {
        if std::time::Instant::now() < cached.expires_at {
            return Ok(cached.value.clone());
        }
        log::info!("collection API token expired; logging in again");
    }

    // Unity posts the LoginData object as JSON, not as a form body.
    let response = client()
        .post(config.login_endpoint())
        .json(&config.oauth)
        .send()
        .await
        .map_err(|error| ApiError::Request(scrub(&error)))?;

    let status = response.status();
    if !status.is_success() {
        log::error!("collection API login failed: HTTP {}", status.as_u16());
        return Err(ApiError::Status(status.as_u16()));
    }

    let login: LoginResponse = response.json().await.map_err(|_| ApiError::Malformed)?;
    if login.access_token.is_empty() {
        log::error!("collection API login returned no access_token");
        return Err(ApiError::Malformed);
    }

    // Length only, never the token.
    log::info!(
        "collection API login OK: token set ({} chars), expires_in {}s",
        login.access_token.len(),
        login.expires_in
    );

    let lifetime = Duration::from_secs(login.expires_in.max(60));
    let expires_at = std::time::Instant::now() + lifetime.saturating_sub(TOKEN_SAFETY_MARGIN);

    let token = login.access_token.clone();
    *cache = Some(CachedToken {
        value: login.access_token,
        expires_at,
    });

    Ok(token)
}

/// Push a parameter only when it carries a value, matching Unity's conditions:
/// ids count only when `> 0`, strings only when non-empty.
fn push_params(query: &mut Vec<(String, String)>, params: &CollectionParams) {
    query.push(("limit".into(), params.limit.unwrap_or(40).to_string()));
    query.push(("page".into(), params.page.unwrap_or(1).to_string()));

    let mut push_text = |name: &str, value: &Option<String>| {
        if let Some(text) = value {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                query.push((name.to_string(), trimmed.to_string()));
            }
        }
    };

    push_text("q", &params.q);
    push_text("culture", &params.culture);
    push_text("date", &params.date);
    push_text("sortBy", &params.sort_by);
    push_text("sortOrder", &params.sort_order);

    for (name, id) in [
        ("department", params.department),
        ("classification", params.classification),
        ("artist", params.artist),
    ] {
        if let Some(value) = id {
            if value > 0 {
                query.push((name.to_string(), value.to_string()));
            }
        }
    }
}

fn collection_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, ApiError> {
    app.path()
        .app_cache_dir()
        .map(|dir| dir.join("collection_cache"))
        .map_err(|_| ApiError::Request("no cache directory".into()))
}

fn collection_cache_key(params: &CollectionParams) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    format!("{:?}", params).hash(&mut hasher);
    format!("col_{:016x}.json", hasher.finish())
}

/// Fetch a page of the collection with disk caching and timing logs.
#[tauri::command]
pub async fn collection_fetch(
    app: tauri::AppHandle,
    params: CollectionParams,
) -> Result<serde_json::Value, ApiError> {
    let start_time = std::time::Instant::now();
    let config = config::get();
    if !config.is_usable() {
        return Err(ApiError::NotConfigured);
    }

    // 1. Check disk cache
    let cache_dir = collection_cache_dir(&app);
    if let Ok(dir) = &cache_dir {
        let cache_file = dir.join(collection_cache_key(&params));
        if let Ok(metadata) = std::fs::metadata(&cache_file) {
            if let Ok(modified) = metadata.modified() {
                // Cache valid for 24 hours
                if modified.elapsed().unwrap_or(Duration::from_secs(999999)) < Duration::from_secs(86400) {
                    if let Ok(bytes) = std::fs::read(&cache_file) {
                        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                            let elapsed = start_time.elapsed().as_millis();
                            log::info!("[collection_fetch CACHE HIT] loaded in {}ms", elapsed);
                            println!("[collection_fetch CACHE HIT] loaded in {}ms", elapsed);
                            return Ok(val);
                        }
                    }
                }
            }
        }
    }

    // 2. Cache miss — fetch from remote API
    log::info!("[collection_fetch CACHE MISS] fetching from remote API...");
    println!("[collection_fetch CACHE MISS] fetching from remote API...");
    let token = bearer_token().await?;

    let mut query: Vec<(String, String)> = vec![("key".into(), config.key.clone())];
    push_params(&mut query, &params);

    let response = client()
        .get(config.collection_endpoint())
        .bearer_auth(&token)
        .query(&query)
        .send()
        .await
        .map_err(|error| ApiError::Request(scrub(&error)))?;

    let status = response.status();
    if !status.is_success() {
        return Err(ApiError::Status(status.as_u16()));
    }

    let val = response
        .json::<serde_json::Value>()
        .await
        .map_err(|_| ApiError::Malformed)?;

    let elapsed = start_time.elapsed().as_millis();
    log::info!("[collection_fetch NETWORK SUCCESS] fetched in {}ms", elapsed);
    println!("[collection_fetch NETWORK SUCCESS] fetched in {}ms", elapsed);

    // 3. Persist to disk cache (best-effort)
    if let Ok(dir) = cache_dir {
        let cache_file = dir.join(collection_cache_key(&params));
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(bytes) = serde_json::to_vec(&val) {
            let _ = std::fs::write(cache_file, bytes);
        }
    }

    Ok(val)
}

/// A reqwest error rendered without any URL, so a leaked key cannot reach a log.
fn scrub(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "timed out".to_string()
    } else if error.is_connect() {
        "could not connect".to_string()
    } else if error.is_decode() {
        "could not decode the response".to_string()
    } else {
        "network error".to_string()
    }
}

/// Hosts `image_fetch` will talk to.
///
/// An allow-list, not a filter: without one this command is an open proxy that
/// any script in the web view could point at an internal address.
/// `ik.imagekit.io` is MAP's image CDN — `CardItemUI` builds thumbnail URLs
/// against it (see src/api/imagekit.ts).
const ALLOWED_IMAGE_HOSTS: &[&str] = &[
    "map-india.org",
    "i-am-puzzle.map-india.org",
    "ik.imagekit.io",
    // The collection's `primary_image` masters are served from here (verified
    // against the live API: primary_image = https://static.cumulus.co.in/...).
    // Without this, full-resolution artwork fetches are rejected as a bad host.
    "cumulus.co.in",
];

fn host_allowed(url: &reqwest::Url) -> bool {
    match url.host_str() {
        Some(host) => ALLOWED_IMAGE_HOSTS
            .iter()
            .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}"))),
        None => false,
    }
}

/// A filesystem-safe cache filename derived from the full URL.
///
/// The URL is hashed (SipHash via `DefaultHasher`, deterministic across runs for
/// a fixed key) so two different renders of the same artwork — the w600 preview
/// and the full master share a basename but differ in URL — never collide. The
/// original extension is preserved for tidiness only; nothing reads it back.
fn cache_name(url: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    url.hash(&mut hasher);

    let ext = url
        .split(['?', '#'])
        .next()
        .unwrap_or(url)
        .rsplit('.')
        .next()
        .filter(|e| !e.is_empty() && e.len() <= 5 && e.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or("img");

    format!("{:016x}.{}", hasher.finish(), ext)
}

/// The on-disk cache directory, `%LOCALAPPDATA%\<identifier>\cache\image-cache`
/// on Windows. Created lazily by the caller.
fn cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, ApiError> {
    app.path()
        .app_cache_dir()
        .map(|dir| dir.join("image-cache"))
        .map_err(|_| ApiError::Request("no cache directory".into()))
}

/// Fetch an artwork image as bytes, caching it under app data.
///
/// Needed because the board crops the artwork to a square on a `<canvas>`, and a
/// cross-origin image without CORS headers taints the canvas and makes
/// `toBlob()` throw. Fetching here and handing over bytes side-steps CORS
/// entirely; the renderer turns them into a blob URL.
///
/// CACHING (P-image-cache): the first fetch of a URL is downloaded and written
/// to the cache directory; every later fetch of the SAME URL is served from disk
/// without touching the network. This backs both the low-res grid previews
/// (ImageKit w600) and the full-resolution master loaded when a card is picked —
/// each is a distinct URL, so each is cached independently. No eviction yet: the
/// previews are ~90 KB and masters are only cached when actually opened.
#[tauri::command]
pub async fn image_fetch(app: tauri::AppHandle, url: String) -> Result<Response, ApiError> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| ApiError::Request("bad URL".into()))?;

    // DEV/TEST ONLY — the local upload rig has no HTTPS in front of it yet.
    // Scoped to the exact host+port+scheme (not "any http host"), so it can't
    // be used to reach an arbitrary internal address the way a blanket http
    // allowance could. Every other host still goes through the https + host
    // allow-list checks below. Remove once the upload server has a real TLS
    // cert (2026-08-13, per client request — see docs/decisions.md).
    let is_dev_test_upload_host = parsed.scheme() == "http"
        && parsed.host_str() == Some("192.168.1.28")
        && parsed.port() == Some(8000);

    if !is_dev_test_upload_host {
        if parsed.scheme() != "https" {
            return Err(ApiError::HostNotAllowed(parsed.scheme().to_string()));
        }
        if !host_allowed(&parsed) {
            return Err(ApiError::HostNotAllowed(
                parsed.host_str().unwrap_or("unknown").to_string(),
            ));
        }
    }

    // 1. Serve from the cache if we already have it.
    let dir = cache_dir(&app)?;
    let path = dir.join(cache_name(&url));
    if let Ok(bytes) = std::fs::read(&path) {
        if !bytes.is_empty() {
            log::info!("image cache hit ({} bytes)", bytes.len());
            return Ok(Response::new(bytes));
        }
    }

    // 2. Miss — download it.
    let response = client()
        .get(parsed)
        .send()
        .await
        .map_err(|error| ApiError::Request(scrub(&error)))?;

    let status = response.status();
    if !status.is_success() {
        return Err(ApiError::Status(status.as_u16()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| ApiError::Request(scrub(&error)))?;

    // 3. Persist it, best-effort. A cache write failure must not fail the fetch:
    //    write to a temp file first, then rename, so a crash mid-write cannot
    //    leave a truncated file that a later run would serve as valid.
    if let Err(error) = std::fs::create_dir_all(&dir) {
        log::warn!("could not create image cache dir: {error}");
    } else {
        let tmp = path.with_extension("part");
        match std::fs::write(&tmp, &bytes) {
            Ok(()) => {
                if let Err(error) = std::fs::rename(&tmp, &path) {
                    log::warn!("could not commit cached image: {error}");
                    let _ = std::fs::remove_file(&tmp);
                } else {
                    log::info!("image cached ({} bytes)", bytes.len());
                }
            }
            Err(error) => log::warn!("could not write cached image: {error}"),
        }
    }

    Ok(Response::new(bytes.to_vec()))
}

/// Non-secret runtime config the renderer legitimately needs.
#[derive(serde::Serialize)]
pub struct PublicConfig {
    /// Socket.IO endpoint for QR uploads (Phase 4).
    pub socket_url: String,
    /// Whether the collection API is configured, so the UI can pick the offline
    /// path up front instead of after a failed request.
    pub collection_available: bool,
    /// Full URL the QR code encodes, before this kiosk's `?k=<token>` is
    /// appended. Empty when the upload feature is not configured server-side.
    pub upload_url: String,
}

#[tauri::command]
pub fn public_config() -> PublicConfig {
    let config = config::get();
    PublicConfig {
        socket_url: config.socket_url.clone(),
        collection_available: config.is_usable(),
        upload_url: config.upload_url.clone(),
    }
}
