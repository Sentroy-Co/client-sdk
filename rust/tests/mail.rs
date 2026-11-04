use sentroy_client_sdk::{Sentroy, types::mail::{Addresses, SendParams, SaveDraftParams}};
use serde_json::{json, Value};
use std::{io::{Read, Write}, net::TcpListener, sync::mpsc};

fn server(status: &str, response: Value) -> (String, mpsc::Receiver<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (tx, rx) = mpsc::channel();
    let status = status.to_owned();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
        let mut request = Vec::new();
        let mut buf = [0u8; 4096];
        loop {
            let n = stream.read(&mut buf).unwrap();
            if n == 0 { break; }
            request.extend_from_slice(&buf[..n]);
            if let Some(end) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&request[..end]);
                let length: usize = headers.lines().find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length").then(|| value.trim().parse().unwrap())
                }).unwrap_or(0);
                if request.len() >= end + 4 + length { break; }
            }
        }
        tx.send(String::from_utf8(request).unwrap()).unwrap();
        let data=response.to_string();
        write!(stream, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", data.len(), data).unwrap();
    });
    (format!("http://{address}"), rx)
}
fn payload(request: &str) -> Value { serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap() }
fn send_params() -> SendParams {
    SendParams { to: Addresses::Many(vec!["one@example.test".into(), "two@example.test".into()]), from:"from@example.test".into(), subject:"Test".into(), domain_id:"domain".into(), variables:Some([("name".into(),json!("Ada"))].into_iter().collect()), ..Default::default() }
}
#[tokio::test]
async fn multiple_to_is_a_personalized_batch() {
    let (base, rx) = server("200 OK", json!({"data":{"status":"queued"}}));
    let client = Sentroy::new(base, "acme", "stk_test").unwrap();
    client.send.email(&send_params()).await.unwrap();
    let request=rx.recv().unwrap();
    assert!(request.starts_with("POST /api/mail/companies/acme/send HTTP/1.1\r\n"));
    let body=payload(&request);
    assert_eq!(body["recipients"], json!([{"to":"one@example.test","variables":{"name":"Ada"}},{"to":"two@example.test","variables":{"name":"Ada"}}]));
    assert!(body.get("to").is_none());
    assert!(body.get("requestId").is_none());
}
#[tokio::test]
async fn bcc_failure_preserves_request_id_and_uses_only_versioned_endpoint() {
    let (base, rx) = server("503 Service Unavailable", json!({"error":"temporary"}));
    let client = Sentroy::new(base, "acme", "stk_test").unwrap();
    let id="017f22e2-79b0-7cc3-98c4-dc0c0c07398f";
    let params=SendParams { bcc:Some(Addresses::One("private@example.test".into())), request_id:Some(id.into()), ..send_params() };
    let error=client.send.email(&params).await.unwrap_err();
    assert_eq!(error.compose_request_id(),Some(id));
    let request=rx.recv().unwrap();
    assert!(request.starts_with("POST /api/mail/companies/acme/send-bcc HTTP/1.1\r\n"));
    assert_eq!(payload(&request)["requestId"], id);
}
#[tokio::test]
async fn draft_bcc_uses_separate_versioned_route() {
    let (base, rx) = server("200 OK", json!({"data":{"status":"saved"}}));
    let client = Sentroy::new(base, "acme", "stk_test").unwrap();
    let p=SaveDraftParams { mailbox:"from@example.test".into(), bcc:Some(Addresses::Many(vec!["private@example.test".into()])), ..Default::default() };
    let result=client.inbox.save_draft(&p).await.unwrap();
    let request=rx.recv().unwrap();
    assert!(request.starts_with("POST /api/mail/companies/acme/inbox/drafts-bcc-v1 HTTP/1.1\r\n"));
    assert_eq!(payload(&request)["requestId"], result.request_id.unwrap());
}
#[tokio::test]
async fn audience_member_removal_uses_delete_json_body_and_encodes_id() {
    let (base, rx) = server("200 OK", json!({"data":{"message":"ok"}}));
    let client = Sentroy::new(base, "acme", "stk_test").unwrap();
    client.audience.lists.members("list/a").remove("contact").await.unwrap();
    let request=rx.recv().unwrap();
    assert!(request.starts_with("DELETE /api/mail/companies/acme/audience/lists/list%2Fa/members HTTP/1.1\r\n"));
    assert_eq!(payload(&request),json!({"contactId":"contact"}));
}

