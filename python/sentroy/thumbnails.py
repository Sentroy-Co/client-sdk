from __future__ import annotations

"""Media thumbnail URL helpers.

Pure functions with no network dependency — pick the right pre-generated
thumbnail URL for a display target instead of shipping the original.

Resolution order (mirrors the TypeScript SDK):
 1. Pick the smallest thumbnail whose width covers ``target_px``
    (else the largest available).
 2. Use the thumbnail's own runtime ``url`` when the server exposed it.
 3. Otherwise build ``{cdn-base}/{bucketId}/{thumbnail.fileName}`` from
    ``media.url``.
 4. Otherwise fall back to ``download_url`` + ``?quality=N`` proxy.
 5. Otherwise ``download_url``, else ``None``.

Non-images (or empty thumbnail lists) return ``media.url`` or
``download_url``. Call with a 2x target for retina displays.
"""

from typing import Optional

from sentroy.types import Media

# Retina-aware preset targets.
THUMBNAIL_PRESETS: dict[str, int] = {
    # Avatar / round chip — 28-64px display, ~120 target at 2x retina.
    "avatar": 128,
    # List/grid card — 200-300px display, ~500 target.
    "card": 500,
    # Modal preview — large but lighter than the original, ~960.
    "preview": 960,
    # Hero / fullbleed — 1280-1920 display, near-original.
    "hero": 1600,
}


def pick_thumbnail_url(media: Media, target_px: int) -> Optional[str]:
    """Return the best thumbnail URL for a display target of ``target_px``
    (max width or height in pixels), or ``None`` if nothing is derivable.

    Example::

        avatar_url = pick_thumbnail_url(media, 56 * 2)  # 112px retina target
    """
    thumbs = media.image_meta.thumbnails if media.image_meta else None
    if not thumbs or media.type != "image":
        return media.url or media.download_url
    if not target_px or target_px <= 0:
        return media.url or media.download_url

    # Smallest thumbnail covering the target; else the largest.
    sorted_thumbs = sorted(thumbs, key=lambda t: t.width)
    fit = next(
        (t for t in sorted_thumbs if t.width >= target_px),
        sorted_thumbs[-1],
    )

    # Some endpoints expose the thumbnail's own URL at runtime.
    if fit.url:
        return fit.url

    # Pattern fallback: swap the last path segment of media.url with the
    # thumbnail's fileName ({cdn}/{bucketId}/{thumbnailFileName}).
    if media.url:
        slash = media.url.rfind("/")
        if slash >= 0:
            base = media.url[: slash + 1].split("?")[0]
            return base + fit.file_name

    # No public URL — proxy download endpoint with quality=N.
    if media.download_url:
        sep = "&" if "?" in media.download_url else "?"
        return f"{media.download_url}{sep}quality={fit.width}"

    return None


def pick_preset_thumbnail_url(media: Media, preset: str) -> Optional[str]:
    """Semantic shortcut for :func:`pick_thumbnail_url` — ``preset`` is one
    of ``"avatar"`` | ``"card"`` | ``"preview"`` | ``"hero"``."""
    if preset not in THUMBNAIL_PRESETS:
        raise ValueError(
            f"Unknown thumbnail preset {preset!r} — expected one of "
            f"{sorted(THUMBNAIL_PRESETS)}"
        )
    return pick_thumbnail_url(media, THUMBNAIL_PRESETS[preset])
