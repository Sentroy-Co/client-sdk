use sentroy_client_sdk::auth::{SentroyAuth, SignInRequest, TypedLoginOutcome};
use sentroy_client_sdk::vault::{VaultClient, VaultConfig};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let identity = SentroyAuth::new(
        "https://auth.sentroy.com",
        std::env::var("SENTROY_AUTH_PROJECT_SLUG")?,
        std::env::var("SENTROY_AUTH_API_KEY").ok(),
        Duration::from_secs(30),
    )?;
    let outcome = identity
        .sign_in_typed(&SignInRequest {
            email: std::env::var("SENTROY_AUTH_EMAIL")?,
            password: std::env::var("SENTROY_AUTH_PASSWORD")?,
            remember_me: None,
        })
        .await?;
    match outcome {
        TypedLoginOutcome::Tokens(_) => println!("Signed in"),
        TypedLoginOutcome::Mfa(_) => println!("MFA verification required"),
    }

    let vault = VaultClient::new(VaultConfig::from_env())?;
    let present = vault.get("MY_SETTING").await?.is_some();
    println!("MY_SETTING is configured: {present}");
    Ok(())
}
