//! Bound private-file transfers. References are validated before any request.
//! Upload transport failures have an unknown outcome; callers must reconcile
//! state through the appropriate MCP tool before deciding whether to retry.
use std::collections::HashMap;
use std::time::Duration;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use url::Url;
use super::{McpApp, McpConnection};
use crate::Error;

const CONTACT_CAP: usize = 1024 * 1024;
const STORAGE_CAP: usize = 10 * 1024 * 1024;
const DOWNLOAD_CAP: usize = 64 * 1024 * 1024;
fn err(s: &str) -> Error { Error::Mcp(s.into()) }
fn field<'a>(v: &'a Value, key: &str) -> Result<&'a str, Error> {
    v.get(key).and_then(Value::as_str).ok_or_else(|| err("invalid_mcp_reference"))
}
fn size(v: &Value, key: &str, cap: usize) -> Result<usize, Error> {
    v.get(key).and_then(Value::as_u64).and_then(|n| usize::try_from(n).ok())
        .filter(|n| *n <= cap).ok_or_else(|| err("invalid_mcp_reference"))
}
fn hex(s: &str, len: usize) -> bool {
    s.len() == len && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn slug(s: &str) -> bool {
    !s.is_empty() && s.len() <= 100 && s.as_bytes()[0].is_ascii_alphanumeric()
        && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'-')
        && (s.as_bytes()[0].is_ascii_lowercase() || s.as_bytes()[0].is_ascii_digit())
}
fn uuid(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 36 && [8,13,18,23].iter().all(|i| b[*i] == b'-')
        && b.iter().enumerate().all(|(i,c)| [8,13,18,23].contains(&i) || c.is_ascii_digit() || (b'a'..=b'f').contains(c))
        && (b'1'..=b'8').contains(&b[14]) && matches!(b[19], b'8' | b'9' | b'a' | b'b')
}
fn date(s: &str, future: bool) -> bool {
    let Ok(d) = DateTime::parse_from_rfc3339(s) else { return false; };
    d.to_utc().to_rfc3339_opts(SecondsFormat::Millis, true) == s && (!future || d > Utc::now())
}
fn sha(bytes: &[u8]) -> String { Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect() }
fn flag(v: &Value, key: &str, b: bool) -> bool { v.get(key).and_then(Value::as_bool) == Some(b) }

