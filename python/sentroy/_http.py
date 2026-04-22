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

    def patch(self, path: str, body: Optional[Any] = None) -> Any:
        return self._request("PATCH", path, body=body)

    def delete(
        self,
        path: str,
        query: Optional[dict[str, Any]] = None,
    ) -> Any:
        return self._request("DELETE", path, query=query)

    def post_multipart(
        self,
        path: str,
        *,
        file: tuple[str, bytes, Optional[str]],
        fields: Optional[dict[str, str]] = None,
    ) -> Any:
        """Upload a file via multipart/form-data.

        ``file`` is a (filename, content_bytes, content_type or None) tuple.
        ``fields`` are extra string form fields (folder, public, tags, …).
        """
        import uuid

        boundary = f"----SentroyBoundary{uuid.uuid4().hex}"
        body_parts: list[bytes] = []

        filename, content, content_type = file
        content_type = content_type or "application/octet-stream"

        for name, value in (fields or {}).items():
            if value is None:
                continue
            body_parts.append(f"--{boundary}\r\n".encode("utf-8"))
            body_parts.append(
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(
                    "utf-8"
                )
            )
            body_parts.append(str(value).encode("utf-8"))
            body_parts.append(b"\r\n")

        body_parts.append(f"--{boundary}\r\n".encode("utf-8"))
        body_parts.append(
            (
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                f"Content-Type: {content_type}\r\n\r\n"
            ).encode("utf-8")
        )
        body_parts.append(content)
        body_parts.append(b"\r\n")
        body_parts.append(f"--{boundary}--\r\n".encode("utf-8"))

        data = b"".join(body_parts)
        url = self._build_url(path)

        headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        }
        req = urllib.request.Request(
            url, data=data, headers=headers, method="POST"
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
            message = (
                envelope.get("error") or f"Upload failed with status {exc.code}"
            )
            raise SentroyError(exc.code, envelope, message) from exc

    def fetch_raw(
        self,
        path: str,
        query: Optional[dict[str, Any]] = None,
    ) -> tuple[bytes, str]:
        """GET a binary endpoint. Returns (bytes, content_type)."""
        url = self._build_url(path, query)
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {self._token}"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                return resp.read(), resp.headers.get("Content-Type", "")
        except urllib.error.HTTPError as exc:
            raw_body = exc.read().decode("utf-8") if exc.fp else ""
            raise SentroyError(
                exc.code,
                {"error": raw_body},
                f"Download failed with status {exc.code}",
            ) from exc
