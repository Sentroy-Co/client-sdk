# Sentroy Rust SDK

Async native client for Sentroy Mail, Storage, WhatsApp, Identity, Env Vault and MCP. This crate is **not published to crates.io**. Pin a reviewed Git commit, or use a local checkout:

```toml
[dependencies]
sentroy-client-sdk = { git = "https://github.com/Sentroy-Co/client-sdk.git", rev = "<reviewed-commit>", package = "sentroy-client-sdk" }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

For a local checkout use `sentroy-client-sdk = { path = "../client-sdk/rust" }`. Rust 1.89 or newer is required and checked in CI. Examples use Tokio. Run `cargo check --examples` and `cargo test` from this directory.

## Mail, storage and WhatsApp

```rust,no_run
use sentroy_client_sdk::Sentroy;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Sentroy::new(
        "https://sentroy.com",
        std::env::var("SENTROY_COMPANY_SLUG")?,
        std::env::var("SENTROY_API_KEY")?,
    )?;
    let domains = client.domains.list().await?;
    let buckets = client.buckets.list().await?;
    println!("{} domains; {} buckets", domains.len(), buckets.len());
    Ok(())
}
```

See [examples/rest.rs](examples/rest.rs) for an executable version. `Sentroy::builder(slug)` configures the base URL, token and timeout; its default timeout is 30 seconds. A token may be omitted, but the native client does not manage a browser cookie session. The root client routes through `/api/{mail,storage,whatsapp}/companies/{slug}`. Request and response models are in `types::{mail,storage,whatsapp}`; optional fields use `Option`.

Errors implement `std::error::Error`. `status_code()` and `body()` expose available API error details; response bodies can contain sensitive data and should not be logged blindly. For BCC send and draft operations the SDK uses a versioned endpoint and returns an error containing `compose_request_id()` on an uncertain outcome. Save that UUID and resolve or retry the same operation with the **same** ID; do not generate a fresh one after an unknown result. These requests use a 4 KiB receipt limit and do not follow redirects or retry automatically. Other JSON API responses are capped at 16 MiB. Non-BCC multi-recipient sends are normalized into personalized recipient entries.

## Identity and Vault

Identity and Vault are separate clients with separate credentials. [examples/identity_vault.rs](examples/identity_vault.rs) demonstrates a typed sign-in and a Vault lookup. Identity sessions are held in memory; clones share a session and serialize refreshes. The application owns secure persistence, refresh scheduling, browser redirects and any native WebAuthn integration. Passkey begin/complete calls expose protocol data; they do not invoke an authenticator. MFA can be returned instead of login tokens. Typed requests and responses cover signup, login, refresh, MFA, password reset, invitations and profile operations; raw JSON methods remain available for evolving server fields. `consume_redirect_fragment` accepts a callback fragment supplied and validated by your application, verifies the user through `/me`, and establishes the session. The admin user-list operation is unimplemented, matching the TypeScript source.

`VaultClient::new(VaultConfig::from_env())` reads `SENTROY_ENV_API_KEY` and the documented base URL environment variables. Its default cache TTL is five minutes and timeout is five seconds; clones share a cache. `get_with_fallback` explicitly falls back to the process environment on a miss or Vault failure. `public()` filters to variables marked public; `all()` includes private values. Verify Vault webhook signatures over the raw request bytes with `verify_webhook` or `handle_webhook` before processing, using `DEFAULT_WEBHOOK_MAX_AGE` for the five-minute replay window. `handle_webhook` invalidates lazily; call `refresh()` for an immediate fetch.

## MCP

[examples/mcp.rs](examples/mcp.rs) connects with an existing `mcp_` or `mcp_at_` token, exposes the official `rmcp` client, and closes the connection. Protocol model types are re-exported under `mcp::protocol`; `resource()` reports the immutable protected resource. MCP credentials are distinct from company `stk_`, Vault `stk_env_`, and Identity credentials. The SDK does not obtain consent, acquire or store tokens, or initiate tool calls on connection. Follow server approval requirements for writes.

The protocol transport uses official `rmcp`: its SSE event limit is 1 MiB, but other protocol response buffering and errors follow the upstream client and are not covered by the private-file limits below. Treat server-provided content and error text as untrusted and potentially sensitive. Automatic redirects, reconnect retries, and session reinitialization are disabled.

Private file helpers validate references and bind them to the connection, enforce size limits and avoid redirects or automatic retries. Storage downloads are bounded to 64 MiB, mail attachments to 8 MiB decoded (12 MiB encoded attachment metadata limit), contact files to 1 MiB, and storage uploads to 10 MiB. Downloads default to 60 seconds and uploads to 15 seconds, including the body; `TransferOptions` allows 1 millisecond–120 seconds. Lost upload acknowledgements require checking the existing operation status rather than starting a new one. See [PARITY.md](PARITY.md) for scope.

## Native boundaries and validation

React components, hooks, browser storage, cookie authentication, automatic browser redirects and the TypeScript CLI are not provided. The native SDK exposes portable service operations and leaves platform UI and credential storage to the application.

`python3 ../scripts/check_rust_parity.py` compares the TypeScript root resource method inventory with Rust public methods. It checks **presence**, not serialization, behavior or security parity. Unit and loopback tests provide separate contract checks; see [PARITY.md](PARITY.md).
