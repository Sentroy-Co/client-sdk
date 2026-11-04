//! Wire-compatible platform request and response models.
pub mod mail;
pub mod storage;
pub mod whatsapp;
pub use mail::*;
pub use storage::*;
pub use whatsapp::*;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ApiResponse<T> {
    pub data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
