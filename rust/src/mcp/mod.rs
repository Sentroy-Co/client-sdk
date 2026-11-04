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

mod file_info;
pub use file_info::{ContactImportFileInfo, StorageUploadFileInfo, sentroy_mcp_contact_import_file_info, sentroy_mcp_storage_upload_file_info};

#[cfg(test)]
mod tests {
    use super::*;
    fn resource() -> McpResourceOptions {
        McpResourceOptions { app: McpApp::Mail, company_slug: "example".into(), origin: None }
    }
    #[test]
    fn resource_and_metadata_bind_slug_and_origin() {
        let mut opts = resource();
        assert_eq!(sentroy_mcp_resource(&opts).unwrap(), "https://mail.sentroy.com/mcp/example");
        assert_eq!(sentroy_mcp_resource_metadata(&opts).unwrap(), "https://mail.sentroy.com/.well-known/oauth-protected-resource/mcp/example");
        opts.origin = Some("http://localhost:8080".into());
        assert_eq!(sentroy_mcp_resource(&opts).unwrap(), "http://localhost:8080/mcp/example");
        for bad in ["http://example.com", "https://user:pass@example.com", "https://example.com/a", "https://example.com/?q=1", "https://example.com/#f"] {
            opts.origin = Some(bad.into());
            assert!(sentroy_mcp_resource(&opts).is_err());
        }
        opts.origin = None;
        for bad in ["", "A", "../x", "a/b", "with space"] {
            opts.company_slug = bad.into();
            assert!(sentroy_mcp_resource(&opts).is_err());
        }
    }
    #[test]
    fn token_namespace_and_manifests() {
        assert!(valid_token(&format!("mcp_{}", "a".repeat(43))));
        assert!(valid_token(&format!("mcp_at_{}", "a".repeat(43))));
        assert!(!valid_token(&format!("stk_{}", "a".repeat(43))));
        assert!(!valid_token(&format!("mcp_{}", "a".repeat(42))));
        let contact = sentroy_mcp_contact_import_file_info(b"abc", "csv").unwrap();
        assert_eq!(contact.file_hash, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert!(sentroy_mcp_contact_import_file_info(b"", "csv").is_err());
        assert!(sentroy_mcp_contact_import_file_info(b"abc", "txt").is_err());
        let file = sentroy_mcp_storage_upload_file_info(b"abc", "file.PDF", "application/pdf").unwrap();
        assert_eq!(file.sha256, contact.file_hash);
        assert!(sentroy_mcp_storage_upload_file_info(b"abc", "../file.pdf", "application/pdf").is_err());
        assert!(sentroy_mcp_storage_upload_file_info(b"abc", "file.txt", "application/pdf").is_err());
    }
}
