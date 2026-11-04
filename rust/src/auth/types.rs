use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A session is sensitive: persist it only in secure application-owned storage.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub access_token: String,
    pub refresh_token: String,
    pub user: Value,
}
impl std::fmt::Debug for Session {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Session").field("access_token", &"[REDACTED]")
            .field("refresh_token", &"[REDACTED]").field("user", &self.user).finish()
    }
}

/// Login may require an MFA challenge before a session can be established.
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "lowercase")]
pub enum LoginOutcome { Tokens(Value), Mfa(Value) }
impl std::fmt::Debug for LoginOutcome {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self { Self::Tokens(_) => f.write_str("Tokens([REDACTED])"), Self::Mfa(_) => f.write_str("Mfa([REDACTED])") }
    }
}

/// User profile returned by the identity service. Unknown fields are preserved.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: String,
    pub auth_project_id: String,
    pub email: String,
    pub email_verified: bool,
    pub display_name: Option<String>,
    pub image: Option<String>,
    #[serde(default)] pub metadata: Value,
    pub last_login_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(flatten)] pub extra: serde_json::Map<String, Value>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub user: AuthUser,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    pub token_type: String,
    #[serde(flatten)] pub extra: serde_json::Map<String, Value>,
}
impl std::fmt::Debug for LoginResponse {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LoginResponse").field("user", &self.user).field("tokens", &"[REDACTED]").field("expires_in", &self.expires_in).finish()
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MfaChallenge {
    pub mfa_required: bool,
    pub mfa_token: String,
    pub factor_type: String,
    #[serde(flatten)] pub extra: serde_json::Map<String, Value>,
}
impl std::fmt::Debug for MfaChallenge {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MfaChallenge").field("mfa_token", &"[REDACTED]").field("factor_type", &self.factor_type).finish()
    }
}
#[derive(Debug, Clone)]
pub enum TypedLoginOutcome { Tokens(LoginResponse), Mfa(MfaChallenge) }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInRequest {
    pub email: String,
    pub password: String,
    #[serde(skip_serializing_if = "Option::is_none")] pub remember_me: Option<bool>,
}
impl std::fmt::Debug for SignInRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SignInRequest").field("email", &self.email).field("password", &"[REDACTED]").field("remember_me", &self.remember_me).finish()
    }
}
/// Passkey options and challenge for a platform authenticator. The SDK does not execute WebAuthn.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyBegin { pub options: Value, pub challenge_token: String }
impl std::fmt::Debug for PasskeyBegin {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PasskeyBegin").field("options", &self.options).field("challenge_token", &"[REDACTED]").finish()
    }
}
