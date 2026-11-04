use std::{sync::Arc, time::Duration};
use serde_json::{json, Value};
use tokio::sync::Mutex;
use crate::{Error, Result, http::{Http, segment}};
use super::{LoginOutcome, Session};

/// Portable identity client. No browser, local storage, timers or WebAuthn runtime is supplied.
/// Clones share one in-memory session and serialize refreshes to avoid rotating a token twice.
#[derive(Clone)]
pub struct SentroyAuth {
    pub(crate) http: Http,
    pub(crate) base: String,
    pub(crate) slug: String,
    slug_encoded: String,
    session: Arc<Mutex<Option<Session>>>,
}
impl std::fmt::Debug for SentroyAuth {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SentroyAuth").field("base", &self.base).field("slug", &self.slug)
            .field("session", &"[REDACTED]").finish()
    }
}
pub(crate) fn auth_error(e: Error) -> Error {
    match e {
        Error::Http { status, message: _, body } => Error::Auth {
            code: body.get("error").and_then(Value::as_str).unwrap_or("http_error").to_string(),
            description: body.get("error_description").and_then(Value::as_str)
                .map(str::to_string).unwrap_or_else(|| format!("HTTP {status}")),
            status: Some(status),
        }, e => e,
    }
}
impl SentroyAuth {
    pub fn new(base: impl Into<String>, project_slug: impl Into<String>, api_key: Option<String>, timeout: Duration) -> Result<Self> {
        let base = base.into().trim_end_matches('/').to_string();
        let slug = project_slug.into();
        if slug.is_empty() { return Err(Error::InvalidInput("project slug must not be empty".into())); }
        let slug_encoded = segment(&slug)?;
        let url = url::Url::parse(&base).map_err(|e| Error::InvalidInput(e.to_string()))?;
        if !matches!(url.scheme(), "https" | "http") || url.host_str().is_none() || url.query().is_some() || url.fragment().is_some() || !url.username().is_empty() || url.password().is_some() {
            return Err(Error::InvalidInput("invalid auth base URL".into()));
        }
        let http = Http::new(base.clone(), api_key, timeout)?;
        Ok(Self { http, base, slug, slug_encoded, session: Arc::new(Mutex::new(None)) })
    }
    pub(crate) fn path(&self, p: &str) -> String { format!("/api/v1/auth/{}{}", self.slug_encoded, p) }
    async fn post(&self, p: &str, body: Value) -> Result<Value> {
        self.http.post(&self.path(p), body).await.map_err(auth_error)
    }
    async fn bearer(&self) -> Result<Http> {
        let token = self.session.lock().await.as_ref().map(|s| s.access_token.clone())
            .ok_or_else(|| Error::InvalidInput("Not signed in — access token missing".into()))?;
        self.http.with_token(Some(token))
    }
    async fn get_auth(&self, p: &str) -> Result<Value> {
        self.bearer().await?.get(&self.path(p), &[]).await.map_err(auth_error)
    }
    async fn post_auth(&self, p: &str, body: Value) -> Result<Value> {
        self.bearer().await?.post(&self.path(p), body).await.map_err(auth_error)
    }
    async fn delete_auth(&self, p: &str) -> Result<()> {
        let _: Value = self.bearer().await?.delete(&self.path(p), &[]).await.map_err(auth_error)?;
        Ok(())
    }
    async fn persist_login(&self, v: &Value) -> Result<()> {
        let session: Session = serde_json::from_value(v.clone()).map_err(|e| Error::InvalidResponse(e.to_string()))?;
        self.set_session(session).await;
        Ok(())
    }
    pub async fn session(&self) -> Option<Session> { self.session.lock().await.clone() }
    pub async fn set_session(&self, session: Session) { *self.session.lock().await = Some(session); }
    pub async fn clear_session(&self) { *self.session.lock().await = None; }
    pub async fn sign_up(&self, input: Value) -> Result<Value> {
        let v = self.post("/signup", input).await?;
        if v.get("accessToken").and_then(Value::as_str).is_some() && v.get("refreshToken").and_then(Value::as_str).is_some() { self.persist_login(&v).await?; }
        Ok(v)
    }
    pub async fn sign_in(&self, input: Value) -> Result<LoginOutcome> {
        let v = self.post("/login", input).await?;
        if v.get("mfaRequired") == Some(&Value::Bool(true)) { Ok(LoginOutcome::Mfa(v)) }
        else { self.persist_login(&v).await?; Ok(LoginOutcome::Tokens(v)) }
    }
    pub async fn verify_mfa(&self, input: Value) -> Result<Value> {
        let v = self.post("/login/mfa/verify", input).await?; self.persist_login(&v).await?; Ok(v)
    }
    /// One refresh request, with no replay on transport or server failure.
    /// An indeterminate failure requires application-specific reconciliation.
    pub async fn refresh(&self) -> Result<Value> {
        let mut guard = self.session.lock().await;
        let old = guard.as_ref().ok_or_else(|| Error::InvalidInput("Not signed in".into()))?;
        let v = self.post("/refresh", json!({"refreshToken": old.refresh_token})).await?;
        let access = v.get("accessToken").and_then(Value::as_str).ok_or_else(|| Error::InvalidResponse("missing accessToken".into()))?;
        let refresh = v.get("refreshToken").and_then(Value::as_str).ok_or_else(|| Error::InvalidResponse("missing refreshToken".into()))?;
        let s = guard.as_mut().expect("session held during refresh");
        s.access_token = access.to_owned(); s.refresh_token = refresh.to_owned();
        Ok(v)
    }
    pub async fn sign_out(&self) {
        let old = self.session.lock().await.take();
        if let Some(s) = old { let _ = self.post("/logout", json!({"refreshToken": s.refresh_token})).await; }
    }
    pub async fn send_password_reset(&self, email: &str) -> Result<Value> { self.post("/password-reset/request", json!({"email":email})).await }
    pub async fn confirm_password_reset(&self, input: Value) -> Result<Value> { self.post("/password-reset/confirm", input).await }
    pub async fn verify_email(&self, token: &str) -> Result<Value> { self.post("/verify-email", json!({"token":token})).await }
    pub async fn send_magic_link(&self, input: Value) -> Result<Value> { self.post("/magic-link/request", input).await }
    pub async fn consume_magic_link(&self, token: &str) -> Result<Value> {
        let v = self.post("/magic-link/consume", json!({"token":token})).await?; self.persist_login(&v).await?; Ok(v)
    }
    pub async fn accept_invitation(&self, input: Value) -> Result<Value> {
        let v = self.post("/invitation/accept", input).await?; self.persist_login(&v).await?; Ok(v)
    }
    /// The server's social URL has no state or PKCE parameters in the reference API.
    /// Callers must secure the redirect at the application level.
    pub fn social_authorize_url(&self, provider: &str, redirect_uri: Option<&str>, remember_me: bool) -> Result<String> {
        if !["google","github","facebook","microsoft","twitter","apple"].contains(&provider) {
            return Err(Error::InvalidInput("unsupported social provider".into()));
        }
        let mut url = url::Url::parse(&format!("{}{}/social/{}/authorize", self.base, self.path(""), provider))
            .map_err(|e| Error::InvalidInput(e.to_string()))?;
        { let mut q = url.query_pairs_mut(); if let Some(uri) = redirect_uri { q.append_pair("redirectUri", uri); } if remember_me { q.append_pair("rememberMe", "1"); } }
        if url.query() == Some("") { url.set_query(None); }
        Ok(url.to_string())
    }
    pub async fn current_user(&self) -> Result<Value> {
        let token = self.session.lock().await.as_ref().map(|s| s.access_token.clone())
            .ok_or_else(|| Error::InvalidInput("Not signed in — access token missing".into()))?;
        let v = self.http.with_token(Some(token.clone()))?.get(&self.path("/me"), &[]).await.map_err(auth_error)?;
        let mut guard = self.session.lock().await;
        if let Some(s) = guard.as_mut() { if s.access_token == token { s.user = v.clone(); } }
        Ok(v)
    }
    pub async fn list_sessions(&self) -> Result<Value> { self.get_auth("/me/sessions").await }
    pub async fn revoke_session(&self, id: &str) -> Result<()> { self.delete_auth(&format!("/me/sessions/{}", segment(id)?)).await }
    pub async fn change_password(&self, input: Value) -> Result<Value> {
        let v = self.post_auth("/me/password", input).await?; self.clear_session().await; Ok(v)
    }
    pub async fn request_email_change(&self, input: Value) -> Result<Value> { self.post_auth("/me/email/change-request", input).await }
    pub async fn confirm_email_change(&self, token: &str) -> Result<Value> {
        let v = self.post("/me/email/change-confirm", json!({"token": token})).await?; self.clear_session().await; Ok(v)
    }
    pub async fn request_account_deletion(&self, password: &str) -> Result<Value> { self.post_auth("/me/account/delete-request", json!({"currentPassword":password})).await }
    pub async fn confirm_account_deletion(&self, token: &str) -> Result<Value> {
        let v = self.post("/me/account/delete-confirm", json!({"token":token})).await?; self.clear_session().await; Ok(v)
    }
    pub async fn activity(&self) -> Result<Value> { self.get_auth("/me/activity").await }
    pub async fn mfa_status(&self) -> Result<Value> { self.get_auth("/me/mfa").await }
    pub async fn enroll_totp(&self) -> Result<Value> { self.post_auth("/me/mfa/totp/enroll", Value::Null).await }
    pub async fn verify_totp_enrollment(&self, code: &str) -> Result<Value> { self.post_auth("/me/mfa/totp/verify-enrollment", json!({"code":code})).await }
    pub async fn disable_totp(&self, password: &str) -> Result<Value> { self.post_auth("/me/mfa/totp/disable", json!({"currentPassword":password})).await }
    pub async fn list_passkeys(&self) -> Result<Value> { self.get_auth("/me/passkey").await }
    pub async fn delete_passkey(&self, id: &str) -> Result<()> { self.delete_auth(&format!("/me/passkey/{}",segment(id)?)).await }
    /// Returns WebAuthn options and challengeToken for the caller's native authenticator.
    pub async fn begin_passkey_registration(&self) -> Result<Value> { self.post_auth("/me/passkey/register/begin", Value::Null).await }
    pub async fn complete_passkey_registration(&self, challenge_token: &str, response: Value, device_name: Option<&str>) -> Result<Value> {
        self.post_auth("/me/passkey/register/complete", json!({"challengeToken":challenge_token,"response":response,"deviceName":device_name})).await
    }
    pub async fn begin_passkey_authentication(&self, email: Option<&str>) -> Result<Value> {
        let mut body = serde_json::Map::new(); if let Some(e) = email { body.insert("email".into(), json!(e)); }
        self.post("/passkey/authenticate/begin", Value::Object(body)).await
    }
    pub async fn complete_passkey_authentication(&self, challenge_token: &str, response: Value, remember_me: Option<bool>) -> Result<Value> {
        let mut body = json!({"challengeToken":challenge_token,"response":response});
        if let Some(r) = remember_me { body["rememberMe"] = json!(r); }
        let v = self.post("/passkey/authenticate/complete", body).await?; self.persist_login(&v).await?; Ok(v)
    }
}
