use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sentroy_client_sdk::mcp::{
    connect_sentroy_mcp, connect_sentroy_mcp_with_provider, McpApp, McpClientInfo,
    McpResourceOptions, McpTokenProvider,
};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

const HASH: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const ID: &str = "123e4567-e89b-42d3-a456-426614174000";
const CONNECTION: &str = "0123456789abcdef01234567";
const EXPIRY: &str = "2099-01-01T00:00:00.000Z";
const REV: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async fn mock() -> (
    String,
    Arc<AtomicUsize>,
    Arc<Mutex<Vec<String>>>,
    tokio::task::JoinHandle<()>,
) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let count = Arc::new(AtomicUsize::new(0));
    let counter = count.clone();
    let seen = Arc::new(Mutex::new(Vec::new()));
    let events = seen.clone();
    let task = tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                break;
            };
            let counter = counter.clone();
            let events = events.clone();
            tokio::spawn(async move {
                let mut data = Vec::new();
                let mut buf = [0u8; 4096];
                let end = loop {
                    let Ok(n) = socket.read(&mut buf).await else {
                        return;
                    };
                    if n == 0 {
                        return;
                    }
                    data.extend_from_slice(&buf[..n]);
                    if let Some(pos) = data.windows(4).position(|x| x == b"\r\n\r\n") {
                        break pos + 4;
                    }
                    if data.len() > 32768 {
                        return;
                    }
                };
                let header = String::from_utf8_lossy(&data[..end]).to_string();
                let len = header
                    .lines()
                    .find_map(|line| {
                        let (k, v) = line.split_once(':')?;
                        k.eq_ignore_ascii_case("content-length")
                            .then(|| v.trim().parse::<usize>().ok())
                            .flatten()
                    })
                    .unwrap_or(0);
                while data.len() < end + len {
                    let Ok(n) = socket.read(&mut buf).await else {
                        return;
                    };
                    if n == 0 {
                        return;
                    }
                    data.extend_from_slice(&buf[..n]);
                }
                events.lock().unwrap().push(format!(
                    "{} {}",
                    header.to_ascii_lowercase(),
                    String::from_utf8_lossy(&data[end..end + len])
                ));
                let line = header.lines().next().unwrap_or("");
                let mut parts = line.split_whitespace();
                let method = parts.next().unwrap_or("");
                let path = parts.next().unwrap_or("");
                let (status, content_type, body) = if path.starts_with("/mcp/acme/") {
                    counter.fetch_add(1, Ordering::SeqCst);
                    let a = format!("authorization: bearer mcp_{}", "a".repeat(43));
                    let b = format!("authorization: bearer mcp_{}", "b".repeat(43));
                    if !header.to_ascii_lowercase().contains(&a)
                        && !header.to_ascii_lowercase().contains(&b)
                    {
                        return;
                    }
                    if path.contains("ffffffffffffffffffffffff") {
                        return;
                    }
                    if path.contains("/contacts/imports/") {
                        ("200 OK","application/json",json!({"uploadId":ID,"state":"ready","count":1,"fileHash":HASH,"expiresAt":EXPIRY}).to_string())
                    } else if path.contains("/uploads/") {
                        ("200 OK","application/json",json!({"uploadId":ID,"name":"test.txt","mimeType":"text/plain","bytes":3,"sha256":HASH,"expiresAt":EXPIRY,
                            "bucket":{"id":CONNECTION,"slug":"bucket","revision":REV},"state":"ready","revision":REV,"published":false,"malwareScanned":false,"requiresHumanApproval":true}).to_string())
                    } else {
                        ("200 OK", "application/octet-stream", "abc".to_owned())
                    }
                } else if method == "POST" {
                    let message: Value =
                        serde_json::from_slice(&data[end..end + len]).unwrap_or(Value::Null);
                    if message.get("method").and_then(Value::as_str) == Some("initialize") {
                        ("200 OK","application/json",json!({"jsonrpc":"2.0","id":message["id"],"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{}},"serverInfo":{"name":"mock","version":"1"}}}).to_string())
                    } else if message.get("method").and_then(Value::as_str) == Some("tools/list") {
                        (
                            "200 OK",
                            "application/json",
                            json!({"jsonrpc":"2.0","id":message["id"],"result":{"tools":[]}})
                                .to_string(),
                        )
                    } else {
                        ("202 Accepted", "application/json", String::new())
                    }
                } else {
                    ("405 Method Not Allowed", "text/plain", String::new())
                };
                let response=format!("HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
                let _ = socket.write_all(response.as_bytes()).await;
            });
        }
    });
    (format!("http://{address}"), count, seen, task)
}
fn options(app: McpApp, origin: &str) -> McpResourceOptions {
    McpResourceOptions {
        app,
        company_slug: "acme".into(),
        origin: Some(origin.into()),
    }
}
#[tokio::test]
async fn private_transfers_bind_targets_and_validate_contents() {
    let (origin, count, _seen, task) = mock().await;
    let token = format!("mcp_{}", "a".repeat(43));
    let mail = connect_sentroy_mcp(&options(McpApp::Mail, &origin), &token)
        .await
        .unwrap();
    let base = format!("{origin}/mcp/acme");
    let export = json!({"exportId":ID,"format":"csv","bytes":3,"fileHash":HASH,"expiresAt":EXPIRY,
        "downloadUrl":format!("{base}/contacts/exports/{ID}?connection={CONNECTION}&hash={HASH}"),"requiresOriginalBearer":true});
    assert_eq!(
        mail.download_mail_contacts_export(&export, None)
            .await
            .unwrap(),
        b"abc"
    );
    let import = json!({"uploadId":ID,"bytes":3,"fileHash":HASH,"expiresAt":EXPIRY,
        "uploadUrl":format!("{base}/contacts/imports/{ID}?connection={CONNECTION}"),"requiresOriginalBearer":true});
    assert_eq!(
        mail.upload_mail_contacts_import(&import, b"abc", None)
            .await
            .unwrap()["state"],
        "ready"
    );
    let before = count.load(Ordering::SeqCst);
    assert!(mail
        .upload_mail_contacts_import(&import, b"bad", None)
        .await
        .is_err());
    let mut cross_origin = export.clone();
    cross_origin["downloadUrl"] = json!("http://localhost:1/contacts/exports/x");
    assert!(mail
        .download_mail_contacts_export(&cross_origin, None)
        .await
        .is_err());
    assert_eq!(count.load(Ordering::SeqCst), before);
    let encoded=URL_SAFE_NO_PAD.encode(serde_json::to_vec(&json!({"partId":"1.2","reference":{"companyId":"c","mailbox":"a@example.com","folder":"INBOX","uidValidity":"1","uid":1}})).unwrap());
    let attachment = json!({"downloadUrl":format!("{base}/attachments/{encoded}?connection={CONNECTION}&version={REV}"),"requiresAuthorization":true,
        "method":"GET","attachment":{"partId":"1.2","encodedSize":3},"maxBytes":3});
    assert_eq!(
        mail.download_mail_attachment(&attachment, None)
            .await
            .unwrap(),
        b"abc"
    );
    let mut wrong_part = attachment.clone();
    wrong_part["attachment"]["partId"] = json!("1.3");
    assert!(mail
        .download_mail_attachment(&wrong_part, None)
        .await
        .is_err());

    let storage = connect_sentroy_mcp(&options(McpApp::Storage, &origin), &token)
        .await
        .unwrap();
    let download = json!({"downloadUrl":format!("{base}/files/bucket/{CONNECTION}?connection={CONNECTION}&version=2026-01-01T00%3A00%3A00.000Z"),
        "requiresAuthorization":true,"method":"GET","file":{"id":CONNECTION,"size":3}});
    assert_eq!(
        storage.download_file(&download, None).await.unwrap(),
        b"abc"
    );
    let upload = json!({"uploadId":ID,"name":"test.txt","mimeType":"text/plain","bytes":3,"sha256":HASH,"expiresAt":EXPIRY,
        "bucket":{"id":CONNECTION,"slug":"bucket","revision":REV},"state":"waiting","revision":REV,"published":false,
        "malwareScanned":false,"requiresHumanApproval":true,"requiresOriginalBearer":true,"method":"PUT",
        "contentType":"application/octet-stream","uploadUrl":format!("{base}/uploads/{ID}?connection={CONNECTION}")});
    assert_eq!(
        storage
            .upload_storage_file(&upload, b"abc", None)
            .await
            .unwrap()["state"],
        "ready"
    );
    assert_eq!(count.load(Ordering::SeqCst), 5);
    let mut too_small = attachment.clone();
    too_small["maxBytes"] = json!(2);
    assert!(mail
        .download_mail_attachment(&too_small, None)
        .await
        .is_err());
    let mut disconnected = import.clone();
    disconnected["uploadUrl"] = json!(format!(
        "{base}/contacts/imports/{ID}?connection=ffffffffffffffffffffffff"
    ));
    let error = mail
        .upload_mail_contacts_import(&disconnected, b"abc", None)
        .await
        .unwrap_err();
    assert!(error.to_string().contains("mcp_upload_outcome_unknown"));
    assert_eq!(count.load(Ordering::SeqCst), 7);
    task.abort();
}

