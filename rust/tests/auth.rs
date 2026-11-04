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
