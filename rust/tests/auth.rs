use sentroy_client_sdk::auth::{SentroyAuth, Session};
use serde_json::json;
use std::time::Duration;

#[tokio::test]
async fn session_round_trip_and_debug_redaction() {
    let session = Session { access_token: "access-secret".into(), refresh_token: "refresh-secret".into(), user: json!({"id":"u1"}) };
    let serialized = serde_json::to_string(&session).unwrap();
    assert!(serialized.contains("\"accessToken\""));
    let restored: Session = serde_json::from_str(&serialized).unwrap();
    assert_eq!(restored.refresh_token, "refresh-secret");
    assert!(!format!("{restored:?}").contains("secret"));
    let client = SentroyAuth::new("https://auth.sentroy.com", "demo", None, Duration::from_secs(5)).unwrap();
    client.set_session(restored).await;
    assert_eq!(client.session().await.unwrap().user["id"], "u1");
    client.clear_session().await;
    assert!(client.session().await.is_none());
}
#[test]
fn social_url_encodes_redirect() {
    let client = SentroyAuth::new("https://auth.sentroy.com", "demo", None, Duration::from_secs(5)).unwrap();
    let url = client.social_authorize_url("google", Some("myapp://callback?a=1&b=2"), true).unwrap();
    let parsed = url::Url::parse(&url).unwrap();
    assert_eq!(parsed.path(), "/api/v1/auth/demo/social/google/authorize");
    let pairs: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
    assert_eq!(pairs.get("redirectUri").unwrap(), "myapp://callback?a=1&b=2");
    assert_eq!(pairs.get("rememberMe").unwrap(), "1");
    assert!(client.social_authorize_url("unknown", None, false).is_err());
}


// The following loopback server reads one request and closes after its reply.
async fn request_head(stream: &mut tokio::net::TcpStream) {
    use tokio::io::AsyncReadExt;
    let mut buf = [0u8; 4096];
    let mut data = Vec::new();
    while !data.windows(4).any(|v| v == b"\r\n\r\n") {
        let n = stream.read(&mut buf).await.unwrap();
        assert!(n > 0);
        data.extend_from_slice(&buf[..n]);
    }
}
async fn reply(stream: &mut tokio::net::TcpStream, body: &str) {
    use tokio::io::AsyncWriteExt;
    let response = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
    stream.write_all(response.as_bytes()).await.unwrap();
}
fn session_with(token: &str) -> Session {
    Session { access_token: format!("access-{token}"), refresh_token: format!("refresh-{token}"), user: json!({"id": token}) }
}
#[tokio::test]
async fn concurrent_refreshes_share_one_rotation() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut s, _) = listener.accept().await.unwrap();
        request_head(&mut s).await;
        tokio::time::sleep(Duration::from_millis(100)).await;
        reply(&mut s, r#"{"accessToken":"new-access","refreshToken":"new-refresh","expiresIn":3600,"tokenType":"Bearer"}"#).await;
    });
    let client = SentroyAuth::new(base, "demo", None, Duration::from_secs(2)).unwrap();
    client.set_session(session_with("old")).await;
    let (a, b) = tokio::join!(client.refresh(), client.refresh());
    assert_eq!(a.unwrap()["refreshToken"], "new-refresh");
    assert_eq!(b.unwrap()["refreshToken"], "new-refresh");
    assert_eq!(client.session().await.unwrap().refresh_token, "new-refresh");
    server.await.unwrap();
}
#[tokio::test]
async fn lost_refresh_ack_discards_consumed_token() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut s, _) = listener.accept().await.unwrap();
        request_head(&mut s).await;
        drop(s);
        // The client must not issue another request using the old refresh token.
        assert!(tokio::time::timeout(Duration::from_millis(300), listener.accept()).await.is_err());
    });
    let client = SentroyAuth::new(base, "demo", None, Duration::from_secs(2)).unwrap();
    client.set_session(session_with("old")).await;
    assert!(client.refresh().await.is_err());
    assert!(client.session().await.is_none());
    assert!(client.refresh().await.is_err());
    server.await.unwrap();
}
#[tokio::test]
async fn password_change_does_not_clear_new_session() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        let (mut s, _) = listener.accept().await.unwrap();
        request_head(&mut s).await;
        ready_tx.send(()).unwrap();
        release_rx.await.unwrap();
        reply(&mut s, "{}").await;
    });
    let client = SentroyAuth::new(base, "demo", None, Duration::from_secs(2)).unwrap();
    client.set_session(session_with("old")).await;
    let copy = client.clone();
    let request = tokio::spawn(async move { copy.change_password(json!({"currentPassword":"old","newPassword":"new"})).await });
    ready_rx.await.unwrap();
    client.set_session(session_with("new")).await;
    release_tx.send(()).unwrap();
    request.await.unwrap().unwrap();
    assert_eq!(client.session().await.unwrap().user["id"], "new");
    server.await.unwrap();
}