#[tokio::test]
async fn token_provider_refreshes_rpc_and_private_requests_and_closes() {
    let (origin, count, seen, task) = mock().await;
    let current = Arc::new(Mutex::new(format!("mcp_{}", "a".repeat(43))));
    let source = current.clone();
    let provider = McpTokenProvider::new(move || {
        let token = source.lock().unwrap().clone();
        async move { Ok(token) }
    });
    let mut client = connect_sentroy_mcp_with_provider(
        &options(McpApp::Mail, &origin),
        provider,
        Some(McpClientInfo {
            name: "custom-client".into(),
            version: "9".into(),
        }),
    )
    .await
    .unwrap();
    *current.lock().unwrap() = format!("mcp_{}", "b".repeat(43));
    client.client.peer().list_tools(None).await.unwrap();
    let base = format!("{origin}/mcp/acme");
    let export = json!({"exportId":ID,"format":"csv","bytes":3,"fileHash":HASH,"expiresAt":EXPIRY,
        "downloadUrl":format!("{base}/contacts/exports/{ID}?connection={CONNECTION}&hash={HASH}"),"requiresOriginalBearer":true});
    assert_eq!(
        client
            .download_mail_contacts_export(&export, None)
            .await
            .unwrap(),
        b"abc"
    );
    let events = seen.lock().unwrap().clone();
    assert!(events
        .iter()
        .any(|e| e.contains("custom-client") && e.contains("\"version\":\"9\"")));
    let b = format!("authorization: bearer mcp_{}", "b".repeat(43));
    assert!(events
        .iter()
        .any(|e| e.contains("\"method\":\"tools/list\"") && e.contains(&b)));
    assert!(events
        .iter()
        .any(|e| e.contains("/contacts/exports/") && e.contains(&b)));
    *current.lock().unwrap() = "stk_invalid".into();
    let before = count.load(Ordering::SeqCst);
    assert!(client
        .download_mail_contacts_export(&export, None)
        .await
        .is_err());
    assert_eq!(count.load(Ordering::SeqCst), before);
    *current.lock().unwrap() = format!("mcp_{}", "b".repeat(43));
    client.close().await.unwrap();
    assert!(client.client.is_closed());
    task.abort();
}

#[tokio::test]
async fn invalid_provider_fails_before_network_io() {
    let (origin, _count, seen, task) = mock().await;
    let provider = McpTokenProvider::new(|| async { Ok("stk_not_an_mcp_token".to_owned()) });
    let result =
        connect_sentroy_mcp_with_provider(&options(McpApp::Mail, &origin), provider, None).await;
    assert!(result.is_err());
    assert!(seen.lock().unwrap().is_empty());
    task.abort();
}
