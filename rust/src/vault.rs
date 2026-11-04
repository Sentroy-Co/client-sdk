//! Instance-scoped asynchronous Env Vault client.
//!
//! Secrets are kept in memory per client. Use `get_with_fallback` explicitly
//! when migrating applications that still depend on process environment values.
use std::{collections::HashMap, sync::Arc, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use tokio::sync::Mutex;
use crate::{Error, http::Http};

const DEFAULT_BASE_URL: &str = "https://sentroy.com";
const DEFAULT_TTL: Duration = Duration::from_secs(300);
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Deserialize)]
pub struct EnvVariable {
    pub key: String,
    pub value: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub public: bool,
}

#[derive(Deserialize)]
struct FetchResponse {
    project: String,
    environment: String,
    variables: Vec<EnvVariable>,
}

struct Cache {
    fetched_at: Instant,
    project: String,
    environment: String,
    variables: HashMap<String, EnvVariable>,
}

/// Explicit configuration. Credentials are never shared between client instances.
#[derive(Clone)]
pub struct VaultConfig {
    pub base_url: String,
    pub api_key: Option<String>,
    pub cache_ttl: Duration,
    pub timeout: Duration,
}

impl Default for VaultConfig {
    fn default() -> Self {
        Self {
            base_url: DEFAULT_BASE_URL.into(),
            api_key: None,
            cache_ttl: DEFAULT_TTL,
            timeout: DEFAULT_TIMEOUT,
        }
    }
}

impl VaultConfig {
    /// Opt in to the upstream environment-based bootstrap.
    pub fn from_env() -> Self {
        let base_url = ["NEXT_PUBLIC_SENTROY_ENV_API_URL", "SENTROY_ENV_API_URL", "NEXT_PUBLIC_CORE_APP_URL"]
            .iter().filter_map(|key| std::env::var(key).ok())
            .find(|value| !value.is_empty())
            .unwrap_or_else(|| DEFAULT_BASE_URL.into());
        Self { base_url, api_key: std::env::var("SENTROY_ENV_API_KEY").ok().filter(|v| !v.is_empty()), ..Self::default() }
    }
}

struct State {
    ttl: Duration,
    cache: Option<Cache>,
}

/// Clones share the same cache; independently constructed clients do not.
#[derive(Clone)]
pub struct VaultClient {
    http: Http,
    has_key: bool,
    state: Arc<Mutex<State>>,
}

impl VaultClient {
    pub fn new(config: VaultConfig) -> Result<Self, Error> {
        if let Some(key) = &config.api_key {
            if !key.starts_with("stk_env_") || key.len() == "stk_env_".len() {
                return Err(Error::InvalidInput("vault API key must start with stk_env_".into()));
            }
        }
        let has_key = config.api_key.is_some();
        let http = Http::new(config.base_url.trim_end_matches('/').to_owned(), config.api_key, config.timeout)?;
        Ok(Self { http, has_key, state: Arc::new(Mutex::new(State { ttl: config.cache_ttl, cache: None })) })
    }

    pub fn configure(config: VaultConfig) -> Result<Self, Error> { Self::new(config) }

    pub async fn set_cache_ttl(&self, ttl: Duration) {
        self.state.lock().await.ttl = ttl;
    }

    async fn fetch(&self) -> Result<Cache, Error> {
        if !self.has_key {
            return Err(Error::InvalidInput("vault API key is not configured".into()));
        }
        // Http unwraps the top-level data field when present.
        let response: FetchResponse = self.http.get("/api/env-vault/fetch", &[]).await?;
        Ok(Cache {
            fetched_at: Instant::now(),
            project: response.project,
            environment: response.environment,
            variables: response.variables.into_iter().map(|v| (v.key.clone(), v)).collect(),
        })
    }

