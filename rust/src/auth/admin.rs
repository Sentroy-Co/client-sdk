use std::{sync::Arc, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use serde_json::{json, Value};
use tokio::sync::Mutex;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use crate::{Error, Result};
use super::{client::auth_error, LoginOutcome, SentroyAuth};

/// Server-side, request-scoped administrator. Keep the project API key secret.
#[derive(Clone)]
pub struct SentroyAuthAdmin {
    client: SentroyAuth,
    api_key: String,
    jwks_ttl: Duration,
    jwks: Arc<Mutex<Option<(Instant, Value)>>>,
}
impl std::fmt::Debug for SentroyAuthAdmin {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SentroyAuthAdmin").field("client", &self.client)
            .field("api_key", &"[REDACTED]").finish()
    }
}
impl SentroyAuthAdmin {
    pub fn new(base: impl Into<String>, project_slug: impl Into<String>, api_key: impl Into<String>, timeout: Duration, jwks_ttl: Duration) -> Result<Self> {
        let api_key = api_key.into();
        if api_key.is_empty() { return Err(Error::InvalidInput("API key must not be empty".into())); }
        let client = SentroyAuth::new(base, project_slug, Some(api_key.clone()), timeout)?;
        Ok(Self { client, api_key, jwks_ttl, jwks: Arc::new(Mutex::new(None)) })
    }
    fn path(&self, p: &str) -> String {
        self.client.path(p)
    }
    async fn post(&self, p: &str, body: Value) -> Result<Value> {
        self.client.http.post(&self.path(p), body).await.map_err(auth_error)
    }
    pub async fn create_user(&self, input: Value) -> Result<Value> { self.post("/signup", input).await }
    pub async fn sign_in(&self, input: Value) -> Result<LoginOutcome> {
        let v = self.post("/login", input).await?;
        if v.get("mfaRequired") == Some(&Value::Bool(true)) { Ok(LoginOutcome::Mfa(v)) } else { Ok(LoginOutcome::Tokens(v)) }
    }
    pub async fn verify_mfa(&self, input: Value) -> Result<Value> { self.post("/login/mfa/verify", input).await }
    pub async fn refresh(&self, token: &str) -> Result<Value> { self.post("/refresh", json!({"refreshToken":token})).await }
    pub async fn sign_out(&self, token: &str) -> Result<Value> { self.post("/logout", json!({"refreshToken":token})).await }
    pub async fn verify_email(&self, token: &str) -> Result<Value> { self.post("/verify-email", json!({"token":token})).await }
    pub async fn request_password_reset(&self, email: &str) -> Result<Value> { self.post("/password-reset/request", json!({"email":email})).await }
    pub async fn confirm_password_reset(&self, input: Value) -> Result<Value> { self.post("/password-reset/confirm", input).await }
    pub async fn send_magic_link(&self, input: Value) -> Result<Value> { self.post("/magic-link/request", input).await }
    pub async fn consume_magic_link(&self, token: &str) -> Result<Value> { self.post("/magic-link/consume", json!({"token":token})).await }
    pub async fn accept_invitation(&self, input: Value) -> Result<Value> { self.post("/invitation/accept", input).await }
    pub async fn get_user(&self, token: &str) -> Result<Value> {
        self.client.http.with_token(Some(token.to_owned()))?.get(&self.path("/me"), &[]).await.map_err(auth_error)
    }
    pub async fn get_userinfo(&self, token: &str) -> Result<Value> {
        self.client.http.with_token(Some(token.to_owned()))?.get(&self.path("/userinfo"), &[]).await.map_err(auth_error)
    }
    /// The reference explicitly has no public admin user-list endpoint.
    pub fn list_users(&self) -> Result<Value> {
        Err(Error::InvalidInput("admin users.list requires the session-authenticated dashboard API; no public API is available".into()))
    }
    pub async fn invalidate_jwks_cache(&self) { *self.jwks.lock().await = None; }
    async fn jwks(&self) -> Result<Value> {
        let mut cache = self.jwks.lock().await;
        if let Some((at, keys)) = cache.as_ref() {
            if at.elapsed() < self.jwks_ttl { return Ok(keys.clone()); }
        }
        // Always use the configured auth origin; never follow a JWT-supplied URL.
        let v: Value = self.client.http.get(&self.path("/jwks.json"), &[]).await.map_err(auth_error)?;
        *cache = Some((Instant::now(), v.clone()));
        Ok(v)
    }
    /// Verify an RS256 signature against the configured project's JWKS, then
    /// require the configured issuer and the reference API-key audience rule.
    pub async fn verify_id_token(&self, token: &str) -> Result<Value> {
        let invalid = |s: &str| Error::InvalidResponse(s.to_owned());
        let header = decode_header(token).map_err(|_| invalid("Malformed JWT"))?;
        if header.alg != Algorithm::RS256 { return Err(invalid("Only RS256 supported")); }
        let jwks = self.jwks().await?;
        let keys = jwks.get("keys").and_then(Value::as_array).ok_or_else(|| invalid("Malformed JWKS"))?;
        let kid = header.kid.as_deref().filter(|s| !s.is_empty()).ok_or_else(|| invalid("Missing key id"))?;
        let mut matching = keys.iter().filter(|k| k.get("kid").and_then(Value::as_str) == Some(kid));
        let key = matching.next().ok_or_else(|| invalid("Unknown key id"))?;
        if matching.next().is_some() { return Err(invalid("Ambiguous key id")); }
        if key.get("alg").is_some_and(|v| v.as_str() != Some("RS256"))
            || key.get("use").is_some_and(|v| v.as_str() != Some("sig")) {
            return Err(invalid("JWKS key is not an RS256 signing key"));
        }
        if let Some(ops) = key.get("key_ops") {
            if !ops.as_array().is_some_and(|ops| ops.iter().any(|v| v.as_str() == Some("verify"))) {
                return Err(invalid("JWKS key cannot verify"));
            }
        }
        if key.get("kty").and_then(Value::as_str) != Some("RSA") { return Err(invalid("JWKS key is not RSA")); }
        let n = key.get("n").and_then(Value::as_str).ok_or_else(|| invalid("Missing RSA modulus"))?;
        let e = key.get("e").and_then(Value::as_str).ok_or_else(|| invalid("Missing RSA exponent"))?;
        let decoding_key = DecodingKey::from_rsa_components(n, e).map_err(|_| invalid("Invalid RSA key"))?;
        let mut validation = Validation::new(Algorithm::RS256);
        // Validate the exact reference semantics below, after signature verification.
        validation.required_spec_claims.clear();
        validation.validate_exp = false;
        validation.validate_aud = false;
        let claims = decode::<Value>(token, &decoding_key, &validation)
            .map_err(|_| invalid("JWT signature or format invalid"))?.claims;
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_| invalid("System clock before epoch"))?.as_secs_f64();
        let exp = claims.get("exp").and_then(Value::as_f64).ok_or_else(|| invalid("Token expired"))?;
        if !exp.is_finite() || exp < now { return Err(invalid("Token expired")); }
        let iss = claims.get("iss").and_then(Value::as_str).ok_or_else(|| invalid("Issuer mismatch"))?;
        if iss != format!("{}/p/{}", self.client.base, self.client.slug) { return Err(invalid("Issuer mismatch")); }
        let aud = claims.get("aud").and_then(Value::as_str).ok_or_else(|| invalid("Audience mismatch"))?;
        if self.api_key.get(..12) != Some(aud) { return Err(invalid("Audience mismatch")); }
        Ok(claims)
    }
}
