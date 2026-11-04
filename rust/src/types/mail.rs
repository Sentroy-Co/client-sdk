//! Types for the mail API.
use std::collections::BTreeMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;


/// A single string or localized dictionary.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum LocalizedString { Text(String), Locales(BTreeMap<String, String>) }
impl Default for LocalizedString { fn default() -> Self { Self::Text(String::new()) } }
impl From<String> for LocalizedString { fn from(v: String) -> Self { Self::Text(v) } }
impl From<&str> for LocalizedString { fn from(v: &str) -> Self { Self::Text(v.into()) } }
/// A single address or a list of addresses.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Addresses { One(String), Many(Vec<String>) }
impl Default for Addresses { fn default() -> Self { Self::Many(Vec::new()) } }
impl From<String> for Addresses { fn from(v: String) -> Self { Self::One(v) } }
impl From<&str> for Addresses { fn from(v: &str) -> Self { Self::One(v.into()) } }
impl From<Vec<String>> for Addresses { fn from(v: Vec<String>) -> Self { Self::Many(v) } }
pub type Variables = BTreeMap<String, Value>;
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Domain {
    pub id: String,
    pub domain: String,
    pub status: String,
    pub spf_verified: bool,
    pub dkim_verified: bool,
    pub dmarc_verified: bool,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailboxUser {
    pub email: String,
    pub domain: String,
    pub username: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub id: String,
    pub name: LocalizedString,
    pub subject: LocalizedString,
    pub mjml_body: LocalizedString,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html_body: Option<LocalizedString>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTemplateParams {
    pub name: LocalizedString,
    pub subject: LocalizedString,
    pub mjml_body: LocalizedString,
    pub domain_id: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTemplateParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<LocalizedString>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<LocalizedString>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mjml_body: Option<LocalizedString>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateListParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_id: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageAddress {
    pub name: String,
    pub address: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageSummary {
    pub uid: u64,
    pub subject: String,
    pub from: MessageAddress,
    pub to: Vec<MessageAddress>,
    pub date: String,
    pub seen: bool,
    pub flagged: bool,
    pub size: u64,
    pub has_attachments: bool,
    pub preview: String,
    pub message_id: Option<String>,
    pub in_reply_to: Option<String>,
    pub category: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDetail {
    pub uid: u64,
    pub subject: String,
    pub from: MessageAddress,
    pub to: Vec<MessageAddress>,
    pub cc: Vec<MessageAddress>,
    pub reply_to: Option<MessageAddress>,
    pub date: String,
    pub seen: bool,
    pub flagged: bool,
    pub text_body: Option<String>,
    pub html_body: Option<String>,
    pub attachments: Vec<AttachmentInfo>,
    pub headers: BTreeMap<String,String>,
    pub message_id: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentInfo {
    pub part_id: String,
    pub filename: String,
    pub size: u64,
    pub content_type: String,
    pub content_id: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mailbox {
    pub name: String,
    pub path: String,
    pub special_use: Option<String>,
    pub total_messages: u64,
    pub unread_messages: u64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxListParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mailbox: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unread_only: Option<bool>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxMessageOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mailbox: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveMessageOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mailbox: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub filename: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendParams {
    pub to: Addresses,
    pub from: String,
    pub subject: String,
    pub domain_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cc: Option<Addresses>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bcc: Option<Addresses>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lang: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<Variables>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<Attachment>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<BTreeMap<String,String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub in_reply_to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub references: Option<Vec<String>>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendJob {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub job_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mail_log_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub job_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mail_log_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub can_retry: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_queued: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub jobs: Option<Vec<SendJob>>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_at: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDraftParams {
    pub mailbox: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<Addresses>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cc: Option<Addresses>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bcc: Option<Addresses>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<Addresses>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lang: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<Variables>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<Attachment>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub in_reply_to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub references: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<BTreeMap<String,String>>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDraftResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub can_retry: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}
pub type ContactStatus = String;
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub id: String,
    pub company_id: String,
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub tags: Vec<String>,
    pub status: ContactStatus,
    pub metadata: BTreeMap<String,Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_emailed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactList {
    pub id: String,
    pub company_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub member_count: Option<u64>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateContactParams {
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<BTreeMap<String,Value>>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateContactParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<ContactStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<BTreeMap<String,Value>>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactListParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<ContactStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactListResult {
    pub contacts: Vec<Contact>,
    pub total: u64,
    pub page: u64,
    pub limit: u64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAudienceListParams {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainName {
    pub domain: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Suppression {
    pub id: String,
    pub email: String,
    pub reason: String,
    pub domain_id: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<DomainName>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddSuppressionParams {
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub domain_id: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuppressionListParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}
pub type WebhookEvent = String;
pub type WebhookDeliveryStatus = String;
pub type WebhookDeliveryKind = String;
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Webhook {
    pub id: String,
    pub url: String,
    pub events: Vec<String>,
    pub active: bool,
    pub domain_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secret: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWebhookParams {
    pub url: String,
    pub events: Vec<String>,
    pub domain_id: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWebhookParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub events: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active: Option<bool>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookDelivery {
    pub id: String,
    pub webhook_id: String,
    pub company_id: String,
    pub kind: WebhookDeliveryKind,
    pub event: String,
    pub payload: BTreeMap<String,Value>,
    pub url: String,
    pub response_status: u16,
    pub response_body: String,
    pub duration_ms: u64,
    pub status: WebhookDeliveryStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replay_of: Option<String>,
    pub triggered_by: String,
    pub created_at: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookDeliveryListParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<WebhookDeliveryStatus>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookDeliveryListResult {
    pub items: Vec<WebhookDelivery>,
    pub total: u64,
    pub page: u64,
    pub limit: u64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookTestParams {
    pub event: String,
    pub payload: BTreeMap<String,Value>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookDispatchResult {
    pub delivery_id: String,
    pub response_status: u16,
    pub duration_ms: u64,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
pub type MailLogStatus = String;
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailLog {
    pub id: String,
    pub to: String,
    pub from: String,
    pub subject: String,
    pub status: MailLogStatus,
    pub message_id: Option<String>,
    pub domain_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<DomainName>,
    pub template_id: Option<String>,
    pub variables: Option<BTreeMap<String,Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_at: Option<String>,
    pub sent_at: Option<String>,
    pub bounced_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opened_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clicked_at: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogListParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<MailLogStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
}
