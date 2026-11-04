use crate::{Error, Result};
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use reqwest::{header, Method, RequestBuilder, Response};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use std::{fmt, time::Duration};
use url::Url;

const SEGMENT: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'_').remove(b'.')
    .remove(b'~').remove(b'!').remove(b'\'').remove(b'(').remove(b')').remove(b'*');
const JSON_LIMIT: usize = 16 * 1024 * 1024;
pub(crate) type Query = Vec<(String, String)>;

/// Encode exactly one path segment. Dot segments are rejected before URL parsing.
pub(crate) fn segment(value: &str) -> Result<String> {
    if value.is_empty() || value == "." || value == ".." || value.chars().any(char::is_control) {
        return Err(Error::InvalidInput("empty, control or dot path segment".into()));
    }
    Ok(utf8_percent_encode(value, SEGMENT).to_string())
}
pub(crate) fn query<T: Serialize>(value: &T) -> Result<Query> {
    let value = serde_json::to_value(value)?;
    if value.is_null() { return Ok(Vec::new()); }
    let fields = value.as_object().ok_or_else(|| Error::InvalidInput("query must be an object".into()))?;
    fields.iter().filter(|(_, v)| !v.is_null()).map(|(k, v)| {
        let text = match v {
            Value::String(s) => s.clone(),
            Value::Bool(_) | Value::Number(_) => v.to_string(),
            Value::Array(items) => items.iter().map(|i| match i {
                Value::String(s) => Ok(s.clone()),
                Value::Bool(_) | Value::Number(_) => Ok(i.to_string()),
                _ => Err(Error::InvalidInput("query array contains a non-scalar".into())),
            }).collect::<Result<Vec<_>>>()?.join(","),
            _ => return Err(Error::InvalidInput("query contains a non-scalar".into())),
        };
        Ok((k.clone(), text))
    }).collect()
}

