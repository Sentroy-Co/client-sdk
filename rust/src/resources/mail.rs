//! Mail resources.
use crate::http::{query, segment, Http};
use crate::types::mail::*;
use crate::{Error, Result};
use serde::Serialize;
use serde_json::{json, Value};

fn body<T: Serialize>(v: &T) -> Result<Value> {
    Ok(serde_json::to_value(v)?)
}
fn path(base: &str, id: &str) -> Result<String> {
    Ok(format!("{}/{}", base, segment(id)?))
}
fn q<T: Serialize>(v: &T) -> Result<Vec<(String, String)>> {
    query(v)
}
fn nonempty_bcc(value: &Option<Addresses>) -> bool {
    match value {
        Some(Addresses::One(s)) => !s.trim().is_empty(),
        Some(Addresses::Many(v)) => !v.is_empty(),
        None => false,
    }
}
fn request_id(value: &Option<String>) -> Result<String> {
    match value {
        None => Ok(uuid::Uuid::new_v4().to_string()),
        Some(v) if v.is_empty() => Ok(uuid::Uuid::new_v4().to_string()),
        Some(v) => {
            let parsed = uuid::Uuid::parse_str(v)
                .map_err(|_| Error::InvalidInput("requestId must be a UUID".into()))?;
            let canonical = parsed.to_string();
            if !canonical.eq_ignore_ascii_case(v)
                || !(1..=8).contains(&(parsed.as_bytes()[6] >> 4))
                || (parsed.as_bytes()[8] & 0xc0) != 0x80
            {
                return Err(Error::InvalidInput("requestId must be a UUID".into()));
            }
            Ok(canonical)
        }
    }
}
async fn compose<T: serde::de::DeserializeOwned>(
    http: &Http,
    endpoint: &str,
    mut data: Value,
    id: String,
) -> Result<T> {
    data["requestId"] = json!(id);
    http.post_once(endpoint, data)
        .await
        .map_err(|source| Error::ComposeRequest {
            request_id: id,
            source: Box::new(source),
        })
}
macro_rules! resource {
    ($name:ident) => {
        #[derive(Clone, Debug)]
        pub struct $name {
            http: Http,
        }
        impl $name {
            pub(crate) fn new(http: Http) -> Self {
                Self { http }
            }
        }
    };
}
resource!(Domains);
impl Domains {
    pub async fn list(&self) -> Result<Vec<Domain>> {
        self.http.get("/domains", &[]).await
    }
    pub async fn get(&self, id: &str) -> Result<Domain> {
        self.http.get(&path("/domains", id)?, &[]).await
    }
}
resource!(Mailboxes);
impl Mailboxes {
    pub async fn list(&self) -> Result<Vec<MailboxUser>> {
        self.http.get("/mailboxes", &[]).await
    }
}
resource!(Templates);
impl Templates {
    pub async fn list(&self, params: &TemplateListParams) -> Result<Vec<Template>> {
        self.http.get("/templates", &q(params)?).await
    }
    pub async fn get(&self, id: &str) -> Result<Template> {
        self.http.get(&path("/templates", id)?, &[]).await
    }
    pub async fn create(&self, params: &CreateTemplateParams) -> Result<Template> {
        self.http.post("/templates", body(params)?).await
    }
    pub async fn update(&self, id: &str, params: &UpdateTemplateParams) -> Result<Template> {
        self.http
            .patch(&path("/templates", id)?, body(params)?)
            .await
    }
    pub async fn delete(&self, id: &str) -> Result<()> {
        self.http
            .delete::<Value>(&path("/templates", id)?, &[])
            .await?;
        Ok(())
    }
}
resource!(Inbox);
impl Inbox {
    pub async fn save_draft(&self, params: &SaveDraftParams) -> Result<SaveDraftResult> {
        let mut data = body(params)?;
        if nonempty_bcc(&params.bcc) {
            let id = request_id(&params.request_id)?;
            let mut result: SaveDraftResult =
                compose(&self.http, "/inbox/drafts-bcc-v1", data, id.clone()).await?;
            result.request_id = Some(id);
            Ok(result)
        } else {
            data.as_object_mut().unwrap().remove("bcc");
            data.as_object_mut().unwrap().remove("requestId");
            self.http.post("/inbox/drafts", data).await
        }
    }
    pub async fn list(&self, params: &InboxListParams) -> Result<Vec<MessageSummary>> {
        let mut v = body(params)?;
        if params.unread_only != Some(true) {
            v.as_object_mut().unwrap().remove("unreadOnly");
        }
        self.http.get("/inbox", &q(&v)?).await
    }
    pub async fn get(&self, uid: u64, options: &InboxMessageOptions) -> Result<MessageDetail> {
        self.http.get(&format!("/inbox/{uid}"), &q(options)?).await
    }
    pub async fn list_folders(&self, mailbox: Option<&str>) -> Result<Vec<Mailbox>> {
        self.http
            .get(
                "/inbox/mailboxes",
                &mailbox
                    .filter(|s| !s.is_empty())
                    .map(|m| vec![("mailbox".into(), m.into())])
                    .unwrap_or_default(),
            )
            .await
    }
    pub async fn get_thread(
        &self,
        subject: &str,
        mailbox: Option<&str>,
    ) -> Result<Vec<MessageDetail>> {
        let mut p = vec![("subject".into(), subject.into())];
        if let Some(m) = mailbox.filter(|s| !s.is_empty()) {
            p.push(("mailbox".into(), m.into()));
        }
        self.http.get("/inbox/thread", &p).await
    }
    pub async fn mark_as_read(&self, uid: u64, options: &InboxMessageOptions) -> Result<()> {
        self.http
            .post::<Value>(&format!("/inbox/{uid}/read"), body(options)?)
            .await?;
        Ok(())
    }
    pub async fn mark_as_unread(&self, uid: u64, options: &InboxMessageOptions) -> Result<()> {
        self.http
            .delete::<Value>(&format!("/inbox/{uid}/read"), &q(options)?)
            .await?;
        Ok(())
    }
    pub async fn move_message(
        &self,
        uid: u64,
        to: &str,
        options: &MoveMessageOptions,
    ) -> Result<()> {
        let mut v = body(options)?;
        v["to"] = json!(to);
        self.http
            .post::<Value>(&format!("/inbox/{uid}/move"), v)
            .await?;
        Ok(())
    }
    pub async fn delete(&self, uid: u64, options: &InboxMessageOptions) -> Result<()> {
        self.http
            .delete::<Value>(&format!("/inbox/{uid}"), &q(options)?)
            .await?;
        Ok(())
    }
}
resource!(Send);
impl Send {
    pub async fn email(&self, params: &SendParams) -> Result<SendResult> {
        let mut data = body(params)?;
        if nonempty_bcc(&params.bcc) {
            let id = request_id(&params.request_id)?;
            let mut result: SendResult = compose(&self.http, "/send-bcc", data, id.clone()).await?;
            result.request_id = Some(id);
            return Ok(result);
        }
        let obj = data.as_object_mut().unwrap();
        obj.remove("bcc");
        obj.remove("requestId");
        if let Addresses::Many(to) = &params.to {
            if to.is_empty() {
                return Err(Error::InvalidInput(
                    "At least one To or BCC recipient is required".into(),
                ));
            }
            if to.len() == 1 {
                obj.insert("to".into(), json!(to[0]));
            } else {
                obj.remove("to");
                let vars = obj.remove("variables");
                let recipients: Vec<Value> = to
                    .iter()
                    .map(|to| {
                        let mut r = json!({"to":to});
                        if let Some(v) = &vars {
                            r["variables"] = v.clone();
                        }
                        r
                    })
                    .collect();
                obj.insert("recipients".into(), json!(recipients));
            }
        }
        self.http.post("/send", data).await
    }
}
#[derive(Clone, Debug)]
pub struct Audience {
    pub contacts: Contacts,
    pub lists: AudienceLists,
}
impl Audience {
    pub(crate) fn new(http: Http) -> Self {
        Self {
            contacts: Contacts::new(http.clone()),
            lists: AudienceLists::new(http),
        }
    }
}
resource!(Contacts);
impl Contacts {
    pub async fn list(&self, params: &ContactListParams) -> Result<ContactListResult> {
        let mut v = body(params)?;
        if matches!(&params.tags,Some(tags) if tags.is_empty()) {
            v.as_object_mut().unwrap().remove("tags");
        }
        self.http.get("/audience/contacts", &q(&v)?).await
    }
    pub async fn search(&self, term: &str) -> Result<Vec<Contact>> {
        self.http
            .get("/audience/contacts", &[("q".into(), term.into())])
            .await
    }
    pub async fn get(&self, id: &str) -> Result<Contact> {
        self.http.get(&path("/audience/contacts", id)?, &[]).await
    }
    pub async fn create(&self, p: &CreateContactParams) -> Result<Contact> {
        self.http.post("/audience/contacts", body(p)?).await
    }
    pub async fn update(&self, id: &str, p: &UpdateContactParams) -> Result<Contact> {
        self.http
            .patch(&path("/audience/contacts", id)?, body(p)?)
            .await
    }
    pub async fn delete(&self, id: &str) -> Result<()> {
        self.http
            .delete::<Value>(&path("/audience/contacts", id)?, &[])
            .await?;
        Ok(())
    }
}
resource!(AudienceLists);
impl AudienceLists {
    pub async fn list(&self) -> Result<Vec<ContactList>> {
        self.http.get("/audience/lists", &[]).await
    }
    pub async fn get(&self, id: &str) -> Result<ContactList> {
        self.http.get(&path("/audience/lists", id)?, &[]).await
    }
    pub async fn create(&self, p: &CreateAudienceListParams) -> Result<ContactList> {
        self.http.post("/audience/lists", body(p)?).await
    }
    pub async fn delete(&self, id: &str) -> Result<()> {
        self.http
            .delete::<Value>(&path("/audience/lists", id)?, &[])
            .await?;
        Ok(())
    }
    pub fn members(&self, id: impl Into<String>) -> ListMembers {
        ListMembers {
            http: self.http.clone(),
            id: id.into(),
        }
    }
}
#[derive(Clone, Debug)]
pub struct ListMembers {
    http: Http,
    id: String,
}
impl ListMembers {
    fn path(&self) -> Result<String> {
        Ok(format!("{}/members", path("/audience/lists", &self.id)?))
    }
    pub async fn list(&self) -> Result<Vec<Contact>> {
        self.http.get(&self.path()?, &[]).await
    }
    pub async fn add(&self, contact_id: &str) -> Result<()> {
        self.http
            .post::<Value>(&self.path()?, json!({"contactId":contact_id}))
            .await?;
        Ok(())
    }
    pub async fn remove(&self, contact_id: &str) -> Result<()> {
        self.http
            .delete_body::<Value>(&self.path()?, json!({"contactId":contact_id}))
            .await?;
        Ok(())
    }
}
resource!(Suppressions);
impl Suppressions {
    pub async fn list(&self, p: &SuppressionListParams) -> Result<Vec<Suppression>> {
        self.http.get("/suppressions", &q(p)?).await
    }
    pub async fn add(&self, p: &AddSuppressionParams) -> Result<Suppression> {
        self.http.post("/suppressions", body(p)?).await
    }
    pub async fn remove(&self, id: &str) -> Result<()> {
        self.http
            .delete::<Value>(&path("/suppressions", id)?, &[])
            .await?;
        Ok(())
    }
}
resource!(Webhooks);
impl Webhooks {
    pub async fn list(&self, domain_id: Option<&str>) -> Result<Vec<Webhook>> {
        self.http
            .get(
                "/webhooks",
                &domain_id
                    .filter(|s| !s.is_empty())
                    .map(|d| vec![("domainId".into(), d.into())])
                    .unwrap_or_default(),
            )
            .await
    }
    pub async fn get(&self, id: &str) -> Result<Webhook> {
        self.http.get(&path("/webhooks", id)?, &[]).await
    }
    pub async fn create(&self, p: &CreateWebhookParams) -> Result<Webhook> {
        self.http.post("/webhooks", body(p)?).await
    }
    pub async fn update(&self, id: &str, p: &UpdateWebhookParams) -> Result<Webhook> {
        self.http.patch(&path("/webhooks", id)?, body(p)?).await
    }
    pub async fn delete(&self, id: &str) -> Result<()> {
        self.http
            .delete::<Value>(&path("/webhooks", id)?, &[])
            .await?;
        Ok(())
    }
    pub async fn test(&self, id: &str, p: &WebhookTestParams) -> Result<WebhookDispatchResult> {
        self.http
            .post(&format!("{}/test", path("/webhooks", id)?), body(p)?)
            .await
    }
    pub fn deliveries(&self, id: impl Into<String>) -> WebhookDeliveries {
        WebhookDeliveries {
            http: self.http.clone(),
            id: id.into(),
        }
    }
}
#[derive(Clone, Debug)]
pub struct WebhookDeliveries {
    http: Http,
    id: String,
}
impl WebhookDeliveries {
    fn path(&self) -> Result<String> {
        Ok(format!("{}/deliveries", path("/webhooks", &self.id)?))
    }
    pub async fn list(&self, p: &WebhookDeliveryListParams) -> Result<WebhookDeliveryListResult> {
        self.http.get(&self.path()?, &q(p)?).await
    }
    pub async fn get(&self, id: &str) -> Result<WebhookDelivery> {
        self.http.get(&path(&self.path()?, id)?, &[]).await
    }
    pub async fn replay(&self, id: &str) -> Result<WebhookDispatchResult> {
        self.http
            .post(&format!("{}/replay", path(&self.path()?, id)?), Value::Null)
            .await
    }
}
resource!(Logs);
impl Logs {
    pub async fn list(&self, p: &LogListParams) -> Result<Vec<MailLog>> {
        self.http.get("/logs", &q(p)?).await
    }
    pub async fn get(&self, id: &str) -> Result<MailLog> {
        self.http.get(&path("/logs", id)?, &[]).await
    }
}
