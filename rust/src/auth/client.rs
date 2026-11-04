use super::{
    ActivityEntry, AuthUser, LoginOutcome, LoginResponse, MfaEnrollment, MfaEnrollmentVerification,
    MfaStatus, PasskeyBegin, PasskeySummary, Session, SessionSummary, SignInRequest,
    TypedLoginOutcome, AuthTokensResponse, SignupResponse, SignupRequest, MfaVerifyRequest,
    PasswordResetConfirmRequest, MagicLinkRequest, AcceptInvitationRequest, ChangePasswordRequest,
    ChangeEmailRequest, UserResponse,
};
use crate::{
    http::{segment, Http},
    Error, Result,
};
use serde_json::{json, Value};
use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::Mutex;

/// Portable identity client. No browser, local storage, timers or WebAuthn runtime is supplied.
/// Clones share one in-memory session and serialize refreshes to avoid rotating a token twice.
#[derive(Clone)]
pub struct SentroyAuth {
    pub(crate) http: Http,
    pub(crate) base: String,
    pub(crate) slug: String,
    slug_encoded: String,
    state: Arc<Mutex<State>>,
    epoch: Arc<AtomicU64>,
}
#[derive(Default)]
struct State {
    session: Option<Session>,
    // Only a caller that observed this exact generation before waiting may reuse it.
    last_refresh: Option<(u64, Value)>,
}
impl std::fmt::Debug for SentroyAuth {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SentroyAuth")
            .field("base", &self.base)
            .field("slug", &self.slug)
            .field("session", &"[REDACTED]")
            .finish()
    }
}
pub(crate) fn auth_error(e: Error) -> Error {
    match e {
        Error::Http {
            status,
            message: _,
            body,
        } => Error::Auth {
            code: body
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("http_error")
                .to_string(),
            description: body
                .get("error_description")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| format!("HTTP {status}")),
            status: Some(status),
        },
        e => e,
    }
}
impl SentroyAuth {
    pub fn new(
        base: impl Into<String>,
        project_slug: impl Into<String>,
        api_key: Option<String>,
        timeout: Duration,
    ) -> Result<Self> {
        let base = base.into().trim_end_matches('/').to_string();
        let slug = project_slug.into();
        if slug.is_empty() {
            return Err(Error::InvalidInput("project slug must not be empty".into()));
        }
        let slug_encoded = segment(&slug)?;
        let url = url::Url::parse(&base).map_err(|e| Error::InvalidInput(e.to_string()))?;
        if !matches!(url.scheme(), "https" | "http")
            || url.host_str().is_none()
            || url.query().is_some()
            || url.fragment().is_some()
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err(Error::InvalidInput("invalid auth base URL".into()));
        }
        let http = Http::new(base.clone(), api_key, timeout)?;
        Ok(Self {
            http,
            base,
            slug,
            slug_encoded,
            state: Arc::new(Mutex::new(State::default())),
            epoch: Arc::new(AtomicU64::new(0)),
        })
    }
    pub(crate) fn path(&self, p: &str) -> String {
        format!("/api/v1/auth/{}{}", self.slug_encoded, p)
    }
    async fn post(&self, p: &str, body: Value) -> Result<Value> {
        self.http
            .post(&self.path(p), body)
            .await
            .map_err(auth_error)
    }
    async fn bearer(&self) -> Result<Http> {
        let token = self
            .state
            .lock()
            .await
            .session
            .as_ref()
            .map(|s| s.access_token.clone())
            .ok_or_else(|| Error::InvalidInput("Not signed in — access token missing".into()))?;
        self.http.with_token(Some(token))
    }
    async fn get_auth(&self, p: &str) -> Result<Value> {
        self.bearer()
            .await?
            .get(&self.path(p), &[])
            .await
            .map_err(auth_error)
    }
    async fn post_auth(&self, p: &str, body: Value) -> Result<Value> {
        self.bearer()
            .await?
            .post(&self.path(p), body)
            .await
            .map_err(auth_error)
    }
    async fn delete_auth(&self, p: &str) -> Result<()> {
        let _: Value = self
            .bearer()
            .await?
            .delete(&self.path(p), &[])
            .await
            .map_err(auth_error)?;
        Ok(())
    }
    async fn persist_login(&self, v: &Value) -> Result<()> {
        let session: Session =
            serde_json::from_value(v.clone()).map_err(|e| Error::InvalidResponse(e.to_string()))?;
        self.set_session(session).await;
        Ok(())
    }
    pub async fn session(&self) -> Option<Session> {
        self.state.lock().await.session.clone()
    }
    pub async fn set_session(&self, session: Session) {
        let mut s = self.state.lock().await;
        s.session = Some(session);
        s.last_refresh = None;
        self.epoch.fetch_add(1, Ordering::SeqCst);
    }
    pub async fn clear_session(&self) {
        let mut s = self.state.lock().await;
        s.session = None;
        s.last_refresh = None;
        self.epoch.fetch_add(1, Ordering::SeqCst);
    }
    async fn clear_if_epoch(&self, epoch: u64) {
        let mut s = self.state.lock().await;
        if self.epoch.load(Ordering::SeqCst) == epoch {
            s.session = None;
            s.last_refresh = None;
            self.epoch.fetch_add(1, Ordering::SeqCst);
        }
    }
    pub async fn sign_up(&self, input: Value) -> Result<Value> {
        let v = self.post("/signup", input).await?;
        if v.get("accessToken").and_then(Value::as_str).is_some()
            && v.get("refreshToken").and_then(Value::as_str).is_some()
        {
            self.persist_login(&v).await?;
        }
        Ok(v)
    }
    pub async fn sign_up_typed(&self, input: &SignupRequest) -> Result<SignupResponse> {
        Ok(serde_json::from_value(self.sign_up(serde_json::to_value(input)?).await?)?)
    }
    pub async fn sign_in(&self, input: Value) -> Result<LoginOutcome> {
        let v = self.post("/login", input).await?;
        if v.get("mfaRequired") == Some(&Value::Bool(true)) {
            Ok(LoginOutcome::Mfa(v))
        } else {
            self.persist_login(&v).await?;
            Ok(LoginOutcome::Tokens(v))
        }
    }
    /// Typed login preserving additional server fields in the response.
    pub async fn sign_in_typed(&self, input: &SignInRequest) -> Result<TypedLoginOutcome> {
        match self.sign_in(serde_json::to_value(input)?).await? {
            LoginOutcome::Tokens(v) => Ok(TypedLoginOutcome::Tokens(Box::new(serde_json::from_value(v)?))),
            LoginOutcome::Mfa(v) => Ok(TypedLoginOutcome::Mfa(serde_json::from_value(v)?)),
        }
    }
    pub async fn verify_mfa_typed(&self, input: &MfaVerifyRequest) -> Result<LoginResponse> {
        Ok(serde_json::from_value(self.verify_mfa(serde_json::to_value(input)?).await?)?)
    }
    pub async fn begin_passkey_registration_typed(&self) -> Result<PasskeyBegin> {
        Ok(serde_json::from_value(
            self.begin_passkey_registration().await?,
        )?)
    }
    pub async fn begin_passkey_authentication_typed(
        &self,
        email: Option<&str>,
    ) -> Result<PasskeyBegin> {
        Ok(serde_json::from_value(
            self.begin_passkey_authentication(email).await?,
        )?)
    }
    pub async fn verify_mfa(&self, input: Value) -> Result<Value> {
        let v = self.post("/login/mfa/verify", input).await?;
        self.persist_login(&v).await?;
        Ok(v)
    }
    /// Concurrent callers that observe the same session share one rotation.
    /// Once a rotation is sent, cancellation, malformed responses, and failures
    /// discard the old session: its refresh token may have already been consumed.
    pub async fn refresh(&self) -> Result<Value> {
        let observed = self.epoch.load(Ordering::SeqCst);
        let mut state = self.state.lock().await;
        if self.epoch.load(Ordering::SeqCst) != observed {
            return state
                .last_refresh
                .as_ref()
                .filter(|(e, _)| *e == observed)
                .map(|(_, v)| v.clone())
                .ok_or_else(|| Error::InvalidInput("session changed during refresh".into()));
        }
        // Remove before the await, so cancellation cannot permit a blind replay.
        let mut session = state.session.take().ok_or_else(|| {
            Error::InvalidInput("Not signed in or refresh outcome unknown".into())
        })?;
        state.last_refresh = None;
        let result = self
            .post("/refresh", json!({"refreshToken": session.refresh_token}))
            .await;
        let result = result.and_then(|v| {
            let access = v
                .get("accessToken")
                .and_then(Value::as_str)
                .ok_or_else(|| Error::InvalidResponse("missing accessToken".into()))?;
            let refresh = v
                .get("refreshToken")
                .and_then(Value::as_str)
                .ok_or_else(|| Error::InvalidResponse("missing refreshToken".into()))?;
            session.access_token = access.to_owned();
            session.refresh_token = refresh.to_owned();
            Ok(v)
        });
        self.epoch.fetch_add(1, Ordering::SeqCst);
        match result {
            Ok(v) => {
                state.session = Some(session);
                state.last_refresh = Some((observed, v.clone()));
                Ok(v)
            }
            Err(e) => Err(e),
        }
    }
    pub async fn refresh_typed(&self) -> Result<AuthTokensResponse> {
        Ok(serde_json::from_value(self.refresh().await?)?)
    }
    pub async fn sign_out(&self) {
        let old = {
            let mut state = self.state.lock().await;
            let old = state.session.take();
            state.last_refresh = None;
            self.epoch.fetch_add(1, Ordering::SeqCst);
            old
        };
        if let Some(s) = old {
            let _ = self
                .post("/logout", json!({"refreshToken": s.refresh_token}))
                .await;
        }
    }
    pub async fn send_password_reset(&self, email: &str) -> Result<Value> {
        self.post("/password-reset/request", json!({"email":email}))
            .await
    }
    pub async fn confirm_password_reset(&self, input: Value) -> Result<Value> {
        self.post("/password-reset/confirm", input).await
    }
    pub async fn confirm_password_reset_typed(&self, input: &PasswordResetConfirmRequest) -> Result<UserResponse> {
        Ok(serde_json::from_value(self.confirm_password_reset(serde_json::to_value(input)?).await?)?)
    }
    pub async fn send_magic_link_typed(&self, input: &MagicLinkRequest) -> Result<Value> {
        self.send_magic_link(serde_json::to_value(input)?).await
    }
    pub async fn accept_invitation_typed(&self, input: &AcceptInvitationRequest) -> Result<LoginResponse> {
        Ok(serde_json::from_value(self.accept_invitation(serde_json::to_value(input)?).await?)?)
    }
    pub async fn change_password_typed(&self, input: &ChangePasswordRequest) -> Result<Value> {
        self.change_password(serde_json::to_value(input)?).await
    }
    pub async fn request_email_change_typed(&self, input: &ChangeEmailRequest) -> Result<Value> {
        self.request_email_change(serde_json::to_value(input)?).await
    }
    pub async fn verify_email(&self, token: &str) -> Result<Value> {
        let response = self.post("/verify-email", json!({"token":token})).await?;
        if let Some(user) = response.get("user") {
            let mut state = self.state.lock().await;
            if let Some(session) = state.session.as_mut() {
                if user.get("id").and_then(Value::as_str).is_some()
                    && session.user.get("id") == user.get("id")
                {
                    session.user = user.clone();
                }
            }
        }
        Ok(response)
    }
    pub async fn send_magic_link(&self, input: Value) -> Result<Value> {
        self.post("/magic-link/request", input).await
    }
    pub async fn consume_magic_link(&self, token: &str) -> Result<Value> {
        let v = self
            .post("/magic-link/consume", json!({"token":token}))
            .await?;
        self.persist_login(&v).await?;
        Ok(v)
    }
    pub async fn accept_invitation(&self, input: Value) -> Result<Value> {
        let v = self.post("/invitation/accept", input).await?;
        self.persist_login(&v).await?;
        Ok(v)
    }
    /// The server's social URL has no state or PKCE parameters in the reference API.
    /// Callers must secure the redirect at the application level.
    pub fn social_authorize_url(
        &self,
        provider: &str,
        redirect_uri: Option<&str>,
        remember_me: bool,
    ) -> Result<String> {
        if ![
            "google",
            "github",
            "facebook",
            "microsoft",
            "twitter",
            "apple",
        ]
        .contains(&provider)
        {
            return Err(Error::InvalidInput("unsupported social provider".into()));
        }
        let mut url = url::Url::parse(&format!(
            "{}{}/social/{}/authorize",
            self.base,
            self.path(""),
            provider
        ))
        .map_err(|e| Error::InvalidInput(e.to_string()))?;
        {
            let mut q = url.query_pairs_mut();
            if let Some(uri) = redirect_uri {
                q.append_pair("redirectUri", uri);
            }
            if remember_me {
                q.append_pair("rememberMe", "1");
            }
        }
        if url.query() == Some("") {
            url.set_query(None);
        }
        Ok(url.to_string())
    }
    /// Consume a fragment supplied by the application after it has validated
    /// the callback context. This API does not open a browser or validate OAuth
    /// state; the reference social endpoint does not provide a state parameter.
    /// Missing tokens return None; HTTP and malformed-response errors are returned.
    pub async fn consume_redirect_fragment(&self, fragment: &str) -> Result<Option<Value>> {
        let fragment = fragment.strip_prefix('#').unwrap_or(fragment);
        let mut access = None;
        let mut refresh = None;
        for (key, value) in url::form_urlencoded::parse(fragment.as_bytes()) {
            let target = match key.as_ref() {
                "access_token" => &mut access,
                "refresh_token" => &mut refresh,
                _ => continue,
            };
            if target.replace(value.into_owned()).is_some() {
                return Err(Error::InvalidInput("duplicate token in redirect fragment".into()));
            }
        }
        let (access_token, refresh_token) = match (access, refresh) {
            (Some(a), Some(r)) if !a.is_empty() && !r.is_empty() => (a, r),
            _ => return Ok(None),
        };
        let observed = self.epoch.load(Ordering::SeqCst);
        let user: Value = self.http.with_token(Some(access_token.clone()))?
            .get(&self.path("/me"), &[]).await.map_err(auth_error)?;
        if !user.get("id").is_some_and(Value::is_string) {
            return Err(Error::InvalidResponse("invalid user response".into()));
        }
        let mut state = self.state.lock().await;
        if self.epoch.load(Ordering::SeqCst) != observed {
            return Err(Error::InvalidInput("session changed during redirect exchange".into()));
        }
        state.session = Some(Session { access_token, refresh_token, user: user.clone() });
        state.last_refresh = None;
        self.epoch.fetch_add(1, Ordering::SeqCst);
        Ok(Some(user))
    }
    pub async fn current_user(&self) -> Result<Value> {
        let token = self
            .state
            .lock()
            .await
            .session
            .as_ref()
            .map(|s| s.access_token.clone())
            .ok_or_else(|| Error::InvalidInput("Not signed in — access token missing".into()))?;
        let v: Value = self
            .http
            .with_token(Some(token.clone()))?
            .get(&self.path("/me"), &[])
            .await
            .map_err(auth_error)?;
        let mut guard = self.state.lock().await;
        if let Some(s) = guard.session.as_mut() {
            if s.access_token == token {
                s.user = v.clone();
            }
        }
        Ok(v)
    }
    pub async fn current_user_typed(&self) -> Result<AuthUser> {
        Ok(serde_json::from_value(self.current_user().await?)?)
    }
    pub async fn list_sessions_typed(&self) -> Result<Vec<SessionSummary>> {
        Ok(serde_json::from_value(self.list_sessions().await?)?)
    }
    pub async fn activity_typed(&self) -> Result<Vec<ActivityEntry>> {
        Ok(serde_json::from_value(self.activity().await?)?)
    }
    pub async fn mfa_status_typed(&self) -> Result<MfaStatus> {
        Ok(serde_json::from_value(self.mfa_status().await?)?)
    }
    pub async fn enroll_totp_typed(&self) -> Result<MfaEnrollment> {
        Ok(serde_json::from_value(self.enroll_totp().await?)?)
    }
    pub async fn verify_totp_enrollment_typed(
        &self,
        code: &str,
    ) -> Result<MfaEnrollmentVerification> {
        Ok(serde_json::from_value(
            self.verify_totp_enrollment(code).await?,
        )?)
    }
    pub async fn list_passkeys_typed(&self) -> Result<Vec<PasskeySummary>> {
        Ok(serde_json::from_value(self.list_passkeys().await?)?)
    }
    pub async fn list_sessions(&self) -> Result<Value> {
        self.get_auth("/me/sessions").await
    }
    pub async fn revoke_session(&self, id: &str) -> Result<()> {
        self.delete_auth(&format!("/me/sessions/{}", segment(id)?))
            .await
    }
    pub async fn change_password(&self, input: Value) -> Result<Value> {
        let (token, epoch) = {
            let state = self.state.lock().await;
            let token = state
                .session
                .as_ref()
                .ok_or_else(|| Error::InvalidInput("Not signed in".into()))?
                .access_token
                .clone();
            (token, self.epoch.load(Ordering::SeqCst))
        };
        let v = self
            .http
            .with_token(Some(token))?
            .post(&self.path("/me/password"), input)
            .await
            .map_err(auth_error)?;
        self.clear_if_epoch(epoch).await;
        Ok(v)
    }
    pub async fn request_email_change(&self, input: Value) -> Result<Value> {
        self.post_auth("/me/email/change-request", input).await
    }
    pub async fn confirm_email_change(&self, token: &str) -> Result<Value> {
        let epoch = self.epoch.load(Ordering::SeqCst);
        let v = self
            .post("/me/email/change-confirm", json!({"token": token}))
            .await?;
        self.clear_if_epoch(epoch).await;
        Ok(v)
    }
    pub async fn request_account_deletion(&self, password: &str) -> Result<Value> {
        self.post_auth(
            "/me/account/delete-request",
            json!({"currentPassword":password}),
        )
        .await
    }
    pub async fn confirm_account_deletion(&self, token: &str) -> Result<Value> {
        let epoch = self.epoch.load(Ordering::SeqCst);
        let v = self
            .post("/me/account/delete-confirm", json!({"token":token}))
            .await?;
        self.clear_if_epoch(epoch).await;
        Ok(v)
    }
    pub async fn activity(&self) -> Result<Value> {
        self.get_auth("/me/activity").await
    }
    pub async fn mfa_status(&self) -> Result<Value> {
        self.get_auth("/me/mfa").await
    }
    pub async fn enroll_totp(&self) -> Result<Value> {
        self.post_auth("/me/mfa/totp/enroll", Value::Null).await
    }
    pub async fn verify_totp_enrollment(&self, code: &str) -> Result<Value> {
        self.post_auth("/me/mfa/totp/verify-enrollment", json!({"code":code}))
            .await
    }
    pub async fn disable_totp(&self, password: &str) -> Result<Value> {
        self.post_auth("/me/mfa/totp/disable", json!({"currentPassword":password}))
            .await
    }
    pub async fn list_passkeys(&self) -> Result<Value> {
        self.get_auth("/me/passkey").await
    }
    pub async fn delete_passkey(&self, id: &str) -> Result<()> {
        self.delete_auth(&format!("/me/passkey/{}", segment(id)?))
            .await
    }
    /// Returns WebAuthn options and challengeToken for the caller's native authenticator.
    pub async fn begin_passkey_registration(&self) -> Result<Value> {
        self.post_auth("/me/passkey/register/begin", Value::Null)
            .await
    }
    pub async fn complete_passkey_registration(
        &self,
        challenge_token: &str,
        response: Value,
        device_name: Option<&str>,
    ) -> Result<Value> {
        let mut body = json!({"challengeToken":challenge_token,"response":response});
        if let Some(name) = device_name {
            body["deviceName"] = json!(name);
        }
        self.post_auth("/me/passkey/register/complete", body).await
    }
    pub async fn begin_passkey_authentication(&self, email: Option<&str>) -> Result<Value> {
        let mut body = serde_json::Map::new();
        if let Some(e) = email {
            body.insert("email".into(), json!(e));
        }
        self.post("/passkey/authenticate/begin", Value::Object(body))
            .await
    }
    pub async fn complete_passkey_authentication(
        &self,
        challenge_token: &str,
        response: Value,
        remember_me: Option<bool>,
    ) -> Result<Value> {
        let mut body = json!({"challengeToken":challenge_token,"response":response});
        if let Some(r) = remember_me {
            body["rememberMe"] = json!(r);
        }
        let v = self.post("/passkey/authenticate/complete", body).await?;
        self.persist_login(&v).await?;
        Ok(v)
    }
}
