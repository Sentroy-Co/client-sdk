from __future__ import annotations

import urllib.parse
from typing import Any, Optional, Union

from sentroy._http import _HttpClient
from sentroy.types import (
    WhatsAppAudience,
    WhatsAppAudienceEntry,
    WhatsAppLogListResult,
    WhatsAppNumber,
    WhatsAppSendResult,
    WhatsAppTemplate,
)

# Audience entries accept plain phone strings or per-recipient variable maps.
WhatsAppEntryInput = Union[str, WhatsAppAudienceEntry, dict[str, Any]]

# Sentinel to distinguish "not passed" from an explicit None (nullable fields).
_UNSET: Any = object()


def _serialize_entries(
    entries: list[WhatsAppEntryInput],
) -> list[Union[str, dict[str, Any]]]:
    out: list[Union[str, dict[str, Any]]] = []
    for e in entries:
        if isinstance(e, WhatsAppAudienceEntry):
            out.append(e.to_dict())
        else:
            out.append(e)
    return out


class WhatsAppNumbersResource:
    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(self) -> list[WhatsAppNumber]:
        """List the company's WhatsApp numbers. Only ``connected`` numbers
        can send."""
        data = self._http.get("/numbers")
        return [WhatsAppNumber.from_dict(n) for n in (data or [])]


class WhatsAppTemplatesResource:
    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(self) -> list[WhatsAppTemplate]:
        data = self._http.get("/templates")
        return [WhatsAppTemplate.from_dict(t) for t in (data or [])]

    def get(self, id: str) -> WhatsAppTemplate:
        data = self._http.get(f"/templates/{urllib.parse.quote(id, safe='')}")
        return WhatsAppTemplate.from_dict(data)

    def create(
        self,
        *,
        name: str,
        body: str,
        media_url: Optional[str] = None,
        category: Optional[str] = None,
    ) -> WhatsAppTemplate:
        """Create a template. ``variables`` are auto-extracted server-side
        from ``{{placeholder}}`` tokens in ``body``."""
        payload: dict[str, Any] = {"name": name, "body": body}
        if media_url is not None:
            payload["mediaUrl"] = media_url
        if category is not None:
            payload["category"] = category
        data = self._http.post("/templates", payload)
        return WhatsAppTemplate.from_dict(data)

    def update(
        self,
        id: str,
        *,
        name: Optional[str] = None,
        body: Optional[str] = None,
        media_url: Optional[str] = _UNSET,
        category: Optional[str] = _UNSET,
    ) -> WhatsAppTemplate:
        """Partial update. ``media_url`` and ``category`` are nullable —
        pass ``None`` explicitly to clear them."""
        payload: dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if body is not None:
            payload["body"] = body
        if media_url is not _UNSET:
            payload["mediaUrl"] = media_url
        if category is not _UNSET:
            payload["category"] = category
        data = self._http.patch(
            f"/templates/{urllib.parse.quote(id, safe='')}", payload
        )
        return WhatsAppTemplate.from_dict(data)

    def delete(self, id: str) -> None:
        self._http.delete(f"/templates/{urllib.parse.quote(id, safe='')}")


class WhatsAppAudiencesResource:
    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(self) -> list[WhatsAppAudience]:
        data = self._http.get("/audiences")
        return [WhatsAppAudience.from_dict(a) for a in (data or [])]

    def get(self, id: str) -> WhatsAppAudience:
        data = self._http.get(f"/audiences/{urllib.parse.quote(id, safe='')}")
        return WhatsAppAudience.from_dict(data)

    def create(
        self,
        *,
        name: str,
        entries: list[WhatsAppEntryInput],
        description: Optional[str] = None,
    ) -> WhatsAppAudience:
        """Create an audience. ``entries`` accept plain phone strings or
        ``WhatsAppAudienceEntry`` / ``{"phone": ..., "variables": {...}}``
        for per-recipient variable maps."""
        payload: dict[str, Any] = {
            "name": name,
            "entries": _serialize_entries(entries),
        }
        if description is not None:
            payload["description"] = description
        data = self._http.post("/audiences", payload)
        return WhatsAppAudience.from_dict(data)

    def update(
        self,
        id: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = _UNSET,
        entries: Optional[list[WhatsAppEntryInput]] = None,
    ) -> WhatsAppAudience:
        """Partial update. ``description`` is nullable — pass ``None``
        explicitly to clear it."""
        payload: dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if description is not _UNSET:
            payload["description"] = description
        if entries is not None:
            payload["entries"] = _serialize_entries(entries)
        data = self._http.patch(
            f"/audiences/{urllib.parse.quote(id, safe='')}", payload
        )
        return WhatsAppAudience.from_dict(data)

    def delete(self, id: str) -> None:
        self._http.delete(f"/audiences/{urllib.parse.quote(id, safe='')}")


class WhatsAppLogsResource:
    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        status: Optional[str] = None,
        session_id: Optional[str] = None,
        template_id: Optional[str] = None,
    ) -> WhatsAppLogListResult:
        """List send logs. ``status`` filters by
        ``queued`` | ``sent`` | ``failed``."""
        query: dict[str, Any] = {}
        if page is not None:
            query["page"] = page
        if limit is not None:
            query["limit"] = limit
        if status:
            query["status"] = status
        if session_id:
            query["sessionId"] = session_id
        if template_id:
            query["templateId"] = template_id
        data = self._http.get("/logs", query or None)
        return WhatsAppLogListResult.from_dict(data or {})


class WhatsAppResource:
    """WhatsApp Santral — send template-based messages, manage templates
    and audiences, list connected numbers, and read send logs. Uses the
    same ``stk_`` access token as mail and storage."""

    numbers: WhatsAppNumbersResource
    templates: WhatsAppTemplatesResource
    audiences: WhatsAppAudiencesResource
    logs: WhatsAppLogsResource

    def __init__(self, http: _HttpClient) -> None:
        self._http = http
        self.numbers = WhatsAppNumbersResource(http)
        self.templates = WhatsAppTemplatesResource(http)
        self.audiences = WhatsAppAudiencesResource(http)
        self.logs = WhatsAppLogsResource(http)

    def send(
        self,
        *,
        from_: Optional[str] = None,
        to: Optional[str] = None,
        audience_id: Optional[str] = None,
        template_id: Optional[str] = None,
        body: Optional[str] = None,
        variables: Optional[dict[str, str]] = None,
    ) -> WhatsAppSendResult:
        """Send a WhatsApp message.

        - ``from_``: sender — a connected number's session id or phone
          number. Omit to use the company's only connected number.
        - ``to`` (single E.164 recipient) XOR ``audience_id`` (bulk).
        - ``template_id`` XOR raw ``body`` with ``{{variables}}``.
        - ``variables``: global values, merged UNDER per-recipient
          audience variables.

        Returns a per-recipient result summary.
        """
        payload: dict[str, Any] = {}
        if from_ is not None:
            payload["from"] = from_
        if to is not None:
            payload["to"] = to
        if audience_id is not None:
            payload["audienceId"] = audience_id
        if template_id is not None:
            payload["templateId"] = template_id
        if body is not None:
            payload["body"] = body
        if variables is not None:
            payload["variables"] = variables
        data = self._http.post("/send", payload)
        return WhatsAppSendResult.from_dict(data)
