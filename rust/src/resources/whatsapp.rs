use crate::http::{query, segment, Http};
use crate::types::whatsapp::*;
use crate::Result;

#[derive(Debug, Clone)]
pub struct WhatsAppNumbers {
    http: Http,
}
impl WhatsAppNumbers {
    pub async fn list(&self) -> Result<Vec<WhatsAppNumber>> {
        self.http.get("/numbers", &[]).await
    }
}
#[derive(Debug, Clone)]
pub struct WhatsAppTemplates {
    http: Http,
}
impl WhatsAppTemplates {
    pub async fn list(&self) -> Result<Vec<WhatsAppTemplate>> {
        self.http.get("/templates", &[]).await
    }
    pub async fn get(&self, id: &str) -> Result<WhatsAppTemplate> {
        self.http
            .get(&format!("/templates/{}", segment(id)?), &[])
            .await
    }
    pub async fn create(&self, params: &CreateWhatsAppTemplateParams) -> Result<WhatsAppTemplate> {
        self.http
            .post("/templates", serde_json::to_value(params)?)
            .await
    }
    pub async fn update(
        &self,
        id: &str,
        params: &UpdateWhatsAppTemplateParams,
    ) -> Result<WhatsAppTemplate> {
        self.http
            .patch(
                &format!("/templates/{}", segment(id)?),
                serde_json::to_value(params)?,
            )
            .await
    }
    pub async fn delete(&self, id: &str) -> Result<()> {
        let _: serde_json::Value = self
            .http
            .delete(&format!("/templates/{}", segment(id)?), &[])
            .await?;
        Ok(())
    }
}
#[derive(Debug, Clone)]
pub struct WhatsAppAudiences {
    http: Http,
}
impl WhatsAppAudiences {
    pub async fn list(&self) -> Result<Vec<WhatsAppAudience>> {
        self.http.get("/audiences", &[]).await
    }
    pub async fn get(&self, id: &str) -> Result<WhatsAppAudience> {
        self.http
            .get(&format!("/audiences/{}", segment(id)?), &[])
            .await
    }
    pub async fn create(&self, params: &CreateWhatsAppAudienceParams) -> Result<WhatsAppAudience> {
        self.http
            .post("/audiences", serde_json::to_value(params)?)
            .await
    }
    pub async fn update(
        &self,
        id: &str,
        params: &UpdateWhatsAppAudienceParams,
    ) -> Result<WhatsAppAudience> {
        self.http
            .patch(
                &format!("/audiences/{}", segment(id)?),
                serde_json::to_value(params)?,
            )
            .await
    }
    pub async fn delete(&self, id: &str) -> Result<()> {
        let _: serde_json::Value = self
            .http
            .delete(&format!("/audiences/{}", segment(id)?), &[])
            .await?;
        Ok(())
    }
}
#[derive(Debug, Clone)]
pub struct WhatsAppLogs {
    http: Http,
}
impl WhatsAppLogs {
    pub async fn list(&self, params: &WhatsAppLogListParams) -> Result<WhatsAppLogListResult> {
        let mut q = query(params)?;
        q.retain(|(k, v)| !v.is_empty() && !((k == "page" || k == "limit") && v == "0"));
        self.http.get("/logs", &q).await
    }
}
#[derive(Debug, Clone)]
pub struct WhatsApp {
    http: Http,
    pub numbers: WhatsAppNumbers,
    pub templates: WhatsAppTemplates,
    pub audiences: WhatsAppAudiences,
    pub logs: WhatsAppLogs,
}
impl WhatsApp {
    pub(crate) fn new(http: Http) -> Self {
        Self {
            numbers: WhatsAppNumbers { http: http.clone() },
            templates: WhatsAppTemplates { http: http.clone() },
            audiences: WhatsAppAudiences { http: http.clone() },
            logs: WhatsAppLogs { http: http.clone() },
            http,
        }
    }
    pub async fn send(&self, params: &WhatsAppSendParams) -> Result<WhatsAppSendResult> {
        self.http.post("/send", serde_json::to_value(params)?).await
    }
}
