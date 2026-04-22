from __future__ import annotations

import os
import urllib.parse
from typing import BinaryIO, Optional, Union

from sentroy._http import _HttpClient
from sentroy.types import Media, MediaListResult


class MediaResource:
    """Upload, list, download, and delete files inside a bucket."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(
        self,
        bucket_slug: str,
        *,
        type: Optional[str] = None,
        folder: Optional[str] = None,
        limit: Optional[int] = None,
        skip: Optional[int] = None,
    ) -> MediaListResult:
        """List files in a bucket (paginated)."""
        query: dict[str, str] = {}
        if type is not None:
            query["type"] = type
        if folder is not None:
            query["folder"] = folder
        if limit is not None:
            query["limit"] = str(limit)
        if skip is not None:
            query["skip"] = str(skip)

        data = self._http.get(
            f"/buckets/{urllib.parse.quote(bucket_slug, safe='')}/media",
            query=query or None,
        )
        return MediaListResult.from_dict(data or {})

    def get(self, bucket_slug: str, media_id: str) -> Media:
        """Get a single media record."""
        data = self._http.get(
            f"/buckets/{urllib.parse.quote(bucket_slug, safe='')}"
            f"/media/{urllib.parse.quote(media_id, safe='')}"
        )
        return Media.from_dict(data)

    def upload(
        self,
        bucket_slug: str,
        *,
        body: Union[bytes, BinaryIO, str],
        filename: Optional[str] = None,
        content_type: Optional[str] = None,
        folder: Optional[str] = None,
        is_public: Optional[bool] = None,
        alt: Optional[str] = None,
        caption: Optional[str] = None,
        tags: Optional[list[str]] = None,
    ) -> Media:
        """Upload a file to a bucket.

        ``body`` can be raw bytes, a file path (str), or a binary file-like
        object. Returns the full serialized media record (including ``url``
        and ``downloadUrl`` when serving from a public bucket).
        """
        if isinstance(body, str):
            if not os.path.isfile(body):
                raise FileNotFoundError(body)
            if filename is None:
                filename = os.path.basename(body)
            with open(body, "rb") as f:
                content = f.read()
        elif isinstance(body, (bytes, bytearray)):
            content = bytes(body)
        else:
            content = body.read()

        if filename is None:
            filename = "upload.bin"

        fields: dict[str, str] = {}
        if folder is not None:
            fields["folder"] = folder
        if is_public is not None:
            fields["public"] = "true" if is_public else "false"
        if alt is not None:
            fields["alt"] = alt
        if caption is not None:
            fields["caption"] = caption
        if tags:
            fields["tags"] = ",".join(tags)

        data = self._http.post_multipart(
            f"/buckets/{urllib.parse.quote(bucket_slug, safe='')}/media",
            file=(filename, content, content_type),
            fields=fields,
        )
        return Media.from_dict(data)

    def download(
        self,
        bucket_slug: str,
        media_id: str,
        *,
        quality: Optional[Union[int, str]] = None,
    ) -> tuple[bytes, str]:
        """Stream a file's bytes back. Works for both public and private
        buckets — private ones are auth-gated through the storage app.

        ``quality`` requests a pre-generated thumbnail width (e.g. ``500``);
        falls back to the original if the variant wasn't generated. Returns
        ``(bytes, content_type)``.
        """
        query: dict[str, str] = {}
        if quality is not None and quality != "original":
            query["quality"] = str(quality)
        return self._http.fetch_raw(
            f"/buckets/{urllib.parse.quote(bucket_slug, safe='')}"
            f"/media/{urllib.parse.quote(media_id, safe='')}/download",
            query=query or None,
        )

    def delete(self, bucket_slug: str, media_id: str) -> None:
        """Delete a file. Cascades through the CDN: S3 objects (original
        + thumbnails) are removed, then the Media record. If any S3 delete
        fails the record is kept so you can retry."""
        self._http.delete(
            f"/buckets/{urllib.parse.quote(bucket_slug, safe='')}"
            f"/media/{urllib.parse.quote(media_id, safe='')}"
        )
