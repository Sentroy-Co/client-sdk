//! Local manifests for the two private upload workflows. Computing a manifest
//! never sends a request or publishes a file.
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};
use crate::Error;

fn invalid(code: &str) -> Error { Error::Mcp(code.to_owned()) }

fn digest(bytes: &[u8]) -> String {
    let hash = Sha256::digest(bytes);
    hash.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactImportFileInfo {
    pub format: String,
    pub bytes: usize,
    pub file_hash: String,
}

/// Compute metadata for a contact upload. The body stays local.
pub fn sentroy_mcp_contact_import_file_info(body: &[u8], format: &str) -> Result<ContactImportFileInfo, Error> {
    if !matches!(format, "csv" | "jsonl") || body.is_empty() || body.len() > 1024 * 1024 {
        return Err(invalid("invalid_mcp_contact_file"));
    }
    Ok(ContactImportFileInfo { format: format.to_owned(), bytes: body.len(), file_hash: digest(body) })
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUploadFileInfo {
    pub name: String,
    pub mime_type: String,
    pub bytes: usize,
    pub sha256: String,
}

fn valid_storage_name(name: &str, mime_type: &str) -> bool {
    let extensions: &[&str] = match mime_type {
        "application/pdf" => &["pdf"], "image/jpeg" => &["jpg", "jpeg"],
        "image/png" => &["png"], "image/webp" => &["webp"],
        "text/plain" => &["txt", "log"], "text/csv" => &["csv"],
        "audio/mpeg" => &["mp3"], "audio/wav" => &["wav"], "audio/ogg" => &["ogg", "oga"],
        "audio/mp4" => &["m4a", "mp4"], "audio/webm" => &["webm"],
        "video/mp4" => &["mp4"], "video/webm" => &["webm"], "video/quicktime" => &["mov"],
        _ => return false,
    };
    if name.is_empty() || name.encode_utf16().count() > 200 || name.trim() != name
        || name.chars().any(|c| c == '/' || c == '\\' || c.is_control()) { return false; }
    let Some((stem, extension)) = name.rsplit_once('.') else { return false; };
    !stem.is_empty() && extensions.contains(&extension.to_ascii_lowercase().as_str())
}

/// Compute metadata for a storage upload. The body stays local.
pub fn sentroy_mcp_storage_upload_file_info(body: &[u8], name: &str, mime_type: &str) -> Result<StorageUploadFileInfo, Error> {
    if !valid_storage_name(name, mime_type) || body.is_empty() || body.len() > 10 * 1024 * 1024 {
        return Err(invalid("invalid_mcp_storage_upload"));
    }
    Ok(StorageUploadFileInfo { name: name.to_owned(), mime_type: mime_type.to_owned(), bytes: body.len(), sha256: digest(body) })
}
