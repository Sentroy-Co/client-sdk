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

#[tokio::test]
async fn sends_to_whatsapp_with_company_scope_and_preserves_json() {
    use std::io::{Read, Write};
    use sentroy_client_sdk::{Sentroy, types::whatsapp::WhatsAppSendParams};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
        let mut bytes = Vec::new(); let mut buf = [0; 4096];
        let end = loop {
            let n = stream.read(&mut buf).unwrap(); assert!(n > 0); bytes.extend_from_slice(&buf[..n]);
            if let Some(i) = bytes.windows(4).position(|v| v == b"\r\n\r\n") { break i + 4; }
        };
        let headers = String::from_utf8_lossy(&bytes[..end]);
        let len = headers.lines().find_map(|line| {
            let (key, value) = line.split_once(':')?;
            if key.eq_ignore_ascii_case("content-length") { value.trim().parse::<usize>().ok() } else { None }
        }).unwrap();
        while bytes.len() < end + len {
            let n = stream.read(&mut buf).unwrap(); assert!(n > 0); bytes.extend_from_slice(&buf[..n]);
        }
        tx.send(String::from_utf8_lossy(&bytes).into_owned()).unwrap();
        let body = br#"{"data":{"total":1,"sent":1,"failed":0,"results":[{"to":"123","status":"sent","waMessageId":"wa"}]}}"#;
        write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()).unwrap();
        stream.write_all(body).unwrap();
    });
    let client = Sentroy::new(format!("http://{}", address), "co", "token").unwrap();
    let result = client.whatsapp.send(&WhatsAppSendParams { to: Some("123".into()), body: Some("Hello".into()), ..Default::default() }).await.unwrap();
    assert_eq!(result.results[0].wa_message_id.as_deref(), Some("wa"));
    let request = rx.recv().unwrap();
    assert!(request.starts_with("POST /api/whatsapp/companies/co/send "));
    let payload: serde_json::Value = serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(payload, json!({"to":"123", "body":"Hello"}));
}
