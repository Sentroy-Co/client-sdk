from __future__ import annotations

import urllib.parse
from typing import Any, Optional

from sentroy._http import _HttpClient
from sentroy.types import LocalizedString, Template


class TemplatesResource:
    """Interact with the Templates API."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(self, *, domain_id: Optional[str] = None) -> list[Template]:
        """List all templates, optionally filtered by sending domain."""
        query: dict[str, Any] = {}
        if domain_id is not None:
            query["domainId"] = domain_id
        data = self._http.get("/templates", query or None)
        return [Template.from_dict(d) for d in (data or [])]

    def get(self, id: str) -> Template:
        """Get a single template by ID."""
        data = self._http.get(f"/templates/{urllib.parse.quote(id, safe='')}")
        return Template.from_dict(data)

    def create(
        self,
        *,
        name: LocalizedString,
        subject: LocalizedString,
        mjml_body: LocalizedString,
        domain_id: str,
    ) -> Template:
        """Create an email template. Requires ``templates.manage`` permission.

        ``name`` / ``subject`` / ``mjml_body`` may be a flat string or a
        ``{"tr": ..., "en": ...}`` map. ``variables`` is **not** an input —
        the platform extracts placeholders from the body and returns them
        on the created template.
        """
        data = self._http.post(
            "/templates",
            {
                "name": name,
                "subject": subject,
                "mjmlBody": mjml_body,
                "domainId": domain_id,
            },
        )
        return Template.from_dict(data)

    def update(
        self,
        id: str,
        *,
        name: Optional[LocalizedString] = None,
        subject: Optional[LocalizedString] = None,
        mjml_body: Optional[LocalizedString] = None,
    ) -> Template:
        """Partial update of a template. Requires ``templates.manage``."""
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if subject is not None:
            body["subject"] = subject
        if mjml_body is not None:
            body["mjmlBody"] = mjml_body
        data = self._http.patch(
            f"/templates/{urllib.parse.quote(id, safe='')}", body
        )
        return Template.from_dict(data)

    def delete(self, id: str) -> None:
        """Delete a template by ID. Requires ``templates.manage``."""
        self._http.delete(f"/templates/{urllib.parse.quote(id, safe='')}")