    async fn ensure<'a>(&self, state: &'a mut State) -> Result<&'a Cache, Error> {
        let fresh = state.cache.as_ref().map(|c| c.fetched_at.elapsed() < state.ttl).unwrap_or(false);
        if !fresh {
            state.cache = Some(self.fetch().await?);
        }
        Ok(state.cache.as_ref().expect("cache just populated"))
    }

    /// Discard cached values. The next read fetches fresh data.
    pub async fn invalidate(&self) { self.state.lock().await.cache = None; }

    /// Discard cached values and immediately fetch a fresh snapshot.
    pub async fn refresh(&self) -> Result<(), Error> {
        let mut state = self.state.lock().await;
        state.cache = None;
        state.cache = Some(self.fetch().await?);
        Ok(())
    }

    pub async fn preload(&self) -> Result<(), Error> {
        let mut state = self.state.lock().await;
        self.ensure(&mut state).await?;
        Ok(())
    }

    pub async fn get(&self, key: &str) -> Result<Option<String>, Error> {
        let mut state = self.state.lock().await;
        Ok(self.ensure(&mut state).await?.variables.get(key).map(|v| v.value.clone()))
    }

    pub async fn get_or_throw(&self, key: &str) -> Result<String, Error> {
        let mut state = self.state.lock().await;
        let cache = self.ensure(&mut state).await?;
        cache.variables.get(key).map(|v| v.value.clone()).ok_or_else(|| {
            Error::InvalidInput(format!("required vault variable {key} is not defined (project={}, env={})", cache.project, cache.environment))
        })
    }

    /// Fall back to process environment on a missing key or vault failure.
    pub async fn get_with_fallback(&self, key: &str) -> Option<String> {
        if self.has_key {
            if let Ok(Some(value)) = self.get(key).await { return Some(value); }
        }
        std::env::var(key).ok()
    }

    pub async fn all(&self) -> Result<HashMap<String, String>, Error> {
        let mut state = self.state.lock().await;
        Ok(self.ensure(&mut state).await?.variables.iter().map(|(k, v)| (k.clone(), v.value.clone())).collect())
    }

    pub async fn public(&self) -> Result<HashMap<String, String>, Error> {
        let mut state = self.state.lock().await;
        Ok(self.ensure(&mut state).await?.variables.iter().filter(|(_, v)| v.public).map(|(k, v)| (k.clone(), v.value.clone())).collect())
    }

    /// Verify a webhook and invalidate the cache. Callers can use
    /// `verify_webhook` directly when they need custom change handling.
    pub async fn handle_webhook(&self, secret: &str, signature: &str, body: &[u8], max_age: Duration) -> Result<VaultWebhookPayload, WebhookError> {
        let payload = verify_webhook(secret, signature, body, max_age)?;
        self.invalidate().await;
        Ok(payload)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct VaultWebhookPayload {
    pub event: String,
    pub project: String,
    pub environment: String,
    pub action: String,
    pub keys: Vec<String>,
    /// Unix timestamp in milliseconds.
    pub timestamp: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WebhookError { InvalidSignature, InvalidBody, TimestampOutsideWindow }

impl WebhookError {
    pub fn status_code(self) -> u16 {
        match self { Self::InvalidBody => 400, _ => 401 }
    }
}
impl std::fmt::Display for WebhookError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::InvalidSignature => "missing, malformed, or invalid signature",
            Self::InvalidBody => "invalid JSON body",
            Self::TimestampOutsideWindow => "payload timestamp outside acceptable window",
        })
    }
}
impl std::error::Error for WebhookError {}

/// Verify HMAC-SHA256 over the exact received bytes, followed by the timestamp
/// window (five minutes by default). A zero duration disables the window.
pub fn verify_webhook(secret: &str, signature: &str, body: &[u8], max_age: Duration) -> Result<VaultWebhookPayload, WebhookError> {
    let hex = signature.strip_prefix("sha256=").or_else(|| signature.get(..7).filter(|p| p.eq_ignore_ascii_case("sha256=")).and_then(|_| signature.get(7..))).ok_or(WebhookError::InvalidSignature)?;
    if hex.len() != 64 { return Err(WebhookError::InvalidSignature); }
    let mut supplied = [0u8; 32];
    for (i, slot) in supplied.iter_mut().enumerate() {
        let part = hex.get(i * 2..i * 2 + 2).ok_or(WebhookError::InvalidSignature)?;
        *slot = u8::from_str_radix(part, 16).map_err(|_| WebhookError::InvalidSignature)?;
    }
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).map_err(|_| WebhookError::InvalidSignature)?;
    mac.update(body);
    mac.verify_slice(&supplied).map_err(|_| WebhookError::InvalidSignature)?;
    let payload: VaultWebhookPayload = serde_json::from_slice(body).map_err(|_| WebhookError::InvalidBody)?;
    if !max_age.is_zero() {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_| WebhookError::TimestampOutsideWindow)?.as_millis();
        let timestamp = u128::from(payload.timestamp);
        if timestamp > now || now - timestamp > max_age.as_millis() {
            return Err(WebhookError::TimestampOutsideWindow);
        }
    }
    Ok(payload)
}

/// The upstream default replay window.
pub const DEFAULT_WEBHOOK_MAX_AGE: Duration = Duration::from_secs(300);
