use serde_json::Value;
use std::fmt;

/// An SDK failure. Compose errors retain the UUID needed for explicit recovery.
pub enum Error {
    InvalidInput(String),
    InvalidResponse(String),
    Http { status: u16, message: String, body: Value },
    Transport(String),
    Json(serde_json::Error),
    Io(std::io::Error),
    Auth { code: String, description: String, status: Option<u16> },
    Mcp(String),
    ComposeRequest { request_id: String, source: Box<Error> },
}

impl Error {
    pub fn status_code(&self) -> Option<u16> {
        match self {
            Self::Http { status, .. } => Some(*status),
            Self::Auth { status, .. } => *status,
            Self::ComposeRequest { source, .. } => source.status_code(),
            _ => None,
        }
    }
    pub fn body(&self) -> Option<&Value> {
        match self {
            Self::Http { body, .. } => Some(body),
            Self::ComposeRequest { source, .. } => source.body(),
            _ => None,
        }
    }
    pub fn compose_request_id(&self) -> Option<&str> {
        match self { Self::ComposeRequest { request_id, .. } => Some(request_id), _ => None }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput(s) => write!(f, "Invalid input: {s}"),
            Self::InvalidResponse(s) => write!(f, "Invalid response: {s}"),
            Self::Http { status, message, .. } => write!(f, "Sentroy HTTP {status}: {message}"),
            Self::Transport(s) => write!(f, "HTTP transport failed: {s}"),
            Self::Json(e) => write!(f, "JSON conversion failed: {e}"),
            Self::Io(e) => write!(f, "I/O failed: {e}"),
            Self::Auth { code, description, .. } => write!(f, "Auth {code}: {description}"),
            Self::Mcp(s) => write!(f, "MCP failed: {s}"),
            Self::ComposeRequest { request_id, source } => write!(f, "Compose request {request_id} requires explicit outcome recovery: {source}"),
        }
    }
}

// Deliberately do not include response bodies in Debug output.
impl fmt::Debug for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { fmt::Display::fmt(self, f) }
}
impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Json(e) => Some(e), Self::Io(e) => Some(e),
            Self::ComposeRequest { source, .. } => Some(source.as_ref()),
            _ => None,
        }
    }
}
impl From<serde_json::Error> for Error { fn from(e: serde_json::Error) -> Self { Self::Json(e) } }
impl From<std::io::Error> for Error { fn from(e: std::io::Error) -> Self { Self::Io(e) } }
impl From<reqwest::Error> for Error {
    fn from(e: reqwest::Error) -> Self { Self::Transport(e.without_url().to_string()) }
}
pub type Result<T> = std::result::Result<T, Error>;
