//! Native async Rust client for the Sentroy platform.
//! See the crate README for authentication, module coverage and recovery behavior.
mod error;
pub(crate) mod http;
pub mod auth;
pub mod mcp;
pub mod resources;
pub mod thumbnails;
pub mod types;
pub mod vault;

pub use error::{Error, Result};
pub use resources::{mail::*, storage::*, whatsapp::*};
use http::{segment, Http};
use std::time::Duration;

/// One company-scoped client. Clones share HTTP connection pools.
#[derive(Clone, Debug)]
pub struct Sentroy {
    pub domains: Domains,
    pub mailboxes: Mailboxes,
    pub templates: Templates,
    pub inbox: Inbox,
    pub send: Send,
    pub audience: Audience,
    pub suppressions: Suppressions,
    pub webhooks: Webhooks,
    pub logs: Logs,
    pub buckets: Buckets,
    pub media: MediaResource,
    pub storage: Storage,
    pub whatsapp: WhatsApp,
}
impl Sentroy {
    pub fn new(base_url: impl Into<String>, company_slug: impl Into<String>, access_token: impl Into<String>) -> Result<Self> {
        Self::builder(company_slug).base_url(base_url).access_token(access_token).build()
    }
    pub fn builder(company_slug: impl Into<String>) -> SentroyBuilder {
        SentroyBuilder { base_url: "https://sentroy.com".into(), company_slug: company_slug.into(), token: None, timeout: Duration::from_secs(30) }
    }
}
/// Client configuration. Tokens are excluded from Debug output.
pub struct SentroyBuilder { base_url: String, company_slug: String, token: Option<String>, timeout: Duration }
impl std::fmt::Debug for SentroyBuilder {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SentroyBuilder").field("base_url", &self.base_url).field("company_slug", &self.company_slug).field("authenticated", &self.token.is_some()).field("timeout", &self.timeout).finish()
    }
}
impl SentroyBuilder {
    pub fn base_url(mut self, value: impl Into<String>) -> Self { self.base_url = value.into(); self }
    pub fn access_token(mut self, value: impl Into<String>) -> Self { self.token = Some(value.into()); self }
    pub fn timeout(mut self, value: Duration) -> Self { self.timeout = value; self }
    pub fn build(self) -> Result<Sentroy> {
        let root = self.base_url.trim_end_matches('/');
        let slug = segment(&self.company_slug)?;
        let mail = Http::new(format!("{root}/api/mail/companies/{slug}"), self.token.clone(), self.timeout)?;
        let storage = Http::new(format!("{root}/api/storage/companies/{slug}"), self.token.clone(), self.timeout)?;
        let whatsapp = Http::new(format!("{root}/api/whatsapp/companies/{slug}"), self.token, self.timeout)?;
        Ok(Sentroy {
            domains: Domains::new(mail.clone()), mailboxes: Mailboxes::new(mail.clone()),
            templates: Templates::new(mail.clone()), inbox: Inbox::new(mail.clone()),
            send: Send::new(mail.clone()), audience: Audience::new(mail.clone()),
            suppressions: Suppressions::new(mail.clone()), webhooks: Webhooks::new(mail.clone()), logs: Logs::new(mail),
            buckets: Buckets::new(storage.clone()), media: MediaResource::new(storage.clone()), storage: Storage::new(storage),
            whatsapp: WhatsApp::new(whatsapp),
        })
    }
}