fn url_for(connection: &McpConnection, raw: &str, max: usize) -> Result<Url, Error> {
    if raw.len() > max { return Err(err("invalid_mcp_reference")); }
    let url = Url::parse(raw).map_err(|_| err("invalid_mcp_reference"))?;
    let resource = Url::parse(&connection.resource).map_err(|_| err("invalid_mcp_reference"))?;
    if url.origin() != resource.origin() || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return Err(err("invalid_mcp_reference"));
    }
    Ok(url)
}
fn query(url: &Url, keys: &[&str]) -> Result<HashMap<String,String>, Error> {
    let pairs: Vec<_> = url.query_pairs().collect();
    if pairs.len() != keys.len() { return Err(err("invalid_mcp_reference")); }
    let mut out = HashMap::new();
    for (k,v) in pairs {
        if !keys.contains(&k.as_ref()) || out.insert(k.into_owned(), v.into_owned()).is_some() {
            return Err(err("invalid_mcp_reference"));
        }
    }
    if !out.get("connection").is_some_and(|s| hex(s,24)) { return Err(err("invalid_mcp_reference")); }
    Ok(out)
}
fn resource_path(c: &McpConnection) -> Result<String, Error> {
    Ok(Url::parse(&c.resource).map_err(|_| err("invalid_mcp_resource"))?.path().to_owned())
}
fn contact_ref(c: &McpConnection, v: &Value, kind: &str) -> Result<(Url,usize,String,String), Error> {
    if c.app != McpApp::Mail { return Err(err("mcp_contact_files_not_supported")); }
    if !flag(v, "requiresOriginalBearer", true) { return Err(err("invalid_mcp_reference")); }
    let bytes = size(v, "bytes", CONTACT_CAP)?;
    let id = field(v, if kind == "exports" { "exportId" } else { "uploadId" })?;
    let hash = field(v,"fileHash")?;
    let expires = field(v,"expiresAt")?;
    if !uuid(id) || !hex(hash,64) || !date(expires,true) || (kind == "imports" && bytes == 0) {
        return Err(err("invalid_mcp_reference"));
    }
    let u = url_for(c, field(v,if kind == "exports" { "downloadUrl" } else { "uploadUrl" })?,4000)?;
    if u.path() != format!("{}/contacts/{kind}/{id}",resource_path(c)?) { return Err(err("invalid_mcp_reference")); }
    let q = query(&u, if kind == "exports" { &["connection","hash"] } else { &["connection"] })?;
    if kind == "exports" && q.get("hash").map(String::as_str) != Some(hash) { return Err(err("invalid_mcp_reference")); }
    Ok((u,bytes,hash.to_owned(),expires.to_owned()))
}
/// Transfer timeout covers the complete request and body; defaults are 60s
/// for downloads and 15s for uploads. Maximum is 120s.
#[derive(Clone, Copy, Debug, Default)]
pub struct TransferOptions { pub timeout_ms: Option<u64> }
fn timeout(o: Option<TransferOptions>, default: u64) -> Result<Duration, Error> {
    let ms = o.and_then(|v| v.timeout_ms).unwrap_or(default);
    if !(1..=120_000).contains(&ms) { return Err(err("invalid_mcp_timeout")); }
    Ok(Duration::from_millis(ms))
}
async fn bounded(mut response: reqwest::Response, cap: usize, expected: Option<usize>) -> Result<Vec<u8>, Error> {
    if let Some(length) = response.content_length() {
        if length > cap as u64 || expected.is_some_and(|n| n as u64 != length) { return Err(err("mcp_file_size_mismatch")); }
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| err("mcp_download_failed"))? {
        if chunk.len() > cap.saturating_sub(bytes.len()) || expected.is_some_and(|n| chunk.len() > n.saturating_sub(bytes.len())) {
            return Err(err("mcp_file_size_mismatch"));
        }
        bytes.extend_from_slice(&chunk);
    }
    if expected.is_some_and(|n| n != bytes.len()) { return Err(err("mcp_file_size_mismatch")); }
    Ok(bytes)
}
impl McpConnection {
    async fn get_file(&self, u: Url, cap: usize, expected: Option<usize>, duration: Duration) -> Result<Vec<u8>, Error> {
        tokio::time::timeout(duration, async {
            let token = self.provider.resolve().await?;
            let r = self.file_client.get(u).bearer_auth(token).send().await.map_err(|_| err("mcp_download_failed"))?;
            if r.status() != 200 { return Err(err("mcp_download_failed")); }
            bounded(r,cap,expected).await
        }).await.map_err(|_| err("mcp_download_aborted"))?
    }
    async fn put_file(&self, u: Url, body: &[u8], duration: Duration, storage: bool, expires: &str) -> Result<Vec<u8>, Error> {
        // Once send starts, timeout, connection loss, or invalid response cannot
        // determine whether the server accepted the bytes. Never replay it.
        tokio::time::timeout(duration, async {
            let token = self.provider.resolve().await?;
            if !date(expires, true) { return Err(err("invalid_mcp_reference")); }
            let r = self.file_client.put(u).bearer_auth(token)
                .header(reqwest::header::CONTENT_TYPE,"application/octet-stream").body(body.to_vec())
                .send().await.map_err(|_| err("mcp_upload_outcome_unknown"))?;
            let status = r.status().as_u16();
            if status != 200 {
                if status >= 500 { return Err(err("mcp_upload_outcome_unknown")); }
                let mut safe = Value::Null;
                if !storage && [400,409,413,422].contains(&status) {
                    let data = bounded(r,4096,None).await.unwrap_or_default();
                    if let Ok(value) = serde_json::from_slice::<Value>(&data) {
                        let allowed = ["contact_import_columns","contact_import_row_limit","contact_import_csv_invalid",
                            "contact_import_csv_columns","contact_import_csv_escaped_email","contact_import_tags_invalid",
                            "contact_import_utf8_invalid","contact_import_nul","contact_import_json_invalid",
                            "contact_import_row_invalid","contact_import_duplicate_email","contact_import_normalized_too_large",
                            "contact_import_file_hash_mismatch","contact_import_upload_size_mismatch","contact_import_upload_too_large"];
                        if let Some(reason) = value.get("error").and_then(Value::as_str).filter(|s| allowed.contains(s)) {
                            safe = json!({"reason":reason});
                            if let Some(row) = value.get("row").and_then(Value::as_u64).filter(|n| (1..=1_048_576).contains(n)) {
                                safe["row"] = json!(row);
                            }
                        }
                    }
                }
                return Err(Error::Http {status, message:"mcp_upload_failed".into(), body:safe});
            }
            if storage && !r.headers().get(reqwest::header::CONTENT_TYPE).and_then(|h|h.to_str().ok())
                .is_some_and(|h|h.split(';').next().is_some_and(|v|v.trim()=="application/json")) {
                return Err(err("mcp_upload_outcome_unknown"));
            }
            bounded(r,4096,None).await.map_err(|_| err("mcp_upload_outcome_unknown"))
        }).await.map_err(|_| err("mcp_upload_outcome_unknown"))?
    }

