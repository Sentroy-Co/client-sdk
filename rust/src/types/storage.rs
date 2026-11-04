use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bucket {
    pub id: String,
    pub company_id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub is_public: bool,
    pub storage_used: u64,
    pub file_count: u64,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBucketParams {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_public: Option<bool>,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBucketParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_public: Option<bool>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaThumbnail {
    pub width: u64,
    pub height: u64,
    pub file_name: String,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaImageMeta {
    pub width: u64,
    pub height: u64,
    pub orientation: String,
    pub thumbnails: Vec<MediaThumbnail>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaVideoVariant {
    pub height: u64,
    pub width: u64,
    pub file_name: String,
    pub size: u64,
    pub bitrate: Option<u64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaVideoMeta {
    pub width: u64,
    pub height: u64,
    pub duration: f64,
    pub variants: Vec<MediaVideoVariant>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaProcessing {
    pub status: String,
    pub variants_total: Option<u64>,
    pub variants_completed: Option<u64>,
    pub error: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}
pub type MediaType = String;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    pub id: String,
    pub bucket_id: String,
    pub company_id: String,
    pub file_name: String,
    pub original_name: String,
    #[serde(rename = "type")]
    pub media_type: MediaType,
    pub size: u64,
    pub mime_type: String,
    pub folder: String,
    pub uploaded_by: String,
    pub tags: Vec<String>,
    pub alt: Option<String>,
    pub caption: Option<String>,
    pub is_public: bool,
    pub image_meta: Option<MediaImageMeta>,
    pub video_meta: Option<MediaVideoMeta>,
    pub processing: Option<MediaProcessing>,
    pub url: Option<String>,
    pub download_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaListResult {
    pub items: Vec<Media>,
    pub total: u64,
    pub limit: u64,
    pub skip: u64,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaListParams {
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub media_type: Option<MediaType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skip: Option<u64>,
}
#[derive(Debug, Clone, Default)]
pub struct UploadMediaParams {
    pub body: Vec<u8>,
    pub filename: Option<String>,
    pub mime_type: Option<String>,
    pub folder: Option<String>,
    pub is_public: Option<bool>,
    pub alt: Option<String>,
    pub caption: Option<String>,
    pub tags: Option<Vec<String>>,
    pub compress_video: bool,
    pub transcode_video: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageQuota {
    pub used: u64,
    pub limit: u64,
    pub mail_used: u64,
    pub plan_name: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsageBucket {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub storage_used: u64,
    pub file_count: u64,
    pub is_public: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsageByType {
    #[serde(rename = "type")]
    pub media_type: MediaType,
    pub count: u64,
    pub bytes: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    pub quota: StorageQuota,
    pub buckets: Vec<StorageUsageBucket>,
    pub by_type: Vec<StorageUsageByType>,
}
