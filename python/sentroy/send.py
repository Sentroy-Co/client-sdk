from __future__ import annotations

from sentroy._http import _HttpClient
from sentroy.types import SendParams, SendResult


class SendResource:
    """Interact with the Send API."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def email(self, params: SendParams) -> SendResult:
        """Send an email."""
        data = self._http.post("/send", params.to_dict())
        return SendResult.from_dict(data)
