# Sentroy Rust SDK

Async native Rust client for Mail, Storage, WhatsApp, Auth, Env Vault and MCP.
This source package follows TypeScript SDK 2.18.3 at commit
`326f131dec57c8e8a4dd6b2f8eb18020a772e861`. Rust 1.88 or newer is required.

The package is being prepared as version 0.1.0; no crates.io publication is
performed by this change. React components, browser UI and the Node CLI remain
TypeScript products. Rust exposes portable service APIs and native integration
helpers instead of pretending to run browser ceremonies.

```rust,no_run
use sentroy_client_sdk::Sentroy;
# async fn example() -> Result<(), Box<dyn std::error::Error>> {
let client = Sentroy::new("https://sentroy.com", "my-company", std::env::var("SENTROY_TOKEN")?)?;
let domains = client.domains.list().await?;
println!("{} domains", domains.len());
# Ok(()) }
```

Transport does not automatically follow HTTP redirects or retry application
requests. BCC compose errors retain the request UUID for explicit recovery.
Authentication namespaces for REST, Vault and MCP are separate.
