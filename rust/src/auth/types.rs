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
        f.debug_struct("Session")
            .field("access_token", &"[REDACTED]")
            .field("refresh_token", &"[REDACTED]")
            .field("user", &self.user)
            .finish()
    }
}

/// Login may require an MFA challenge before a session can be established.
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "lowercase")]
pub enum LoginOutcome {
    Tokens(Value),
    Mfa(Value),
}
impl std::fmt::Debug for LoginOutcome {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Tokens(_) => f.write_str("Tokens([REDACTED])"),
            Self::Mfa(_) => f.write_str("Mfa([REDACTED])"),
        }
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
    #[serde(default)]
    pub metadata: Value,
    pub last_login_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub user: AuthUser,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    pub token_type: String,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}
impl std::fmt::Debug for LoginResponse {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LoginResponse")
            .field("user", &self.user)
            .field("tokens", &"[REDACTED]")
            .field("expires_in", &self.expires_in)
            .finish()
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MfaChallenge {
    pub mfa_required: bool,
    pub mfa_token: String,
    pub factor_type: String,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}
impl std::fmt::Debug for MfaChallenge {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MfaChallenge")
            .field("mfa_token", &"[REDACTED]")
            .field("factor_type", &self.factor_type)
            .finish()
    }
}
#[derive(Debug, Clone)]
pub enum TypedLoginOutcome {
    Tokens(Box<LoginResponse>),
    Mfa(MfaChallenge),
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInRequest {
    pub email: String,
    pub password: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remember_me: Option<bool>,
}
impl std::fmt::Debug for SignInRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SignInRequest")
            .field("email", &self.email)
            .field("password", &"[REDACTED]")
            .field("remember_me", &self.remember_me)
            .finish()
    }
}
/// Passkey options and challenge for a platform authenticator. The SDK does not execute WebAuthn.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyBegin {
    pub options: Value,
    pub challenge_token: String,
}
impl std::fmt::Debug for PasskeyBegin {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PasskeyBegin")
            .field("options", &self.options)
            .field("challenge_token", &"[REDACTED]")
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub refresh_token_prefix: String,
    pub user_agent: Option<String>,
    pub ip: Option<String>,
    pub expires_at: String,
    pub created_at: String,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    pub id: String,
    pub action: String,
    pub ip_address: Option<String>,
    pub created_at: String,
    pub details: Option<Value>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MfaStatus {
    pub enrolled: bool,
    pub factor_type: Option<String>,
    pub verified_at: Option<String>,
    pub recovery_codes_remaining: Option<u64>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MfaEnrollment {
    pub secret: String,
    pub otpauth_uri: String,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}
impl std::fmt::Debug for MfaEnrollment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("MfaEnrollment([REDACTED])")
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MfaEnrollmentVerification {
    pub enrolled: bool,
    pub recovery_codes: Vec<String>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}
impl std::fmt::Debug for MfaEnrollmentVerification {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MfaEnrollmentVerification")
            .field("enrolled", &self.enrolled)
            .field("recovery_codes", &"[REDACTED]")
            .finish()
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasskeySummary {
    pub id: String,
    pub credential_id_prefix: String,
    pub device_name: Option<String>,
    pub transports: Vec<String>,
    pub last_used_at: Option<String>,
    pub created_at: String,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}

/// Tokens returned by a successful rotation.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthTokensResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    pub token_type: String,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}
impl std::fmt::Debug for AuthTokensResponse {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthTokensResponse")
            .field("tokens", &"[REDACTED]")
            .field("expires_in", &self.expires_in)
            .finish()
    }
}
/// Signup may require email verification, in which case tokens are absent.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignupResponse {
    pub user: AuthUser,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub token_type: Option<String>,
    pub email_verification_required: Option<bool>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}
impl std::fmt::Debug for SignupResponse {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SignupResponse")
            .field("user", &self.user)
            .field("tokens", &"[REDACTED]")
            .field(
                "email_verification_required",
                &self.email_verification_required,
            )
            .finish()
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserResponse {
    pub user: AuthUser,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}
macro_rules! secret_debug {
    ($($name:ident),+ $(,)?) => {$(
        impl std::fmt::Debug for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(concat!(stringify!($name), "([REDACTED])"))
            }
        }
    )+};
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignupRequest {
    pub email: String,
    pub password: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MfaVerifyRequest {
    pub mfa_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recovery_code: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordResetConfirmRequest {
    pub token: String,
    pub new_password: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MagicLinkRequest {
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redirect_uri: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptInvitationRequest {
    pub token: String,
    pub password: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeEmailRequest {
    pub new_email: String,
    pub current_password: String,
}
secret_debug!(
    SignupRequest,
    MfaVerifyRequest,
    PasswordResetConfirmRequest,
    MagicLinkRequest,
    AcceptInvitationRequest,
    ChangePasswordRequest,
    ChangeEmailRequest
);
