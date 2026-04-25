from __future__ import annotations

from sentroy._http import _HttpClient
from sentroy.types import StorageQuota, StorageUsage


class StorageResource:
    """Read-only storage observability — quota and usage breakdown.

    Bucket and media CRUD live on ``client.buckets`` / ``client.media``.
    """

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def quota(self) -> StorageQuota:
        """Return the company's plan storage quota.

        ``used`` is the bucket total, ``mail_used`` what the mail product
        has stored under the same plan pool, ``limit`` of ``0`` means the
        plan is unlimited.
        """
        data = self._http.get("/storage-quota")
        return StorageQuota.from_dict(data or {})

    def usage(self) -> StorageUsage:
        """Return a single combined dashboard payload.

        Includes plan quota, per-bucket byte/file counts and a per-type
        aggregation across the company. One round-trip; intended for
        usage UIs.
        """
        data = self._http.get("/usage")
        return StorageUsage.from_dict(data or {})