#[derive(Clone)]
pub(crate) struct Http { base: String, token: Option<header::HeaderValue>, client: reqwest::Client }
impl fmt::Debug for Http {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Http").field("base", &self.base).field("authenticated", &self.token.is_some()).finish()
    }
}
impl Http {
    pub(crate) fn new(base: impl Into<String>, token: Option<String>, timeout: Duration) -> Result<Self> {
        let base = base.into().trim_end_matches('/').to_string();
        let url = Url::parse(&base).map_err(|_| Error::InvalidInput("invalid base URL".into()))?;
        if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none()
            || !url.username().is_empty() || url.password().is_some() || url.query().is_some()
            || url.fragment().is_some() || timeout.is_zero() {
            return Err(Error::InvalidInput("base URL must be HTTP(S), without credentials, query or fragment; timeout must be positive".into()));
        }
        let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).retry(reqwest::retry::never()).timeout(timeout).build()?;
        Self { base, token: None, client }.with_token(token)
    }
    pub(crate) fn with_token(&self, token: Option<String>) -> Result<Self> {
        let token = token.map(|t| {
            if t.is_empty() { return Err(Error::InvalidInput("empty access token".into())); }
            let mut v = header::HeaderValue::from_str(&format!("Bearer {t}"))
                .map_err(|_| Error::InvalidInput("invalid access token header".into()))?;
            v.set_sensitive(true);
            Ok(v)
        }).transpose()?;
        Ok(Self { base: self.base.clone(), token, client: self.client.clone() })
    }
    fn request(&self, method: Method, path: &str, query: &[(String, String)]) -> Result<RequestBuilder> {
        if !path.starts_with('/') || path.starts_with("//") || path.contains(['?', '#'])
            || path.chars().any(char::is_control) {
            return Err(Error::InvalidInput("invalid relative API path".into()));
        }
        let url = Url::parse(&format!("{}{path}", self.base))
            .map_err(|_| Error::InvalidInput("invalid API URL".into()))?;
        let mut request = self.client.request(method, url).query(query).header(header::ACCEPT, "application/json");
        if let Some(token) = &self.token { request = request.header(header::AUTHORIZATION, token.clone()); }
        Ok(request)
    }
    async fn read_limited(mut response: Response, limit: usize) -> Result<(u16, Vec<u8>)> {
        let status = response.status().as_u16();
        if response.content_length().is_some_and(|n| n > limit as u64) {
            return Err(Error::InvalidResponse("response exceeds byte limit".into()));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if chunk.len() > limit.saturating_sub(bytes.len()) {
                return Err(Error::InvalidResponse("response exceeds byte limit".into()));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok((status, bytes))
    }
    async fn decode<T: DeserializeOwned>(response: Response, once: bool) -> Result<T> {
        if once && (response.status().is_redirection() || !response.headers().get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok()).is_some_and(|v| v.to_ascii_lowercase().starts_with("application/json"))) {
            return Err(Error::InvalidResponse("invalid compose receipt".into()));
        }
        let (status, bytes) = Self::read_limited(response, if once { 4096 } else { JSON_LIMIT }).await?;
        let parsed = if bytes.is_empty() { Ok(Value::Null) } else { serde_json::from_slice(&bytes) };
        if !(200..300).contains(&status) {
            let body = parsed.unwrap_or(Value::Null);
            let message = body.get("error").and_then(Value::as_str)
                .or_else(|| body.get("error_description").and_then(Value::as_str))
                .unwrap_or("request failed").to_string();
            return Err(Error::Http { status, message, body });
        }
        let mut value = parsed?;
        let payload = if value.as_object().is_some_and(|v| v.contains_key("data")) {
            value.get_mut("data").expect("checked data").take()
        } else { value };
        Ok(serde_json::from_value(payload)?)
    }
    pub(crate) async fn get<T: DeserializeOwned>(&self, path: &str, query: &[(String, String)]) -> Result<T> {
        Self::decode(self.request(Method::GET, path, query)?.send().await?, false).await
    }
    pub(crate) async fn post<T: DeserializeOwned>(&self, path: &str, body: Value) -> Result<T> {
        let request = self.request(Method::POST, path, &[])?;
        let request = if body.is_null() { request } else { request.json(&body) };
        Self::decode(request.send().await?, false).await
    }
    pub(crate) async fn put<T: DeserializeOwned>(&self, path: &str, body: Value) -> Result<T> {
        Self::decode(self.request(Method::PUT, path, &[])?.json(&body).send().await?, false).await
    }
    pub(crate) async fn patch<T: DeserializeOwned>(&self, path: &str, body: Value) -> Result<T> {
        Self::decode(self.request(Method::PATCH, path, &[])?.json(&body).send().await?, false).await
    }
    pub(crate) async fn delete<T: DeserializeOwned>(&self, path: &str, query: &[(String, String)]) -> Result<T> {
        Self::decode(self.request(Method::DELETE, path, query)?.send().await?, false).await
    }
    pub(crate) async fn delete_body<T: DeserializeOwned>(&self, path: &str, body: Value) -> Result<T> {
        Self::decode(self.request(Method::DELETE, path, &[])?.json(&body).send().await?, false).await
    }
    pub(crate) async fn post_once<T: DeserializeOwned>(&self, path: &str, body: Value) -> Result<T> {
        if !matches!(path, "/send-bcc" | "/inbox/drafts-bcc-v1") {
            return Err(Error::InvalidInput("invalid compose path".into()));
        }
        Self::decode(self.request(Method::POST, path, &[])?.json(&body).send().await?, true).await
    }
    pub(crate) async fn post_form<T: DeserializeOwned>(&self, path: &str, body: reqwest::multipart::Form) -> Result<T> {
        Self::decode(self.request(Method::POST, path, &[])?.multipart(body).send().await?, false).await
    }
    pub(crate) async fn raw_get(&self, path: &str, query: &[(String, String)]) -> Result<Response> {
        let response = self.request(Method::GET, path, query)?.send().await?;
        if !response.status().is_success() {
            return match Self::decode::<Value>(response, false).await {
                Err(e) => Err(e), Ok(_) => Err(Error::InvalidResponse("unsuccessful raw response".into()))
            };
        }
        Ok(response)
    }
}
