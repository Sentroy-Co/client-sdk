from __future__ import annotations

import urllib.parse
from typing import Any, Optional

from sentroy._http import _HttpClient
from sentroy.types import MailLog


class LogsResource:
    """Mail delivery logs."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        status: Optional[str] = None,
        domain_id: Optional[str] = None,
        from_: Optional[str] = None,
        to: Optional[str] = None,
    ) -> list[MailLog]:
        """List mail-log entries. Filter by ``status``
        (``queued`` | ``processing`` | ``sent`` | ``bounced`` | ``failed``),
        domain, and ISO timestamp range (``from_`` / ``to``, inclusive).
        Results are paginated server-side."""
        query: dict[str, Any] = {}
        if page is not None:
            query["page"] = page
        if limit is not None:
            query["limit"] = limit
        if status:
            query["status"] = status
        if domain_id:
            query["domainId"] = domain_id
        if from_:
            query["from"] = from_
        if to:
            query["to"] = to
        data = self._http.get("/logs", query or None)
        return [MailLog.from_dict(x) for x in (data or [])]

    def get(self, id: str) -> MailLog:
        """Get a single mail-log entry by id."""
        data = self._http.get(f"/logs/{urllib.parse.quote(id, safe='')}")
        return MailLog.from_dict(data)