#[tokio::test]
async fn contacts_pagination_and_tags_are_encoded() {
    use sentroy_client_sdk::types::mail::ContactListParams;
    let (base, rx) = server("200 OK", json!({"data":{"contacts":[],"total":0,"page":2,"limit":25}}));
    let client = Sentroy::new(base, "acme", "stk_test").unwrap();
    let p=ContactListParams { page:Some(2), limit:Some(25), tags:Some(vec!["alpha".into(),"two words".into()]), ..Default::default() };
    client.audience.contacts.list(&p).await.unwrap();
    let request=rx.recv().unwrap();
    let target=request.lines().next().unwrap().split_whitespace().nth(1).unwrap();
    let url=url::Url::parse(&format!("http://localhost{target}")).unwrap();
    let pairs:std::collections::HashMap<_,_> = url.query_pairs().into_owned().collect();
    assert_eq!(pairs.get("page").map(String::as_str),Some("2"));
    assert_eq!(pairs.get("limit").map(String::as_str),Some("25"));
    assert_eq!(pairs.get("tags").map(String::as_str),Some("alpha,two words"));
}
#[tokio::test]
async fn typed_http_error_exposes_status_and_server_body() {
    let (base, _rx) = server("403 Forbidden", json!({"error":"permission denied"}));
    let client=Sentroy::new(base,"acme","stk_test").unwrap();
    let err=client.domains.list().await.unwrap_err();
    assert_eq!(err.status_code(),Some(403));
    assert_eq!(err.body().unwrap()["error"],"permission denied");
}
#[tokio::test]
async fn uppercase_request_id_is_normalized_in_receipt_and_request() {
    let (base,rx)=server("200 OK",json!({"data":{"status":"queued"}}));
    let client=Sentroy::new(base,"acme","stk_test").unwrap();
    let id="017F22E2-79B0-7CC3-98C4-DC0C0C07398F";
    let p=SendParams { bcc:Some(Addresses::One("bcc@example.test".into())), request_id:Some(id.into()), ..send_params() };
    let result=client.send.email(&p).await.unwrap();
    assert_eq!(result.request_id.as_deref(),Some(id.to_ascii_lowercase().as_str()));
    assert_eq!(payload(&rx.recv().unwrap())["requestId"],id.to_ascii_lowercase());
}
#[tokio::test]
async fn compose_rejects_redirect_and_oversized_receipt() {
    for (status, response) in [
        ("302 Found",json!({"data":{"status":"queued"}})),
        ("200 OK",json!({"data":{"status":"queued","padding":"x".repeat(5000)}})),
    ] {
        let (base,rx)=server(status,response);
        let client=Sentroy::new(base,"acme","stk_test").unwrap();
        let p=SendParams { bcc:Some(Addresses::One("bcc@example.test".into())), ..send_params() };
        let err=client.send.email(&p).await.unwrap_err();
        assert!(err.compose_request_id().is_some());
        assert!(rx.recv().unwrap().contains("/send-bcc"));
    }
}
#[test]
fn localized_values_and_nullable_fields_round_trip() {
    use sentroy_client_sdk::types::mail::{LocalizedString,MessageAddress,MessageSummary};
    let localized:LocalizedString=serde_json::from_value(json!({"en":"Hello","tr":"Merhaba"})).unwrap();
    assert_eq!(serde_json::to_value(localized).unwrap(),json!({"en":"Hello","tr":"Merhaba"}));
    let m=MessageSummary { from:MessageAddress::default(), message_id:None, in_reply_to:None, ..Default::default() };
    let serialized=serde_json::to_value(&m).unwrap();
    assert_eq!(serialized["messageId"],Value::Null);
    let decoded:MessageSummary=serde_json::from_value(serialized).unwrap();
    assert!(decoded.message_id.is_none() && decoded.in_reply_to.is_none());
}
#[tokio::test]
async fn other_mail_resource_lists_use_their_expected_routes() {
    use sentroy_client_sdk::types::mail::{TemplateListParams, SuppressionListParams, LogListParams};
    for path in ["mailboxes","templates","suppressions","webhooks","logs"] {
        let (base,rx)=server("200 OK",json!({"data":[]}));
        let client=Sentroy::new(base,"acme","stk_test").unwrap();
        match path {
            "mailboxes" => { client.mailboxes.list().await.unwrap(); },
            "templates" => { client.templates.list(&TemplateListParams::default()).await.unwrap(); },
            "suppressions" => { client.suppressions.list(&SuppressionListParams::default()).await.unwrap(); },
            "webhooks" => { client.webhooks.list(None).await.unwrap(); },
            "logs" => { client.logs.list(&LogListParams::default()).await.unwrap(); },
            _ => unreachable!(),
        }
        let request=rx.recv().unwrap();
        assert!(request.starts_with(&format!("GET /api/mail/companies/acme/{path} HTTP/1.1\r\n")));
    }
}

#[tokio::test]
async fn compose_does_not_follow_redirect_or_retry() {
    use std::sync::{Arc,atomic::{AtomicUsize,Ordering}};
    let listener=TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let address=listener.local_addr().unwrap();
    let attempts=Arc::new(AtomicUsize::new(0));
    let observed=attempts.clone();
    let worker=std::thread::spawn(move || {
        let deadline=std::time::Instant::now()+std::time::Duration::from_millis(700);
        while std::time::Instant::now()<deadline {
            match listener.accept() {
                Ok((mut stream,_)) => {
                    observed.fetch_add(1,Ordering::SeqCst);
                    let mut buf=[0u8;4096];
                    stream.set_read_timeout(Some(std::time::Duration::from_millis(500))).unwrap();
                    let _=stream.read(&mut buf);
                    let response=format!("HTTP/1.1 302 Found\r\nLocation: http://{address}/redirected\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}");
                    let _=stream.write_all(response.as_bytes());
                }
                Err(e) if e.kind()==std::io::ErrorKind::WouldBlock => std::thread::sleep(std::time::Duration::from_millis(5)),
                Err(e) => panic!("{e}"),
            }
        }
    });
    let client=Sentroy::new(format!("http://{address}"),"acme","stk_test").unwrap();
    let p=SendParams { bcc:Some(Addresses::One("bcc@example.test".into())), ..send_params() };
    assert!(client.send.email(&p).await.unwrap_err().compose_request_id().is_some());
    worker.join().unwrap();
    assert_eq!(attempts.load(Ordering::SeqCst),1);
}
