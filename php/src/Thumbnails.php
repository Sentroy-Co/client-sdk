<?php

namespace Sentroy\ClientSdk;

/**
 * Media thumbnail URL helpers — pick the right pre-generated thumbnail for a
 * display target instead of shipping the original everywhere. Pure functions,
 * no HTTP: a direct port of the TypeScript SDK's `thumbnails.ts`.
 *
 * Selection order (mirrors the TS reference):
 *  1. Smallest thumbnail whose width covers the target (else the largest).
 *  2. If the thumbnail exposes its own `url`, use it directly.
 *  3. Otherwise rebuild from `media.url`'s CDN prefix + thumbnail `fileName`.
 *  4. No public URL at all → download endpoint with `?quality=N`.
 *  5. Fallback: `media.downloadUrl` or null.
 */
class Thumbnails
{
    /**
     * Common preset sizes — semantic shortcut for callers that do not want
     * to pass a pixel target. Retina-aware (avatar targets @2x).
     *
     * @var array<string,int>
     */
    public static $PRESETS = array(
        'avatar' => 128,
        'card' => 500,
        'preview' => 960,
        'hero' => 1600,
    );

    /**
     * Pick the thumbnail URL best matching a display target.
     *
     * @param array $media    Sentroy media array (list / get / upload result) —
     *                        reads `url`, `downloadUrl`, `type`, `imageMeta.thumbnails`.
     * @param int   $targetPx Maximum display dimension in px (use 2x for retina).
     * @return string|null    URL, or null when nothing can be produced.
     */
    public static function pickThumbnailUrl(array $media, $targetPx)
    {
        $url = isset($media['url']) ? $media['url'] : null;
        $downloadUrl = isset($media['downloadUrl']) ? $media['downloadUrl'] : null;
        $type = isset($media['type']) ? $media['type'] : null;
        $thumbs = isset($media['imageMeta']['thumbnails']) && is_array($media['imageMeta']['thumbnails'])
            ? $media['imageMeta']['thumbnails']
            : array();

        // Not an image / no thumbnails / no sane target → original URL.
        if (count($thumbs) === 0 || $type !== 'image' || !$targetPx || $targetPx <= 0) {
            return $url !== null ? $url : $downloadUrl;
        }

        // Smallest covering thumbnail; else the largest available.
        usort($thumbs, function ($a, $b) {
            $aw = isset($a['width']) ? $a['width'] : 0;
            $bw = isset($b['width']) ? $b['width'] : 0;
            return $aw - $bw;
        });
        $fit = null;
        foreach ($thumbs as $t) {
            if (isset($t['width']) && $t['width'] >= $targetPx) {
                $fit = $t;
                break;
            }
        }
        if ($fit === null) {
            $fit = $thumbs[count($thumbs) - 1];
        }

        // Some endpoints expose the thumbnail's own URL — use it directly.
        if (isset($fit['url']) && is_string($fit['url']) && $fit['url'] !== '') {
            return $fit['url'];
        }

        // Pattern fallback: {cdn}/{bucketId}/{thumbnailFileName}.
        if ($url !== null && isset($fit['fileName'])) {
            $slash = strrpos($url, '/');
            if ($slash !== false) {
                $base = substr($url, 0, $slash + 1);
                $parts = explode('?', $base);
                return $parts[0] . $fit['fileName'];
            }
        }

        // Proxy download endpoint with quality hint.
        if ($downloadUrl !== null) {
            $sep = strpos($downloadUrl, '?') !== false ? '&' : '?';
            $width = isset($fit['width']) ? $fit['width'] : $targetPx;
            return $downloadUrl . $sep . 'quality=' . $width;
        }

        return null;
    }

    /**
     * Semantic shortcut for {@see pickThumbnailUrl}.
     *
     * @param array  $media
     * @param string $preset One of: avatar | card | preview | hero.
     * @return string|null
     */
    public static function pickPresetThumbnailUrl(array $media, $preset)
    {
        $target = isset(self::$PRESETS[$preset]) ? self::$PRESETS[$preset] : self::$PRESETS['card'];
        return self::pickThumbnailUrl($media, $target);
    }
}
