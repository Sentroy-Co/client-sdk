//! Native MCP client backed by the official Rust SDK.
//!
//! MCP credentials are a separate namespace from API keys. A connection never
//! acquires credentials, follows redirects, or replays requests on session expiry.

use std::sync::Arc;
use rmcp::{
    service::{RoleClient, RunningService},
    transport::{
        common::client_side_sse::NeverRetry,
        streamable_http_client::{StreamableHttpClientTransport, StreamableHttpClientTransportConfig},
    },
    ServiceExt,
};
use url::Url;
use crate::Error;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum McpApp { Core, Mail, Storage, Linear, Chaby }

impl McpApp {
    fn origin(self) -> &'static str {
        match self {
            Self::Core => "https://sentroy.com",
            Self::Mail => "https://mail.sentroy.com",
            Self::Storage => "https://storage.sentroy.com",
            Self::Linear => "https://linear.sentroy.com",
            Self::Chaby => "https://chaby.sentroy.com",
        }
    }
}

#[derive(Clone, Debug)]
pub struct McpResourceOptions {
    pub app: McpApp,
    pub company_slug: String,
    /// Origin only. HTTPS, or HTTP on a loopback host.
    pub origin: Option<String>,
}

fn invalid(code: &str) -> Error { Error::Mcp(code.to_owned()) }

fn valid_slug(slug: &str) -> bool {
    let bytes = slug.as_bytes();
    !bytes.is_empty() && bytes.len() <= 100
        && (bytes[0].is_ascii_lowercase() || bytes[0].is_ascii_digit())
        && bytes.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'_' || *c == b'-')
}

/// Construct the protected resource URL without making any network requests.
pub fn sentroy_mcp_resource(options: &McpResourceOptions) -> Result<String, Error> {
    if !valid_slug(&options.company_slug) { return Err(invalid("invalid_mcp_resource")); }
    let origin = Url::parse(options.origin.as_deref().unwrap_or(options.app.origin()))
        .map_err(|_| invalid("invalid_mcp_origin"))?;
    let loopback = matches!(origin.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !origin.username().is_empty() || origin.password().is_some() || origin.fragment().is_some()
        || origin.query().is_some() || origin.path() != "/"
        || !(origin.scheme() == "https" || (origin.scheme() == "http" && loopback))
        || origin.host().is_none()
    { return Err(invalid("invalid_mcp_origin")); }
    Ok(format!("{}/mcp/{}", origin.origin().ascii_serialization(), options.company_slug))
}

/// URL for OAuth protected-resource metadata; this does not perform discovery.
pub fn sentroy_mcp_resource_metadata(options: &McpResourceOptions) -> Result<String, Error> {
    let resource = Url::parse(&sentroy_mcp_resource(options)?).map_err(|_| invalid("invalid_mcp_resource"))?;
    Ok(format!("{}/.well-known/oauth-protected-resource{}", resource.origin().ascii_serialization(), resource.path()))
}

fn valid_token(token: &str) -> bool {
    let suffix = token.strip_prefix("mcp_at_").or_else(|| token.strip_prefix("mcp_"));
    suffix.is_some_and(|s| s.len() == 43 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'))
}

/// Connected official protocol client. Use `client.peer()` to call MCP methods.
pub struct McpConnection {
    pub resource: String,
    pub client: RunningService<RoleClient, ()>,
}

/// Connect with a personal MCP token or externally managed MCP OAuth access
/// token. This performs the protocol handshake, but no tool calls.
pub async fn connect_sentroy_mcp(options: &McpResourceOptions, token: &str) -> Result<McpConnection, Error> {
    let resource = sentroy_mcp_resource(options)?;
    if !valid_token(token) { return Err(invalid("invalid_mcp_token")); }
    let client = reqwest13::Client::builder()
        .redirect(reqwest13::redirect::Policy::none())
        .retry(reqwest13::retry::never())
        .build().map_err(|_| invalid("mcp_connection_failed"))?;
    let mut config = StreamableHttpClientTransportConfig::with_uri(resource.clone())
        .auth_header(token)
        .reinit_on_expired_session(false)
        .max_sse_event_size(1024 * 1024);
    config.retry_config = Arc::new(NeverRetry);
    let transport = StreamableHttpClientTransport::with_client(client, config);
    let service = ().serve(transport).await.map_err(|_| invalid("mcp_connection_failed"))?;
    Ok(McpConnection { resource, client: service })
}