    /// Download a storage file, bound to the file ID, version and connection.
    pub async fn download_file(&self, v: &Value, options: Option<TransferOptions>) -> Result<Vec<u8>,Error> {
        if self.app != McpApp::Storage { return Err(err("mcp_download_not_supported")); }
        if !flag(v,"requiresAuthorization",true) || field(v,"method")? != "GET" { return Err(err("invalid_mcp_reference")); }
        let file = v.get("file").ok_or_else(|| err("invalid_mcp_reference"))?;
        let id = field(file,"id")?; let n = size(file,"size",DOWNLOAD_CAP)?;
        if !hex(id,24) { return Err(err("invalid_mcp_reference")); }
        let u = url_for(self,field(v,"downloadUrl")?,4000)?;
        let prefix = format!("{}/files/",resource_path(self)?);
        let path = u.path().strip_prefix(&prefix).ok_or_else(|| err("invalid_mcp_reference"))?;
        let parts: Vec<_> = path.split('/').collect();
        let q = query(&u,&["connection","version"])?;
        if parts.len()!=2 || !slug(parts[0]) || parts[1]!=id || !q.get("version").is_some_and(|s| date(s,false)) {
            return Err(err("invalid_mcp_reference"));
        }
        self.get_file(u,DOWNLOAD_CAP,Some(n),timeout(options,60_000)?).await
    }

