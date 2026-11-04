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