// Published jsonwebtoken test fixture, not a production key:
// https://github.com/Keats/jsonwebtoken/blob/v9.3.1/tests/rsa/private_rsa_key_pkcs1.pem
const TEST_RSA_DER_B64: &str = "MIIEpAIBAAKCAQEAyRE6rHuNR0QbHO3H3Kt2pOKGVhQqGZXInOduQNxXzuKlvQTLUTv4l4sggh5/CYYi/cvI+SXVT9kPWSKXxJXBXd/4LkvcPuUakBoAkfh+eiFVMh2VrUyWyj3MFl0HTVF9KwRXLAcwkREiS3npThHRyIxuy0ZMeZfxVL5arMhw1SRELB8HoGfG/AtH89BIE9jDBHZ9dLelK9a184zAf8LwoPLxvJb3Il5nncqPcSfKDDodMFBIMc4lQzDKL5gvmiXLXB1AGLm8KBjfE8s3L5xqi+yUod+j8MtvIj812dkS4QMiRVN/by2h3ZY8LYVGrqZXZTcgn2ujn8uKjXLZVD5TdQIDAQABAoIBAHREk0I0O9DvECKdWUpAmF3mY7oY9PNQiu44Yaf+AoSuyRpRUGTMIgc3u3eivOE8ALX0BmYUO5JtuRNZDpvt4SAwqCnVUinIf6C+eH/wSurCpapSM0BAHp4aOA7igptyOMgMPYBHNA1e9A7jE0dCxKWMl3DSWNyjQTk4zeRGEAEfbNjHrq6YCtjHSZSLmWiG80hnfnYos9hOr5JnLnyS7ZmFE/5P3XVrxLc/tQ5zum0R4cbrgzHiQP5RgfxGJaEi7XcgherCCOgurJSSbYH29Gz8u5fFbS+Yg8s+OiCss3cs1rSgJ9/eHZuzGEdUZVARH6hVMjSuwvqVTFaE8AgtleECgYEA+uLMn4kNqHlJS2A5uAnCkj90ZxEtNm3E8hAxUrhssktY5XSOAPBlxyf5RuRGIImGtUVIr4HuJSa5TX48n3Vdt9MYCprO/iYl6moNRSPt5qowIIOJmIjY2mqPDfDt/zw+fcDD3lmCJrFlzcnh0uea1CohxEbQnL3cypeLt+WbU6kCgYEAzSp19m1ajieFkqgoB0YTpt/OroDx38vvI5unInJlEeOjQ+oIAQdN2wpxBvTrRorMU6P07mFUbt1j+Co6CbNiw+X8HcCaqYLR5clbJOOWNR36PuzOpQLkfK8woupBxzW9B8gZmY8rB1mbJ+/WTPrEJy6YGmIEBkWylQ2VpW8O4O0CgYEApdbvvfFBlwD9YxbrcGz7MeNCFbMz+MucqQntIKoKJ91ImPxvtc0y6e/Rhnv0oyNlaUOwJVu0yNgNG117w0g4t/+Q38mvVC5xV7/cn7x9UMFk6MkqVir3dYGEqIl/OP1grY2Tq9HtB5iyG9L8NIamQOLMyUqqMUILxdthHyFmiGkCgYEAn9+PjpjGMPHxL0gj8Q8VbzsFtou6b1deIRRA2CHmSltltR1gYVTMwXxQeUhPMmgkMqUXzs4/WijgpthY44hK1TaZEKIuoxrS70nJ4WQLf5a9k1065fDsFZD6yGjdGxvwEmlGMZgTwqV7t1I4X0Ilqhav5hcs5apYL7gnPYPeRz0CgYALHCj/Ji8XSsDoF/MhVhnGdIs2P99NNdmo3R2Pv0CuZbDKMU559LJHUvrKS8WkuWRDuKrz1W/EQKApFjDGpdqToZqriUFQzwy7mR3ayIiogzNtHcvbDHx8oFnGY0OFksX/ye0/XGpy2SFxYRwGU98HPYeBvAQQrVjdkzfy7BmXQQ==";
const TEST_RSA_N: &str = "yRE6rHuNR0QbHO3H3Kt2pOKGVhQqGZXInOduQNxXzuKlvQTLUTv4l4sggh5_CYYi_cvI-SXVT9kPWSKXxJXBXd_4LkvcPuUakBoAkfh-eiFVMh2VrUyWyj3MFl0HTVF9KwRXLAcwkREiS3npThHRyIxuy0ZMeZfxVL5arMhw1SRELB8HoGfG_AtH89BIE9jDBHZ9dLelK9a184zAf8LwoPLxvJb3Il5nncqPcSfKDDodMFBIMc4lQzDKL5gvmiXLXB1AGLm8KBjfE8s3L5xqi-yUod-j8MtvIj812dkS4QMiRVN_by2h3ZY8LYVGrqZXZTcgn2ujn8uKjXLZVD5TdQ";
fn sign_test_token(kid: &str, claims: &serde_json::Value) -> String {
    use base64::Engine;
    let der = base64::engine::general_purpose::STANDARD.decode(TEST_RSA_DER_B64).unwrap();
    let mut h = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256);
    h.kid = Some(kid.to_string());
    jsonwebtoken::encode(&h, claims, &jsonwebtoken::EncodingKey::from_rsa_der(&der)).unwrap()
}
#[tokio::test]
async fn jwt_verification_enforces_claims_keys_and_cache() {
    use std::sync::{Arc, atomic::{AtomicBool, AtomicUsize, Ordering}};
    use sentroy_client_sdk::auth::SentroyAuthAdmin;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let count = Arc::new(AtomicUsize::new(0));
    let server_count = count.clone();
    let bad_key = Arc::new(AtomicBool::new(false));
    let server_bad_key = bad_key.clone();
    let server = tokio::spawn(async move {
        loop {
            let (mut s, _) = listener.accept().await.unwrap();
            request_head(&mut s).await;
            server_count.fetch_add(1, Ordering::SeqCst);
            let alg = if server_bad_key.load(Ordering::SeqCst) { "RS512" } else { "RS256" };
            let jwks = json!({"keys":[{"kty":"RSA","kid":"key-1","alg":alg,"use":"sig","n":TEST_RSA_N,"e":"AQAB"}]});
            reply(&mut s, &jwks.to_string()).await;
        }
    });
    let admin = SentroyAuthAdmin::new(&base, "demo", "aps_1234567890abcdef", Duration::from_secs(2), Duration::from_secs(60)).unwrap();
    let mut claims = json!({"sub":"u1","iss":format!("{base}/p/demo"),"aud":"aps_12345678","iat":1,"exp":4102444800u64});
    let good = sign_test_token("key-1", &claims);
    assert_eq!(admin.verify_id_token(&good).await.unwrap()["sub"], "u1");
    assert!(admin.verify_id_token(&sign_test_token("unknown", &claims)).await.is_err());
    claims["exp"] = json!(1);
    assert!(admin.verify_id_token(&sign_test_token("key-1", &claims)).await.is_err());
    claims["exp"] = json!(4102444800u64);
    claims["iss"] = json!("https://evil.example/p/demo");
    assert!(admin.verify_id_token(&sign_test_token("key-1", &claims)).await.is_err());
    claims["iss"] = json!(format!("{base}/p/demo"));
    claims["aud"] = json!("aps_");
    assert!(admin.verify_id_token(&sign_test_token("key-1", &claims)).await.is_err());
    let mut hs = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256);
    hs.kid = Some("key-1".into());
    let wrong_alg = jsonwebtoken::encode(&hs, &claims, &jsonwebtoken::EncodingKey::from_secret(b"secret")).unwrap();
    assert!(admin.verify_id_token(&wrong_alg).await.is_err());
    assert_eq!(count.load(Ordering::SeqCst), 1);
    admin.invalidate_jwks_cache().await;
    assert!(admin.verify_id_token(&good).await.is_ok());
    assert_eq!(count.load(Ordering::SeqCst), 2);
    bad_key.store(true, Ordering::SeqCst);
    admin.invalidate_jwks_cache().await;
    assert!(admin.verify_id_token(&good).await.is_err());
    assert_eq!(count.load(Ordering::SeqCst), 3);
    server.abort();
}

#[tokio::test]
async fn cancelled_refresh_does_not_replay_token() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let (tx, rx) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        request_head(&mut stream).await;
        tx.send(()).unwrap();
        assert!(tokio::time::timeout(Duration::from_millis(300), listener.accept()).await.is_err());
    });
    let client = SentroyAuth::new(base, "demo", None, Duration::from_secs(2)).unwrap();
    client.set_session(session_with("old")).await;
    let copy = client.clone();
    let task = tokio::spawn(async move { copy.refresh().await });
    rx.await.unwrap();
    task.abort();
    let _ = task.await;
    assert!(client.session().await.is_none());
    assert!(client.refresh().await.is_err());
    server.await.unwrap();
}
