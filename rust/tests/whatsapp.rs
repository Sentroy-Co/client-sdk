use sentroy_client_sdk::types::whatsapp::{UpdateWhatsAppTemplateParams, WhatsAppAudienceEntryInput};
use serde_json::json;

#[test]
fn updates_distinguish_omission_from_null() {
    let params = UpdateWhatsAppTemplateParams { media_url: Some(None), category: Some(Some("news".into())), ..Default::default() };
    assert_eq!(serde_json::to_value(&params).unwrap(), json!({"mediaUrl": null, "category": "news"}));
    let parsed: UpdateWhatsAppTemplateParams = serde_json::from_value(json!({"mediaUrl": null})).unwrap();
    assert_eq!(parsed.media_url, Some(None));
    assert_eq!(parsed.category, None);
}
#[test]
fn audience_accepts_phone_or_entry() {
    let entries: Vec<WhatsAppAudienceEntryInput> = serde_json::from_value(json!(["123", {"phone": "456", "variables": {"name": "Ada"}}])).unwrap();
    assert_eq!(serde_json::to_value(entries).unwrap(), json!(["123", {"phone": "456", "variables": {"name": "Ada"}}]));
}
