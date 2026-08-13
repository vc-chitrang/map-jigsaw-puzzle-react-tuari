//! Collection API configuration.
//!
//! SECURITY: the API key lives here and NOWHERE else. It is never sent to the
//! renderer, never returned from a command, and never logged — the log lines in
//! this module deliberately report only whether a value is present and how long
//! it is (docs/game-logic.md §8.1, ADR-009).
//!
//! Resolution order, first hit wins:
//!   1. process environment (CI, or an operator-set system variable)
//!   2. `.env` beside the executable   <- how the kiosk is configured
//!   3. `.env` in the crate directory  <- how development works
//!
//! Putting (2) ahead of a compile-time value is deliberate: it lets the operator
//! rotate the key by editing one file, with no rebuild.

use std::path::PathBuf;
use std::sync::OnceLock;

/// OAuth2 client-credentials login.
///
/// VERIFIED 2026-07-29 against the live API: the collection endpoint returns
/// HTTP 500 with only `?key=`, and HTTP 200 once an `Authorization: Bearer` header
/// is present. The login step is REQUIRED, not optional.
///
/// Unity POSTs this object as JSON (`JsonUtility.ToJson(loginData)`) to
/// `oauth/token`; the credentials live on the LoginHandler component in the scene,
/// not in code.
#[derive(Debug, Clone, serde::Serialize)]
pub struct OAuthCredentials {
    pub grant_type: String,
    pub client_id: String,
    pub client_secret: String,
    /// Empty for the client-credentials grant, but sent because Unity sends it.
    pub username: String,
    pub password: String,
    pub scope: String,
}

impl OAuthCredentials {
    pub fn is_usable(&self) -> bool {
        !self.client_id.is_empty() && !self.client_secret.is_empty()
    }
}

#[derive(Debug, Clone)]
pub struct ApiConfig {
    pub base_url: String,
    pub key: String,
    pub collection_path: String,
    pub login_path: String,
    pub socket_url: String,
    /// Full URL the QR code encodes (before the `?k=` token is appended). Empty
    /// when unconfigured — there is no safe default, unlike `socket_url`, because
    /// the path segment is a deliberately obfuscated, server-assigned value (see
    /// the doc comment in `.env.example`).
    pub upload_url: String,
    pub oauth: OAuthCredentials,
}

impl ApiConfig {
    /// True when everything needed for a successful collection request is present:
    /// base URL, key AND OAuth credentials.
    pub fn is_usable(&self) -> bool {
        !self.base_url.is_empty() && !self.key.is_empty() && self.oauth.is_usable()
    }

    fn endpoint(&self, path: &str) -> String {
        let base = self.base_url.trim_end_matches('/');
        let path = path.trim_start_matches('/');
        format!("{base}/{path}")
    }

    pub fn collection_endpoint(&self) -> String {
        self.endpoint(&self.collection_path)
    }

    pub fn login_endpoint(&self) -> String {
        self.endpoint(&self.login_path)
    }
}

fn env_file_candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // Beside the executable — the kiosk deployment.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            paths.push(dir.join(".env"));
        }
    }

    // The crate directory — development. `CARGO_MANIFEST_DIR` is baked in at
    // compile time, so this only resolves on the build machine.
    paths.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".env"));

    paths
}

fn load_env_files() {
    for path in env_file_candidates() {
        if !path.exists() {
            continue;
        }
        match dotenvy::from_path(&path) {
            // Deliberately logs the PATH, never the contents.
            Ok(()) => log::info!("loaded API config from {}", path.display()),
            Err(error) => log::warn!("could not read {}: {error}", path.display()),
        }
    }
}

fn var(name: &str, fallback_compile_time: Option<&'static str>) -> String {
    let runtime_val = std::env::var(name).unwrap_or_default();
    let runtime_trimmed = runtime_val.trim();
    if !runtime_trimmed.is_empty() {
        return runtime_trimmed.to_string();
    }
    fallback_compile_time.unwrap_or_default().trim().to_string()
}

fn load() -> ApiConfig {
    load_env_files();

    let config = ApiConfig {
        base_url: var("MAP_API_BASE_URL", option_env!("MAP_API_BASE_URL")),
        key: var("MAP_API_KEY", option_env!("MAP_API_KEY")),
        collection_path: {
            let path = var("MAP_API_COLLECTION_PATH", option_env!("MAP_API_COLLECTION_PATH"));
            if path.is_empty() {
                "api/public_hook/v1/artwork".to_string()
            } else {
                path
            }
        },
        login_path: {
            let path = var("MAP_API_LOGIN_PATH", option_env!("MAP_API_LOGIN_PATH"));
            if path.is_empty() {
                "oauth/token".to_string()
            } else {
                path
            }
        },
        socket_url: {
            let url = var("MAP_SOCKET_URL", option_env!("MAP_SOCKET_URL"));
            if url.is_empty() {
                "https://i-am-puzzle.map-india.org".to_string()
            } else {
                url
            }
        },
        upload_url: var("MAP_UPLOAD_URL", option_env!("MAP_UPLOAD_URL")),
        oauth: OAuthCredentials {
            grant_type: {
                let grant = var("MAP_OAUTH_GRANT_TYPE", option_env!("MAP_OAUTH_GRANT_TYPE"));
                if grant.is_empty() {
                    "client_credentials".to_string()
                } else {
                    grant
                }
            },
            client_id: var("MAP_OAUTH_CLIENT_ID", option_env!("MAP_OAUTH_CLIENT_ID")),
            client_secret: var("MAP_OAUTH_CLIENT_SECRET", option_env!("MAP_OAUTH_CLIENT_SECRET")),
            username: var("MAP_OAUTH_USERNAME", option_env!("MAP_OAUTH_USERNAME")),
            password: var("MAP_OAUTH_PASSWORD", option_env!("MAP_OAUTH_PASSWORD")),
            scope: var("MAP_OAUTH_SCOPE", option_env!("MAP_OAUTH_SCOPE")),
        },
    };

    // Presence and length only. Never the value.
    let describe = |value: &str| {
        if value.is_empty() {
            "MISSING".to_string()
        } else {
            format!("set ({} chars)", value.len())
        }
    };

    log::info!(
        "API config: base_url {}, key {}, client_id {}, client_secret {}, collection_path {}, grant {}, upload_url {}",
        describe(&config.base_url),
        describe(&config.key),
        describe(&config.oauth.client_id),
        describe(&config.oauth.client_secret),
        config.collection_path,
        config.oauth.grant_type,
        describe(&config.upload_url),
    );

    if !config.is_usable() {
        log::warn!(
            "collection API is not configured; the app will fall back to the bundled offline artwork"
        );
    }

    config
}

/// Process-wide config, loaded once.
pub fn get() -> &'static ApiConfig {
    static CONFIG: OnceLock<ApiConfig> = OnceLock::new();
    CONFIG.get_or_init(load)
}
