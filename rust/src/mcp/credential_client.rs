//! Credential refresh adapter around the official rmcp HTTP implementation.
use std::{collections::HashMap, sync::Arc};
use futures_util::stream::BoxStream;
use reqwest13::header::{HeaderName, HeaderValue};
use rmcp::{
    model::ClientJsonRpcMessage,
    transport::streamable_http_client::{
        StreamableHttpClient, StreamableHttpError, StreamableHttpPostResponse, SseError,
    },
};
use sse_stream::Sse;
use super::McpTokenProvider;

#[derive(Clone)]
pub(super) struct CredentialClient {
    pub client: reqwest13::Client,
    pub provider: McpTokenProvider,
    pub resource: Arc<str>,
}
impl CredentialClient {
    async fn token(&self, uri: &str) -> Result<String, StreamableHttpError<reqwest13::Error>> {
        if uri != self.resource.as_ref() {
            return Err(StreamableHttpError::UnexpectedServerResponse("invalid_mcp_target".into()));
        }
        self.provider.resolve().await.map_err(|_| StreamableHttpError::UnexpectedServerResponse("mcp_token_unavailable".into()))
    }
}
impl StreamableHttpClient for CredentialClient {
    type Error = reqwest13::Error;

    async fn post_message(
        &self, uri: Arc<str>, message: ClientJsonRpcMessage, session: Option<Arc<str>>,
        _auth: Option<String>, headers: HashMap<HeaderName, HeaderValue>,
    ) -> Result<StreamableHttpPostResponse, StreamableHttpError<Self::Error>> {
        let token = self.token(&uri).await?;
        self.client.post_message(uri, message, session, Some(token), headers).await
    }
    async fn post_message_with_max_sse_event_size(
        &self, uri: Arc<str>, message: ClientJsonRpcMessage, session: Option<Arc<str>>,
        _auth: Option<String>, headers: HashMap<HeaderName, HeaderValue>, max: usize,
    ) -> Result<StreamableHttpPostResponse, StreamableHttpError<Self::Error>> {
        let token = self.token(&uri).await?;
        self.client.post_message_with_max_sse_event_size(uri, message, session, Some(token), headers, max).await
    }
    async fn delete_session(
        &self, uri: Arc<str>, session: Arc<str>, _auth: Option<String>,
        headers: HashMap<HeaderName, HeaderValue>,
    ) -> Result<(), StreamableHttpError<Self::Error>> {
        let token = self.token(&uri).await?;
        self.client.delete_session(uri, session, Some(token), headers).await
    }
    async fn get_stream(
        &self, uri: Arc<str>, session: Option<Arc<str>>, last: Option<String>,
        _auth: Option<String>, headers: HashMap<HeaderName, HeaderValue>,
    ) -> Result<BoxStream<'static, Result<Sse, SseError>>, StreamableHttpError<Self::Error>> {
        let token = self.token(&uri).await?;
        self.client.get_stream(uri, session, last, Some(token), headers).await
    }
    async fn get_stream_with_max_sse_event_size(
        &self, uri: Arc<str>, session: Option<Arc<str>>, last: Option<String>,
        _auth: Option<String>, headers: HashMap<HeaderName, HeaderValue>, max: usize,
    ) -> Result<BoxStream<'static, Result<Sse, SseError>>, StreamableHttpError<Self::Error>> {
        let token = self.token(&uri).await?;
        self.client.get_stream_with_max_sse_event_size(uri, session, last, Some(token), headers, max).await
    }
}
