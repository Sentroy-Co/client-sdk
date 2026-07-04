package sentroy

import (
	"fmt"
	"sort"
	"strings"
)

// Media thumbnail URL helpers — return an appropriately sized URL for a
// display target. Serving the original in small placements (avatars, grid
// cards) wastes bandwidth and render cost.
//
// The CDN pre-generates thumbnails for images at upload time
// (ImageMeta.Thumbnails). PickThumbnailURL:
//  1. Picks the smallest thumbnail covering the target (else the largest).
//  2. Uses the thumbnail's own URL if the backend exposed one.
//  3. Otherwise constructs {cdn-base}/{bucketId}/{thumbnail.fileName} from
//     Media.URL.
//  4. If no public URL exists, falls back to the download endpoint with
//     ?quality=N.
//  5. Worst case: Media.DownloadURL or "".

// ThumbnailPreset is a semantic display-size name.
type ThumbnailPreset string

const (
	// ThumbnailPresetAvatar — avatar / round chip, 28-64px display (~120 target @2x).
	ThumbnailPresetAvatar ThumbnailPreset = "avatar"
	// ThumbnailPresetCard — list/grid card, 200-300px display (~500 target).
	ThumbnailPresetCard ThumbnailPreset = "card"
	// ThumbnailPresetPreview — modal preview, large but lighter than the original (~960).
	ThumbnailPresetPreview ThumbnailPreset = "preview"
	// ThumbnailPresetHero — hero / fullbleed, 1280-1920 display (~1600).
	ThumbnailPresetHero ThumbnailPreset = "hero"
)

// ThumbnailPresets maps preset names to retina-aware pixel targets.
var ThumbnailPresets = map[ThumbnailPreset]int{
	ThumbnailPresetAvatar:  128,
	ThumbnailPresetCard:    500,
	ThumbnailPresetPreview: 960,
	ThumbnailPresetHero:    1600,
}

// PickThumbnailURL returns the best thumbnail URL for a display target of
// targetPx (the display's maximum dimension in px — call with 2x for
// retina). Returns "" if no URL can be produced. Non-images or media
// without thumbnails return Media.URL (or DownloadURL as fallback).
func PickThumbnailURL(media Media, targetPx int) string {
	fallback := media.URL
	if fallback == "" {
		fallback = media.DownloadURL
	}

	// Not an image, or no thumbnail list — original URL.
	if media.Type != MediaTypeImage || media.ImageMeta == nil || len(media.ImageMeta.Thumbnails) == 0 {
		return fallback
	}
	if targetPx <= 0 {
		return fallback
	}

	// Smallest thumbnail covering the target; else the largest (least
	// distortion even if smaller than the target).
	thumbs := make([]MediaThumbnail, len(media.ImageMeta.Thumbnails))
	copy(thumbs, media.ImageMeta.Thumbnails)
	sort.Slice(thumbs, func(i, j int) bool { return thumbs[i].Width < thumbs[j].Width })
	fit := thumbs[len(thumbs)-1]
	for _, t := range thumbs {
		if t.Width >= targetPx {
			fit = t
			break
		}
	}

	// Some endpoints return the thumbnail's own URL — use it directly.
	if fit.URL != "" {
		return fit.URL
	}

	// Pattern fallback: drop everything after the original URL's last "/"
	// and append the thumbnail's fileName. Backend pattern:
	//   {cdn}/{bucketId}/{originalFileName}   ← media.URL
	//   {cdn}/{bucketId}/{thumbnailFileName}  ← constructed
	if media.URL != "" {
		if slash := strings.LastIndex(media.URL, "/"); slash >= 0 {
			base := media.URL[:slash+1]
			// Drop any query string — meaningless for the thumbnail.
			cleanBase := strings.SplitN(base, "?", 2)[0]
			return cleanBase + fit.FileName
		}
	}

	// No public URL at all — proxy download endpoint with quality=N.
	if media.DownloadURL != "" {
		sep := "?"
		if strings.Contains(media.DownloadURL, "?") {
			sep = "&"
		}
		return fmt.Sprintf("%s%squality=%d", media.DownloadURL, sep, fit.Width)
	}

	return ""
}

// PickPresetThumbnailURL is the semantic shortcut for PickThumbnailURL —
// express the display intent by name and let the helper handle the
// preset → px mapping. Unknown presets fall back to the original URL.
func PickPresetThumbnailURL(media Media, preset ThumbnailPreset) string {
	return PickThumbnailURL(media, ThumbnailPresets[preset])
}
