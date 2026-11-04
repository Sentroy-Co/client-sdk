use sentroy_client_sdk::mcp::{connect_sentroy_mcp, McpApp, McpResourceOptions};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let options = McpResourceOptions {
        app: McpApp::Mail,
        company_slug: std::env::var("SENTROY_COMPANY_SLUG")?,
        origin: None,
    };
    let token = std::env::var("SENTROY_MCP_TOKEN")?;
    let mut connection = connect_sentroy_mcp(&options, &token).await?;
    // Use connection.client.peer() for protocol operations; writes may require approval.
    connection.close().await?;
    Ok(())
}
