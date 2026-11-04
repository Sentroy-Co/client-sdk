use hmac::{Hmac, Mac};
use sentroy_client_sdk::vault::{verify_webhook, VaultClient, VaultConfig, WebhookError};
use sha2::Sha256;
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

struct Server {
    base: String,
    count: Arc<AtomicUsize>,
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}
impl Server {
    fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let count = Arc::new(AtomicUsize::new(0));
        let stop = Arc::new(AtomicBool::new(false));
        let (calls, stopped) = (count.clone(), stop.clone());
        let thread = thread::spawn(move || {
            while !stopped.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        stream
                            .set_read_timeout(Some(Duration::from_secs(2)))
                            .unwrap();
                        let mut buf = [0; 4096];
                        let n = stream.read(&mut buf).unwrap();
                        let request = String::from_utf8_lossy(&buf[..n]);
                        assert!(request.starts_with("GET /api/env-vault/fetch "));
                        calls.fetch_add(1, Ordering::SeqCst);
                        let value = if request
                            .to_ascii_lowercase()
                            .contains("bearer stk_env_second")
                        {
                            "second"
                        } else {
                            "first"
                        };
                        let body = format!(
                            r#"{{"data":{{"project":"p","environment":"prod","variables":[{{"key":"SECRET","value":"{}","type":"string","public":false}},{{"key":"PUBLIC","value":"visible","type":"string","public":true}}]}}}}"#,
                            value
                        );
                        write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(2))
                    }
                    Err(e) => panic!("{e}"),
                }
            }
        });
        Self {
            base,
            count,
            stop,
            thread: Some(thread),
        }
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        self.thread.take().unwrap().join().unwrap();
    }
}
fn client(base: &str, key: Option<&str>) -> Result<VaultClient, sentroy_client_sdk::Error> {
    VaultClient::new(VaultConfig {
        base_url: base.into(),
        api_key: key.map(str::to_owned),
        ..VaultConfig::default()
    })
}
fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

#[test]
fn cache_filter_refresh_and_client_isolation() {
    let server = Server::start();
    runtime().block_on(async {
        let first = client(&server.base, Some("stk_env_first")).unwrap();
        let second = client(&server.base, Some("stk_env_second")).unwrap();
        assert_eq!(first.get("SECRET").await.unwrap().as_deref(), Some("first"));
        assert_eq!(first.get("MISSING").await.unwrap(), None);
        assert!(first.get_or_throw("MISSING").await.is_err());
        assert_eq!(first.all().await.unwrap().len(), 2);
        let public = first.public().await.unwrap();
        assert_eq!(public.len(), 1);
        assert_eq!(public.get("PUBLIC").map(String::as_str), Some("visible"));
        assert_eq!(server.count.load(Ordering::SeqCst), 1);
        assert_eq!(
            second.get("SECRET").await.unwrap().as_deref(),
            Some("second")
        );
        first.refresh().await.unwrap();
        assert_eq!(server.count.load(Ordering::SeqCst), 3);
        first.set_cache_ttl(Duration::ZERO).await;
        first.preload().await.unwrap();
        assert_eq!(server.count.load(Ordering::SeqCst), 4);
        assert!(client(&server.base, Some("stk_wrong")).is_err());
    });
}

#[test]
fn concurrent_reads_share_fetch_and_webhook_invalidates() {
    let server = Server::start();
    runtime().block_on(async {
        let vault = client(&server.base, Some("stk_env_first")).unwrap();
        let mut tasks = Vec::new();
        for _ in 0..12 {
            let clone = vault.clone();
            tasks.push(tokio::spawn(async move { clone.get("SECRET").await.unwrap() }));
        }
        for task in tasks { assert_eq!(task.await.unwrap().as_deref(), Some("first")); }
        assert_eq!(server.count.load(Ordering::SeqCst), 1);
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
        let body = format!(r#"{{"event":"vault.variable.changed","project":"p","environment":"prod","action":"update","keys":["SECRET"],"timestamp":{now}}}"#);
        let signature = sign("secret", body.as_bytes());
        vault.handle_webhook("secret", &signature, body.as_bytes(), Duration::from_secs(300)).await.unwrap();
        vault.get("SECRET").await.unwrap();
        assert_eq!(server.count.load(Ordering::SeqCst), 2);
    });
}

fn sign(secret: &str, body: &[u8]) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(body);
    let mut result = String::from("sha256=");
    for byte in mac.finalize().into_bytes() {
        result.push_str(&format!("{byte:02x}"));
    }
    result
}

#[test]
fn webhook_authenticates_raw_bytes_and_checks_window() {
    let body = br#"{"event":"vault.variable.changed","project":"p","environment":"e","action":"delete","keys":["A"],"timestamp":1}"#;
    let sig = sign("secret", body);
    assert!(verify_webhook("secret", &sig, body, Duration::ZERO).is_ok());
    assert_eq!(
        verify_webhook("secret", &sig, body, Duration::from_secs(300)),
        Err(WebhookError::TimestampOutsideWindow)
    );
    let mut changed = body.to_vec();
    changed.push(b' ');
    assert_eq!(
        verify_webhook("secret", &sig, &changed, Duration::ZERO),
        Err(WebhookError::InvalidSignature)
    );
    assert_eq!(
        verify_webhook("secret", "sha256=bad", body, Duration::ZERO),
        Err(WebhookError::InvalidSignature)
    );
    let invalid = b"not json";
    assert_eq!(
        verify_webhook("secret", &sign("secret", invalid), invalid, Duration::ZERO),
        Err(WebhookError::InvalidBody)
    );
}
