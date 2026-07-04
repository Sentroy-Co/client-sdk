from __future__ import annotations

import urllib.parse
from typing import Any, Optional

from sentroy._http import _HttpClient
from sentroy.types import Suppression


class SuppressionsResource:
    """Suppressed recipients — skipped at send time until removed."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        domain_id: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> list[Suppression]:
        """List suppressions across the company (or a single domain)."""
        query: dict[str, Any] = {}
        if page is not None:
            query["page"] = page
        if limit is not None:
            query["limit"] = limit
        if domain_id:
            query["domainId"] = domain_id
        if reason:
            query["reason"] = reason
        data = self._http.get("/suppressions", query or None)
        return [Suppression.from_dict(s) for s in (data or [])]

    def add(
        self,
        *,
        email: str,
        domain_id: str,
        reason: Optional[str] = None,
    ) -> Suppression:
        """Manually suppress an address (e.g. honoring an off-platform
        opt-out). Bounces and complaints are added automatically by the
        mail server."""
        body: dict[str, Any] = {"email": email, "domainId": domain_id}
        if reason is not None:
            body["reason"] = reason
        data = self._http.post("/suppressions", body)
        return Suppression.from_dict(data)

    def remove(self, id: str) -> None:
        """Remove a suppression — the address becomes eligible to receive
        mail again."""
        self._http.delete(f"/suppressions/{urllib.parse.quote(id, safe='')}")
