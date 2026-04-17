from __future__ import annotations

from sentroy._http import _HttpClient
from sentroy.types import MailboxUser


class MailboxesResource:
    """Interact with the Mailboxes API."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(self) -> list[MailboxUser]:
        """List all mailbox accounts for the company."""
        data = self._http.get("/mailboxes")
        return [MailboxUser.from_dict(d) for d in (data or [])]
