from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Union


# -- Domains -----------------------------------------------------------------

@dataclass
class Domain:
    id: str
    domain: str
    status: str
    spf_verified: bool
    dkim_verified: bool
    dmarc_verified: bool
    created_at: str
    updated_at: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Domain:
        return cls(
            id=d["id"],
            domain=d["domain"],
            status=d["status"],
            spf_verified=d.get("spfVerified", d.get("spf_verified", False)),
            dkim_verified=d.get("dkimVerified", d.get("dkim_verified", False)),
            dmarc_verified=d.get("dmarcVerified", d.get("dmarc_verified", False)),
            created_at=d.get("createdAt", d.get("created_at", "")),
            updated_at=d.get("updatedAt", d.get("updated_at", "")),
        )


# -- Mailboxes ---------------------------------------------------------------

@dataclass
class MailboxUser:
    email: str
    domain: str
    username: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MailboxUser:
        return cls(
            email=d["email"],
            domain=d["domain"],
            username=d["username"],
        )


# -- Templates ----------------------------------------------------------------

LocalizedString = Union[str, dict[str, str]]


@dataclass
class Template:
    id: str
    name: LocalizedString
    subject: LocalizedString
    mjml_body: LocalizedString
    html_body: Optional[LocalizedString] = None
    variables: Optional[list[str]] = None
    domain_id: Optional[str] = None
    domain_name: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Template:
        return cls(
            id=d["id"],
            name=d["name"],
            subject=d["subject"],
            mjml_body=d.get("mjmlBody", d.get("mjml_body", "")),
            html_body=d.get("htmlBody", d.get("html_body")),
            variables=d.get("variables"),
            domain_id=d.get("domainId", d.get("domain_id")),
            domain_name=d.get("domainName", d.get("domain_name")),
            created_at=d.get("createdAt", d.get("created_at", "")),
            updated_at=d.get("updatedAt", d.get("updated_at", "")),
        )


# -- Inbox --------------------------------------------------------------------

@dataclass
class MessageAddress:
    name: str
    address: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MessageAddress:
        return cls(name=d.get("name", ""), address=d.get("address", ""))


@dataclass
class MessageSummary:
    uid: int
    subject: str
    from_addr: MessageAddress
    to: list[MessageAddress]
    date: str
    seen: bool
    flagged: bool
    size: int
    has_attachments: bool
    preview: str
    message_id: Optional[str]
    in_reply_to: Optional[str]
    category: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MessageSummary:
        from_raw = d.get("from", d.get("from_addr", {}))
        from_addr = MessageAddress.from_dict(from_raw) if isinstance(from_raw, dict) else MessageAddress(name="", address="")
        return cls(
            uid=d["uid"],
            subject=d.get("subject", ""),
            from_addr=from_addr,
            to=[MessageAddress.from_dict(a) for a in d.get("to", [])],
            date=d.get("date", ""),
            seen=d.get("seen", False),
            flagged=d.get("flagged", False),
            size=d.get("size", 0),
            has_attachments=d.get("hasAttachments", d.get("has_attachments", False)),
            preview=d.get("preview", ""),
            message_id=d.get("messageId", d.get("message_id")),
            in_reply_to=d.get("inReplyTo", d.get("in_reply_to")),
            category=d.get("category", ""),
        )


@dataclass
class AttachmentInfo:
    part_id: str
    filename: str
    size: int
    content_type: str
    content_id: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> AttachmentInfo:
        return cls(
            part_id=d.get("partId", d.get("part_id", "")),
            filename=d.get("filename", ""),
            size=d.get("size", 0),
            content_type=d.get("contentType", d.get("content_type", "")),
            content_id=d.get("contentId", d.get("content_id")),
        )


