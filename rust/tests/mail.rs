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
