from __future__ import annotations

import urllib.parse

from sentroy._http import _HttpClient
from sentroy.types import Domain


class DomainsResource:
    """Interact with the Domains API."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(self) -> list[Domain]:
        """List all verified domains for the company."""
        data = self._http.get("/domains")
        return [Domain.from_dict(d) for d in (data or [])]

    def get(self, id: str) -> Domain:
        """Get a single domain by ID."""
        data = self._http.get(f"/domains/{urllib.parse.quote(id, safe='')}")
        return Domain.from_dict(data)