@dataclass
class MessageDetail:
    uid: int
    subject: str
    from_addr: MessageAddress
    to: list[MessageAddress]
    cc: list[MessageAddress]
    reply_to: Optional[MessageAddress]
    date: str
    seen: bool
    flagged: bool
    text_body: Optional[str]
    html_body: Optional[str]
    attachments: list[AttachmentInfo]
    headers: dict[str, str]
    message_id: Optional[str]
    in_reply_to: Optional[str]
    references: list[str]
    folder: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MessageDetail:
        from_raw = d.get("from", d.get("from_addr", {}))
        from_addr = MessageAddress.from_dict(from_raw) if isinstance(from_raw, dict) else MessageAddress(name="", address="")
        reply_to_raw = d.get("replyTo", d.get("reply_to"))
        reply_to = MessageAddress.from_dict(reply_to_raw) if isinstance(reply_to_raw, dict) else None
        return cls(
            uid=d["uid"],
            subject=d.get("subject", ""),
            from_addr=from_addr,
            to=[MessageAddress.from_dict(a) for a in d.get("to", [])],
            cc=[MessageAddress.from_dict(a) for a in d.get("cc", [])],
            reply_to=reply_to,
            date=d.get("date", ""),
            seen=d.get("seen", False),
            flagged=d.get("flagged", False),
            text_body=d.get("textBody", d.get("text_body")),
            html_body=d.get("htmlBody", d.get("html_body")),
            attachments=[AttachmentInfo.from_dict(a) for a in d.get("attachments", [])],
            headers=d.get("headers", {}),
            message_id=d.get("messageId", d.get("message_id")),
            in_reply_to=d.get("inReplyTo", d.get("in_reply_to")),
            references=d.get("references", []),
            folder=d.get("folder"),
        )


@dataclass
class Mailbox:
    name: str
    path: str
    special_use: Optional[str]
    total_messages: int
    unread_messages: int

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Mailbox:
        return cls(
            name=d.get("name", ""),
            path=d.get("path", ""),
            special_use=d.get("specialUse", d.get("special_use")),
            total_messages=d.get("totalMessages", d.get("total_messages", 0)),
            unread_messages=d.get("unreadMessages", d.get("unread_messages", 0)),
        )


@dataclass
class InboxListParams:
    mailbox: Optional[str] = None
    folder: Optional[str] = None
    page: Optional[int] = None
    limit: Optional[int] = None
    unread_only: Optional[bool] = None


# -- Send ---------------------------------------------------------------------

@dataclass
class Attachment:
    filename: str
    content: str
    content_type: Optional[str] = None


@dataclass
class SendParams:
    to: Union[str, list[str]]
    from_addr: str
    subject: str
    domain_id: str
    cc: Optional[Union[str, list[str]]] = None
    template_id: Optional[str] = None
    html: Optional[str] = None
    text: Optional[str] = None
    variables: Optional[dict[str, str]] = None
    reply_to: Optional[str] = None
    attachments: Optional[list[Attachment]] = None
    scheduled_at: Optional[str] = None
    headers: Optional[dict[str, str]] = None
    in_reply_to: Optional[str] = None
    references: Optional[list[str]] = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "to": self.to,
            "from": self.from_addr,
            "subject": self.subject,
            "domainId": self.domain_id,
        }
        if self.cc is not None:
            d["cc"] = self.cc
        if self.template_id is not None:
            d["templateId"] = self.template_id
        if self.html is not None:
            d["html"] = self.html
        if self.text is not None:
            d["text"] = self.text
        if self.variables is not None:
            d["variables"] = self.variables
        if self.reply_to is not None:
            d["replyTo"] = self.reply_to
        if self.attachments is not None:
            d["attachments"] = [
                {
                    "filename": a.filename,
                    "content": a.content,
                    **({"contentType": a.content_type} if a.content_type is not None else {}),
                }
                for a in self.attachments
            ]
        if self.scheduled_at is not None:
            d["scheduledAt"] = self.scheduled_at
        if self.headers is not None:
            d["headers"] = self.headers
        if self.in_reply_to is not None:
            d["inReplyTo"] = self.in_reply_to
        if self.references is not None:
            d["references"] = self.references
        return d


@dataclass
class SendResult:
    job_id: str
    mail_log_id: str
    status: str
    scheduled_at: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> SendResult:
        return cls(
            job_id=d.get("jobId", d.get("job_id", "")),
            mail_log_id=d.get("mailLogId", d.get("mail_log_id", "")),
            status=d.get("status", ""),
            scheduled_at=d.get("scheduledAt", d.get("scheduled_at")),
        )
