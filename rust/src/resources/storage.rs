use crate::http::{query, segment, Http};
use crate::types::storage::*;
use crate::Result;

#[derive(Debug, Clone)]
pub struct Buckets { http: Http }
impl Buckets {
    pub(crate) fn new(http: Http) -> Self { Self { http } }
    pub async fn list(&self) -> Result<Vec<Bucket>> { self.http.get("/buckets", &[]).await }
    pub async fn get(&self, slug: &str) -> Result<Bucket> {
        self.http.get(&format!("/buckets/{}", segment(slug)?), &[]).await
    }
    pub async fn create(&self, params: &CreateBucketParams) -> Result<Bucket> {
        self.http.post("/buckets", serde_json::to_value(params)?).await
    }
    pub async fn update(&self, slug: &str, params: &UpdateBucketParams) -> Result<Bucket> {
        self.http.patch(&format!("/buckets/{}", segment(slug)?), serde_json::to_value(params)?).await
    }
    pub async fn delete(&self, slug: &str, force: bool) -> Result<()> {
        let q = if force { vec![("force".into(), "true".into())] } else { vec![] };
        let _: serde_json::Value = self.http.delete(&format!("/buckets/{}", segment(slug)?), &q).await?;
        Ok(())
    }
}
#[derive(Debug, Clone)]
pub struct MediaResource { http: Http }
impl MediaResource {
    pub(crate) fn new(http: Http) -> Self { Self { http } }
    pub async fn list(&self, bucket_slug: &str, params: &MediaListParams) -> Result<MediaListResult> {
        self.http.get(&format!("/buckets/{}/media", segment(bucket_slug)?), &query(params)?).await
    }
    pub async fn get(&self, bucket_slug: &str, media_id: &str) -> Result<Media> {
        self.http.get(&format!("/buckets/{}/media/{}", segment(bucket_slug)?, segment(media_id)?), &[]).await
    }
    pub async fn upload(&self, bucket_slug: &str, params: UploadMediaParams) -> Result<Media> {
        let filename = params.filename.filter(|s| !s.is_empty()).unwrap_or_else(|| "upload.bin".into());
        let mut part = reqwest::multipart::Part::bytes(params.body).file_name(filename);
        if let Some(mime) = params.mime_type { part = part.mime_str(&mime)?; }
        let mut form = reqwest::multipart::Form::new().part("file", part);
        if let Some(v) = params.folder.filter(|s| !s.is_empty()) { form = form.text("folder", v); }
        if let Some(v) = params.is_public { form = form.text("public", v.to_string()); }
        if let Some(v) = params.alt.filter(|s| !s.is_empty()) { form = form.text("alt", v); }
        if let Some(v) = params.caption.filter(|s| !s.is_empty()) { form = form.text("caption", v); }
        if let Some(v) = params.tags.filter(|v| !v.is_empty()) { form = form.text("tags", v.join(",")); }
        if params.compress_video { form = form.text("compressVideo", "true"); }
        if params.transcode_video { form = form.text("transcodeVideo", "true"); }
        self.http.post_form(&format!("/buckets/{}/media", segment(bucket_slug)?), form).await
    }
    pub async fn delete(&self, bucket_slug: &str, media_id: &str) -> Result<()> {
        let _: serde_json::Value = self.http.delete(&format!("/buckets/{}/media/{}", segment(bucket_slug)?, segment(media_id)?), &[]).await?;
        Ok(())
    }
    /// Download bytes; pass None for original or Some(width) for a thumbnail.
    pub async fn download(&self, bucket_slug: &str, media_id: &str, quality: Option<u64>) -> Result<Vec<u8>> {
        let q = quality.filter(|v| *v != 0).map(|v| vec![("quality".into(), v.to_string())]).unwrap_or_default();
        let response = self.http.raw_get(&format!("/buckets/{}/media/{}/download", segment(bucket_slug)?, segment(media_id)?), &q).await?;
        Ok(response.bytes().await?.to_vec())
    }
}
#[derive(Debug, Clone)]
pub struct Storage { http: Http }
impl Storage {
    pub(crate) fn new(http: Http) -> Self { Self { http } }
    pub async fn quota(&self) -> Result<StorageQuota> { self.http.get("/storage-quota", &[]).await }
    pub async fn usage(&self) -> Result<StorageUsage> { self.http.get("/usage", &[]).await }
}
