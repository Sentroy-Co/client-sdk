from __future__ import annotations

from typing import Any, Optional

from sentroy._http import _HttpClient
from sentroy.types import (
    InboxListParams,
    Mailbox,
    MessageDetail,
    MessageSummary,
)


class InboxResource:
    """Interact with the Inbox API."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(self, params: Optional[InboxListParams] = None) -> list[MessageSummary]:
        """List messages in a mailbox folder."""
        query: dict[str, Any] = {}
        if params is not None:
            if params.mailbox is not None:
                query["mailbox"] = params.mailbox
            if params.folder is not None:
                query["folder"] = params.folder
            if params.page is not None:
                query["page"] = params.page
            if params.limit is not None:
                query["limit"] = params.limit
            if params.unread_only:
                query["unreadOnly"] = "true"
        data = self._http.get("/inbox", query or None)
        return [MessageSummary.from_dict(d) for d in (data or [])]

    def get(
        self,
        uid: int,
        *,
        mailbox: Optional[str] = None,
        folder: Optional[str] = None,
    ) -> MessageDetail:
        """Get a single message detail."""
        query: dict[str, Any] = {}
        if mailbox is not None:
            query["mailbox"] = mailbox
        if folder is not None:
            query["folder"] = folder
        data = self._http.get(f"/inbox/{uid}", query or None)
        return MessageDetail.from_dict(data)

    def list_folders(self, mailbox: Optional[str] = None) -> list[Mailbox]:
        """List IMAP folders (mailboxes) for a given email account."""
        query: dict[str, Any] = {}
        if mailbox is not None:
            query["mailbox"] = mailbox
        data = self._http.get("/inbox/mailboxes", query or None)
        return [Mailbox.from_dict(d) for d in (data or [])]

    def get_thread(
        self,
        subject: str,
        mailbox: Optional[str] = None,
    ) -> list[MessageDetail]:
        """Get thread messages by subject."""
        query: dict[str, Any] = {"subject": subject}
        if mailbox is not None:
            query["mailbox"] = mailbox
        data = self._http.get("/inbox/thread", query)
        return [MessageDetail.from_dict(d) for d in (data or [])]

    def mark_as_read(
        self,
        uid: int,
        *,
        mailbox: Optional[str] = None,
        folder: Optional[str] = None,
    ) -> None:
        """Mark a message as read."""
        self._http.post(f"/inbox/{uid}/read", {
            "mailbox": mailbox,
            "folder": folder,
        })

    def mark_as_unread(
        self,
        uid: int,
        *,
        mailbox: Optional[str] = None,
        folder: Optional[str] = None,
    ) -> None:
        """Mark a message as unread."""
        self._http.delete(f"/inbox/{uid}/read", {
            "mailbox": mailbox,
            "folder": folder,
        })

    def move(
        self,
        uid: int,
        to: str,
        *,
        from_folder: Optional[str] = None,
        mailbox: Optional[str] = None,
    ) -> None:
        """Move a message to another folder."""
        self._http.post(f"/inbox/{uid}/move", {
            "to": to,
            "from": from_folder,
            "mailbox": mailbox,
        })

    def delete(
        self,
        uid: int,
        *,
        mailbox: Optional[str] = None,
        folder: Optional[str] = None,
    ) -> None:
        """Delete a message."""
        query: dict[str, Any] = {}
        if mailbox is not None:
            query["mailbox"] = mailbox
        if folder is not None:
            query["folder"] = folder
        self._http.delete(f"/inbox/{uid}", query or None)
