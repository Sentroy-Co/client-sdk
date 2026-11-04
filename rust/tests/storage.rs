use sentroy_client_sdk::thumbnails::{pick_preset_thumbnail_url, pick_thumbnail_url, ThumbnailPreset, ThumbnailSourceMedia};
use sentroy_client_sdk::types::storage::{MediaImageMeta, MediaThumbnail};

fn image() -> ThumbnailSourceMedia {
    ThumbnailSourceMedia {
        media_type: "image".into(),
        image_meta: Some(MediaImageMeta { width: 1000, height: 500, orientation: "landscape".into(), thumbnails: vec![
            MediaThumbnail { width: 500, height: 250, file_name: "500.jpg".into(), size: 5, url: None },
            MediaThumbnail { width: 128, height: 64, file_name: "128.jpg".into(), size: 2, url: Some("https://thumb".into()) },
        ] }),
        url: Some("https://cdn/bucket/original.jpg?x=1".into()),
        download_url: Some("/download?token=x".into()),
    }
}
#[test]
fn chooses_thumbnail_and_falls_back_to_proxy() {
    let mut m = image();
    assert_eq!(pick_preset_thumbnail_url(&m, ThumbnailPreset::Avatar).as_deref(), Some("https://thumb"));
    assert_eq!(pick_thumbnail_url(&m, 300.0).as_deref(), Some("https://cdn/bucket/500.jpg"));
    assert_eq!(pick_thumbnail_url(&m, 900.0).as_deref(), Some("https://cdn/bucket/500.jpg"));
    m.url = None;
    assert_eq!(pick_thumbnail_url(&m, 300.0).as_deref(), Some("/download?token=x&quality=500"));
    assert_eq!(pick_thumbnail_url(&m, 0.0).as_deref(), Some("/download?token=x"));
}

fn server(response_body: Vec<u8>, content_type: &str) -> (String, std::sync::mpsc::Receiver<String>) {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (tx, rx) = std::sync::mpsc::channel();
    let content_type = content_type.to_owned();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
        let mut bytes = Vec::new();
        let mut buf = [0; 4096];
        let end = loop {
            let n = stream.read(&mut buf).unwrap(); assert!(n > 0);
            bytes.extend_from_slice(&buf[..n]);
            if let Some(i) = bytes.windows(4).position(|v| v == b"\r\n\r\n") { break i + 4; }
        };
        let headers = String::from_utf8_lossy(&bytes[..end]);
        let len = headers.lines().find_map(|line| {
            let (key, value) = line.split_once(':')?;
            if key.eq_ignore_ascii_case("content-length") { value.trim().parse::<usize>().ok() } else { None }
        }).unwrap_or(0);
        while bytes.len() < end + len {
            let n = stream.read(&mut buf).unwrap(); assert!(n > 0); bytes.extend_from_slice(&buf[..n]);
        }
        tx.send(String::from_utf8_lossy(&bytes).into_owned()).unwrap();
        write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", content_type, response_body.len()).unwrap();
        stream.write_all(&response_body).unwrap();
    });
    (format!("http://{}", address), rx)
}
#[tokio::test]
async fn multipart_upload_and_binary_download() {
    use sentroy_client_sdk::{Sentroy, types::storage::UploadMediaParams};
    let body = br#"{"id":"m","bucketId":"b","companyId":"c","fileName":"x","originalName":"x","type":"video","size":3,"mimeType":"video/mp4","folder":"f","uploadedBy":"u","tags":[],"isPublic":false,"createdAt":"now","updatedAt":"now"}"#.to_vec();
    let (base, rx) = server(body, "application/json");
    let client = Sentroy::new(base, "company", "token").unwrap();
    client.media.upload("my bucket", UploadMediaParams {
        body: b"abc".to_vec(), filename: Some("movie.mp4".into()), mime_type: Some("video/mp4".into()),
        is_public: Some(false), compress_video: true, transcode_video: true, tags: Some(vec!["a".into(), "b".into()]), ..Default::default()
    }).await.unwrap();
    let req = rx.recv().unwrap();
    assert!(req.to_lowercase().contains("content-type: video/mp4"));
    assert!(req.starts_with("POST /api/storage/companies/company/buckets/my%20bucket/media "));
    for text in ["filename=\"movie.mp4\"", "name=\"public\"", "false", "name=\"compressVideo\"", "name=\"transcodeVideo\"", "a,b", "abc"] { assert!(req.contains(text), "missing {text}"); }
    let (base, rx) = server(vec![0, 255, 42], "application/octet-stream");
    let client = Sentroy::new(base, "company", "token").unwrap();
    assert_eq!(client.media.download("b", "m", Some(500)).await.unwrap(), vec![0, 255, 42]);
    assert!(rx.recv().unwrap().starts_with("GET /api/storage/companies/company/buckets/b/media/m/download?quality=500 "));
}
