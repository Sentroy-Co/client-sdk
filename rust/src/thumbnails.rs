use crate::types::storage::{Media, MediaImageMeta};

/// The fields needed to select a thumbnail.
#[derive(Debug, Clone, Default)]
pub struct ThumbnailSourceMedia {
    pub media_type: String,
    pub image_meta: Option<MediaImageMeta>,
    pub url: Option<String>,
    pub download_url: Option<String>,
}
pub trait ThumbnailSource {
    fn media_type(&self) -> &str;
    fn image_meta(&self) -> Option<&MediaImageMeta>;
    fn url(&self) -> Option<&str>;
    fn download_url(&self) -> Option<&str>;
}
impl ThumbnailSource for Media {
    fn media_type(&self) -> &str {
        &self.media_type
    }
    fn image_meta(&self) -> Option<&MediaImageMeta> {
        self.image_meta.as_ref()
    }
    fn url(&self) -> Option<&str> {
        self.url.as_deref()
    }
    fn download_url(&self) -> Option<&str> {
        self.download_url.as_deref()
    }
}
impl ThumbnailSource for ThumbnailSourceMedia {
    fn media_type(&self) -> &str {
        &self.media_type
    }
    fn image_meta(&self) -> Option<&MediaImageMeta> {
        self.image_meta.as_ref()
    }
    fn url(&self) -> Option<&str> {
        self.url.as_deref()
    }
    fn download_url(&self) -> Option<&str> {
        self.download_url.as_deref()
    }
}

/// The standard display sizes for generated thumbnails.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThumbnailPreset {
    Avatar,
    Card,
    Preview,
    Hero,
}
impl ThumbnailPreset {
    pub fn pixels(self) -> u64 {
        match self {
            Self::Avatar => 128,
            Self::Card => 500,
            Self::Preview => 960,
            Self::Hero => 1600,
        }
    }
}

/// Select the smallest thumbnail covering the requested width, or the largest available.
pub fn pick_thumbnail_url(media: &impl ThumbnailSource, target_px: f64) -> Option<String> {
    let original = || {
        media
            .url()
            .or_else(|| media.download_url())
            .map(str::to_owned)
    };
    let thumbs = match media.image_meta() {
        Some(meta) if media.media_type() == "image" && !meta.thumbnails.is_empty() => {
            &meta.thumbnails
        }
        _ => return original(),
    };
    if target_px.is_nan() || target_px <= 0.0 {
        return original();
    }
    let fit = thumbs
        .iter()
        .filter(|t| t.width as f64 >= target_px)
        .min_by_key(|t| t.width)
        .or_else(|| thumbs.iter().max_by_key(|t| t.width))?;
    if let Some(url) = &fit.url {
        if !url.is_empty() {
            return Some(url.clone());
        }
    }
    if let Some(url) = media.url() {
        if !url.is_empty() {
            if let Some(slash) = url.rfind('/') {
                let base = &url[..slash + 1];
                return Some(format!(
                    "{}{}",
                    base.split('?').next().unwrap_or(base),
                    fit.file_name
                ));
            }
        }
    }
    media.download_url().filter(|s| !s.is_empty()).map(|url| {
        format!(
            "{}{}quality={}",
            url,
            if url.contains('?') { "&" } else { "?" },
            fit.width
        )
    })
}
pub fn pick_preset_thumbnail_url(
    media: &impl ThumbnailSource,
    preset: ThumbnailPreset,
) -> Option<String> {
    pick_thumbnail_url(media, preset.pixels() as f64)
}
