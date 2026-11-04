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