    /// Download a mail attachment after validating its encoded message reference.
    pub async fn download_mail_attachment(&self, v: &Value, options: Option<TransferOptions>) -> Result<Vec<u8>,Error> {
        if self.app != McpApp::Mail { return Err(err("mcp_download_not_supported")); }
        if !flag(v,"requiresAuthorization",true) || field(v,"method")? != "GET" { return Err(err("invalid_mcp_reference")); }
        let max = size(v,"maxBytes",8*1024*1024)?;
        let a = v.get("attachment").ok_or_else(|| err("invalid_mcp_reference"))?;
        size(a,"encodedSize",12*1024*1024)?;
        let part = field(a,"partId")?;
        if max == 0 || part.len()>80 || part.is_empty() || part.split('.').any(|p| p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit())) {
            return Err(err("invalid_mcp_reference"));
        }
        let u = url_for(self,field(v,"downloadUrl")?,5000)?;
        let prefix = format!("{}/attachments/",resource_path(self)?);
        let encoded = u.path().strip_prefix(&prefix).ok_or_else(|| err("invalid_mcp_reference"))?;
        if encoded.is_empty() || encoded.len()>2500 || !encoded.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') {
            return Err(err("invalid_mcp_reference"));
        }
        let q=query(&u,&["connection","version"])?;
        if !q.get("version").is_some_and(|s|hex(s,64)) { return Err(err("invalid_mcp_reference")); }
        let data=URL_SAFE_NO_PAD.decode(encoded).map_err(|_|err("invalid_mcp_reference"))?;
        let decoded: Value=serde_json::from_slice(&data).map_err(|_|err("invalid_mcp_reference"))?;
        let obj=decoded.as_object().ok_or_else(||err("invalid_mcp_reference"))?;
        let reference=decoded.get("reference").and_then(Value::as_object).ok_or_else(||err("invalid_mcp_reference"))?;
        if obj.len()!=2 || decoded.get("partId").and_then(Value::as_str)!=Some(part) || reference.len()!=5
            || !["companyId","mailbox","folder","uidValidity","uid"].iter().all(|k|reference.contains_key(*k)) {
            return Err(err("invalid_mcp_reference"));
        }
        let r=decoded.get("reference").ok_or_else(||err("invalid_mcp_reference"))?;
        let company=field(r,"companyId")?; let mailbox=field(r,"mailbox")?;
        let folder=field(r,"folder")?; let validity=field(r,"uidValidity")?;
        let uid=r.get("uid").and_then(Value::as_u64).unwrap_or(0);
        if company.is_empty() || company.len()>100 || company.chars().any(|c| matches!(c, '\r' | '\n' | '\0'))
            || mailbox.len()>320 || mailbox.split('@').count()!=2 || mailbox.split('@').any(|s| s.is_empty() || s.chars().any(char::is_whitespace))
            || folder.is_empty() || folder.len()>512 || folder.starts_with("__") || folder.chars().any(|c| matches!(c, '\r' | '\n' | '\0'))
            || validity.is_empty() || validity.len()>20 || validity.starts_with('0') || !validity.bytes().all(|b|b.is_ascii_digit())
            || uid==0 || uid>u32::MAX as u64 { return Err(err("invalid_mcp_reference")); }
        self.get_file(u,max,None,timeout(options,60_000)?).await
    }

    /// Download and hash-check an original-grant contacts export.
    pub async fn download_mail_contacts_export(&self, v: &Value, options: Option<TransferOptions>) -> Result<Vec<u8>,Error> {
        let (u,n,hash,_) = contact_ref(self,v,"exports")?;
        if !matches!(field(v,"format")?, "csv" | "jsonl") { return Err(err("invalid_mcp_reference")); }
        let data=self.get_file(u,CONTACT_CAP,Some(n),timeout(options,60_000)?).await?;
        if sha(&data)!=hash { return Err(err("mcp_contact_file_hash_mismatch")); }
        Ok(data)
    }

    /// Upload an original-grant contacts import. A transport failure returns
    /// `mcp_upload_outcome_unknown`; query its state before any further action.
    pub async fn upload_mail_contacts_import(&self, v: &Value, body: &[u8], options: Option<TransferOptions>) -> Result<Value,Error> {
        let (u,n,hash,expires)=contact_ref(self,v,"imports")?;
        if body.len()!=n { return Err(err("mcp_contact_file_size_mismatch")); }
        if sha(body)!=hash { return Err(err("mcp_contact_file_hash_mismatch")); }
        if !date(&expires,true) { return Err(err("invalid_mcp_reference")); }
        let data=self.put_file(u,body,timeout(options,15_000)?,false,&expires).await?;
        let result: Value=serde_json::from_slice(&data).map_err(|_|err("mcp_upload_outcome_unknown"))?;
        if result.get("uploadId")!=v.get("uploadId") || result.get("state").and_then(Value::as_str)!=Some("ready")
            || result.get("fileHash").and_then(Value::as_str)!=Some(hash.as_str())
            || result.get("expiresAt").and_then(Value::as_str)!=Some(expires.as_str())
            || !result.get("count").and_then(Value::as_u64).is_some_and(|n|(1..=100).contains(&n))
            || !date(&expires,true) { return Err(err("mcp_upload_outcome_unknown")); }
        Ok(json!({"uploadId":result["uploadId"],"state":"ready","count":result["count"],"fileHash":hash,"expiresAt":expires}))
    }

    /// Upload a storage file under the original grant. A transport failure
    /// returns `mcp_upload_outcome_unknown` and is never automatically retried.
    pub async fn upload_storage_file(&self, v: &Value, body: &[u8], options: Option<TransferOptions>) -> Result<Value,Error> {
        if self.app != McpApp::Storage { return Err(err("mcp_storage_upload_not_supported")); }
        let id=field(v,"uploadId")?; let name=field(v,"name")?; let mime=field(v,"mimeType")?;
        let n=size(v,"bytes",STORAGE_CAP)?; let hash=field(v,"sha256")?; let expires=field(v,"expiresAt")?;
        let bucket=v.get("bucket").ok_or_else(||err("invalid_mcp_reference"))?;
        if !uuid(id) || !hex(hash,64) || !hex(field(v,"revision")?,64) || !date(expires,true)
            || !matches!(field(v,"state")?, "waiting" | "ready") || !flag(v,"published",false)
            || !flag(v,"malwareScanned",false) || !flag(v,"requiresHumanApproval",true)
            || !flag(v,"requiresOriginalBearer",true) || field(v,"method")?!="PUT"
            || field(v,"contentType")?!="application/octet-stream"
            || !hex(field(bucket,"id")?,24) || !slug(field(bucket,"slug")?) || !hex(field(bucket,"revision")?,64) {
            return Err(err("invalid_mcp_reference"));
        }
        let info=super::sentroy_mcp_storage_upload_file_info(body,name,mime)?;
        if info.bytes!=n { return Err(err("mcp_storage_upload_size_mismatch")); }
        if info.sha256!=hash { return Err(err("mcp_storage_upload_hash_mismatch")); }
        let u=url_for(self,field(v,"uploadUrl")?,4000)?;
        if u.path()!=format!("{}/uploads/{id}",resource_path(self)?) { return Err(err("invalid_mcp_reference")); }
        query(&u,&["connection"])?;
        if !date(expires,true) { return Err(err("invalid_mcp_reference")); }
        let data=self.put_file(u,body,timeout(options,15_000)?,true,expires).await?;
        let result: Value=serde_json::from_slice(&data).map_err(|_|err("mcp_upload_outcome_unknown"))?;
        let rb=result.get("bucket").ok_or_else(||err("mcp_upload_outcome_unknown"))?;
        for key in ["uploadId","name","mimeType","bytes","sha256","expiresAt"] {
            if result.get(key)!=v.get(key) { return Err(err("mcp_upload_outcome_unknown")); }
        }
        for key in ["id","slug","revision"] {
            if rb.get(key)!=bucket.get(key) { return Err(err("mcp_upload_outcome_unknown")); }
        }
        if result.get("state").and_then(Value::as_str)!=Some("ready")
            || !result.get("revision").and_then(Value::as_str).is_some_and(|s|hex(s,64))
            || !flag(&result,"published",false) || !flag(&result,"malwareScanned",false)
            || !flag(&result,"requiresHumanApproval",true) || !date(expires,true) {
            return Err(err("mcp_upload_outcome_unknown"));
        }
        Ok(json!({"uploadId":id,"name":name,"mimeType":mime,"bytes":n,"sha256":hash,"expiresAt":expires,
            "bucket":bucket,"state":"ready","revision":result["revision"],"published":false,"malwareScanned":false,"requiresHumanApproval":true}))
    }
}
