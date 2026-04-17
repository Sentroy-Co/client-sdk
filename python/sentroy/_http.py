from __future__ import annotations

import json
import urllib.request
import urllib.parse
import urllib.error
from typing import Any, Optional


class SentroyError(Exception):
    """Raised when the Sentroy API returns an error response."""

    def __init__(
        self,
        status_code: int,
        body: Any,
        message: Optional[str] = None,
    ) -> None:
        self.status_code = status_code
        self.body = body
        super().__init__(message or f"Sentroy API error ({status_code})")


class _HttpClient:
    """Low-level HTTP client that wraps urllib.request for Sentroy API calls."""

    def __init__(self, base_url: str, token: str, timeout: int = 30) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._timeout = timeout

    def _build_url(
        self,
        path: str,
        query: Optional[dict[str, Any]] = None,
    ) -> str:
        url = f"{self._base_url}{path}"
        if query:
            filtered = {
                k: str(v) for k, v in query.items() if v is not None
            }
            if filtered:
                url = f"{url}?{urllib.parse.urlencode(filtered)}"
        return url

    def _request(
        self,
        method: str,
        path: str,
        query: Optional[dict[str, Any]] = None,
        body: Optional[Any] = None,
    ) -> Any:
        url = self._build_url(path, query)

        headers: dict[str, str] = {
            "Authorization": f"Bearer {self._token}",
        }

        data: Optional[bytes] = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=data,
            headers=headers,
            method=method,
        )

        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                raw = resp.read().decode("utf-8")
                envelope = json.loads(raw) if raw else {}
                return envelope.get("data")
        except urllib.error.HTTPError as exc:
            raw_body = exc.read().decode("utf-8") if exc.fp else ""
            try:
                envelope = json.loads(raw_body)
            except (json.JSONDecodeError, ValueError):
                envelope = {"error": raw_body}
            message = envelope.get("error") or f"Request failed with status {exc.code}"
            raise SentroyError(exc.code, envelope, message) from exc

    def get(self, path: str, query: Optional[dict[str, Any]] = None) -> Any:
        return self._request("GET", path, query=query)

    def post(self, path: str, body: Optional[Any] = None) -> Any:
        return self._request("POST", path, body=body)

    def put(self, path: str, body: Optional[Any] = None) -> Any:
        return self._request("PUT", path, body=body)

    def delete(self, path: str, query: Optional[dict[str, Any]] = None) -> Any:
        return self._request("DELETE", path, query=query)
