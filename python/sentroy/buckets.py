from __future__ import annotations

import urllib.parse
from typing import Optional

from sentroy._http import _HttpClient
from sentroy.types import Bucket


class BucketsResource:
    """Interact with the storage Buckets API."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(self) -> list[Bucket]:
        """Return every bucket in the company."""
        data = self._http.get("/buckets")
        return [Bucket.from_dict(b) for b in (data or [])]

    def get(self, slug: str) -> Bucket:
        """Return a single bucket by its slug."""
        data = self._http.get(f"/buckets/{urllib.parse.quote(slug, safe='')}")
        return Bucket.from_dict(data)

    def create(
        self,
        *,
        name: str,
        slug: Optional[str] = None,
        description: Optional[str] = None,
        is_public: bool = False,
    ) -> Bucket:
        """Create a new bucket. If ``slug`` is omitted the server derives one
        from ``name``."""
        body: dict = {"name": name, "isPublic": is_public}
        if slug is not None:
            body["slug"] = slug
        if description is not None:
            body["description"] = description
        data = self._http.post("/buckets", body=body)
        return Bucket.from_dict(data)

    def update(
        self,
        slug: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        is_public: Optional[bool] = None,
    ) -> Bucket:
        """Update a bucket's name, description, or visibility.

        Toggling ``is_public`` cascades to every existing file's S3 ACL and
        Media record — large buckets can take a while.
        """
        body: dict = {}
        if name is not None:
            body["name"] = name
        if description is not None:
            body["description"] = description
        if is_public is not None:
            body["isPublic"] = is_public
        data = self._http.patch(
            f"/buckets/{urllib.parse.quote(slug, safe='')}", body=body
        )
        return Bucket.from_dict(data)

    def delete(self, slug: str, *, force: bool = False) -> None:
        """Delete a bucket.

        With ``force=True`` the server purges every file (S3 + Media
        records) first; without it, a non-empty bucket returns 409.
        """
        query = {"force": "true"} if force else None
        self._http.delete(
            f"/buckets/{urllib.parse.quote(slug, safe='')}", query=query
        )
