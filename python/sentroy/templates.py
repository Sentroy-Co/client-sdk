from __future__ import annotations

import urllib.parse

from sentroy._http import _HttpClient
from sentroy.types import Template


class TemplatesResource:
    """Interact with the Templates API."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(self) -> list[Template]:
        """List all templates."""
        data = self._http.get("/templates")
        return [Template.from_dict(d) for d in (data or [])]

    def get(self, id: str) -> Template:
        """Get a single template by ID."""
        data = self._http.get(f"/templates/{urllib.parse.quote(id, safe='')}")
        return Template.from_dict(data)
