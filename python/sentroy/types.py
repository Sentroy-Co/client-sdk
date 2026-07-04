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
    lang: Optional[str] = None  # Template language code (e.g. "en", "tr")
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
        if self.lang is not None:
            d["lang"] = self.lang
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


# -- Storage / Buckets --------------------------------------------------------

@dataclass
class Bucket:
    """An isolated storage container with its own visibility and usage counters."""

    id: str
    company_id: str
    name: str
    slug: str
    is_public: bool
    storage_used: int
    file_count: int
    created_at: str
    updated_at: str
    description: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Bucket:
        return cls(
            id=d["id"],
            company_id=d.get("companyId", d.get("company_id", "")),
            name=d.get("name", ""),
            slug=d.get("slug", ""),
            description=d.get("description"),
            is_public=d.get("isPublic", d.get("is_public", False)),
            storage_used=d.get("storageUsed", d.get("storage_used", 0)),
            file_count=d.get("fileCount", d.get("file_count", 0)),
            created_at=d.get("createdAt", d.get("created_at", "")),
            updated_at=d.get("updatedAt", d.get("updated_at", "")),
        )


# -- Storage / Media ----------------------------------------------------------

@dataclass
class MediaThumbnail:
    width: int
    height: int
    file_name: str
    size: int
    # Some endpoints expose the thumbnail's own URL at runtime.
    url: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MediaThumbnail:
        return cls(
            width=d.get("width", 0),
            height=d.get("height", 0),
            file_name=d.get("fileName", d.get("file_name", "")),
            size=d.get("size", 0),
            url=d.get("url"),
        )


@dataclass
class MediaImageMeta:
    width: int
    height: int
    orientation: str  # "landscape" | "portrait" | "square"
    thumbnails: list[MediaThumbnail]

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MediaImageMeta:
        return cls(
            width=d.get("width", 0),
            height=d.get("height", 0),
            orientation=d.get("orientation", ""),
            thumbnails=[
                MediaThumbnail.from_dict(t) for t in d.get("thumbnails", [])
            ],
        )


@dataclass
class MediaVideoVariant:
    """Single transcoded video rung (generated with ``transcode_video=True``).

    Reachable via ``/f/<mediaId>/<height>`` (e.g. ``/f/abc/720``).
    """

    height: int
    width: int
    file_name: str
    size: int
    bitrate: Optional[int] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MediaVideoVariant:
        return cls(
            height=d.get("height", 0),
            width=d.get("width", 0),
            file_name=d.get("fileName", d.get("file_name", "")),
            size=d.get("size", 0),
            bitrate=d.get("bitrate"),
        )


@dataclass
class MediaVideoMeta:
    width: int
    height: int
    duration: float  # seconds; may be 0 if probe failed
    variants: list[MediaVideoVariant]

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MediaVideoMeta:
        return cls(
            width=d.get("width", 0),
            height=d.get("height", 0),
            duration=d.get("duration", 0),
            variants=[
                MediaVideoVariant.from_dict(v) for v in d.get("variants", [])
            ],
        )


@dataclass
class MediaProcessing:
    """Async background-processing tracker (video variant ladder).

    Poll ``media.get`` while ``status`` is ``queued`` / ``processing``.
    """

    status: str  # "queued" | "processing" | "completed" | "failed"
    variants_total: Optional[int] = None
    variants_completed: Optional[int] = None
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MediaProcessing:
        return cls(
            status=d.get("status", ""),
            variants_total=d.get("variantsTotal", d.get("variants_total")),
            variants_completed=d.get(
                "variantsCompleted", d.get("variants_completed")
            ),
            error=d.get("error"),
            started_at=d.get("startedAt", d.get("started_at")),
            completed_at=d.get("completedAt", d.get("completed_at")),
        )


@dataclass
class Media:
    """A single file stored inside a bucket."""

    id: str
    bucket_id: str
    company_id: str
    file_name: str
    original_name: str
    type: str  # "image" | "video" | "audio" | "document" | "other"
    size: int
    mime_type: str
    folder: str
    uploaded_by: str
    tags: list[str]
    is_public: bool
    created_at: str
    updated_at: str
    alt: Optional[str] = None
    caption: Optional[str] = None
    image_meta: Optional[MediaImageMeta] = None
    # Populated for video uploads with transcode_video=True.
    video_meta: Optional[MediaVideoMeta] = None
    # Present on uploads that triggered async work (video transcode).
    processing: Optional[MediaProcessing] = None
    # Direct CDN URL on public buckets (not always present).
    url: Optional[str] = None
    # Auth-gated download URL (proxy or short-lived signed link).
    download_url: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Media:
        image_meta_raw = d.get("imageMeta", d.get("image_meta"))
        video_meta_raw = d.get("videoMeta", d.get("video_meta"))
        processing_raw = d.get("processing")
        return cls(
            id=d["id"],
            bucket_id=d.get("bucketId", d.get("bucket_id", "")),
            company_id=d.get("companyId", d.get("company_id", "")),
            file_name=d.get("fileName", d.get("file_name", "")),
            original_name=d.get("originalName", d.get("original_name", "")),
            type=d.get("type", "other"),
            size=d.get("size", 0),
            mime_type=d.get("mimeType", d.get("mime_type", "")),
            folder=d.get("folder", ""),
            uploaded_by=d.get("uploadedBy", d.get("uploaded_by", "")),
            tags=d.get("tags", []),
            alt=d.get("alt"),
            caption=d.get("caption"),
            is_public=d.get("isPublic", d.get("is_public", False)),
            image_meta=(
                MediaImageMeta.from_dict(image_meta_raw)
                if isinstance(image_meta_raw, dict)
                else None
            ),
            video_meta=(
                MediaVideoMeta.from_dict(video_meta_raw)
                if isinstance(video_meta_raw, dict)
                else None
            ),
            processing=(
                MediaProcessing.from_dict(processing_raw)
                if isinstance(processing_raw, dict)
                else None
            ),
            url=d.get("url"),
            download_url=d.get("downloadUrl", d.get("download_url")),
            created_at=d.get("createdAt", d.get("created_at", "")),
            updated_at=d.get("updatedAt", d.get("updated_at", "")),
        )


@dataclass
class MediaListResult:
    items: list[Media]
    total: int
    limit: int
    skip: int

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MediaListResult:
        return cls(
            items=[Media.from_dict(m) for m in d.get("items", [])],
            total=d.get("total", 0),
            limit=d.get("limit", 0),
            skip=d.get("skip", 0),
        )


# ── Storage quota / usage ─────────────────────────────────────────────────


@dataclass
class StorageQuota:
    """Plan-level storage quota for the company.

    Mail and storage share the same byte pool: ``used`` is storage's
    slice, ``mail_used`` what the mail product has occupied. ``limit``
    of ``0`` means the plan is unlimited.
    """

    used: int
    limit: int
    mail_used: int
    plan_name: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> StorageQuota:
        return cls(
            used=d.get("used", 0),
            limit=d.get("limit", 0),
            mail_used=d.get("mailUsed", 0),
            plan_name=d.get("planName"),
        )


@dataclass
class StorageUsageBucket:
    """One bucket inside :class:`StorageUsage`."""

    id: str
    name: str
    slug: str
    storage_used: int
    file_count: int
    is_public: bool

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> StorageUsageBucket:
        return cls(
            id=d.get("id", ""),
            name=d.get("name", ""),
            slug=d.get("slug", ""),
            storage_used=d.get("storageUsed", 0),
            file_count=d.get("fileCount", 0),
            is_public=bool(d.get("isPublic", False)),
        )


@dataclass
class StorageUsageByType:
    """One media-type aggregation row."""

    type: str
    count: int
    bytes: int

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> StorageUsageByType:
        return cls(
            type=d.get("type", "other"),
            count=d.get("count", 0),
            bytes=d.get("bytes", 0),
        )


@dataclass
class StorageUsage:
    """Combined usage snapshot returned by ``client.storage.usage()``."""

    quota: StorageQuota
    buckets: list[StorageUsageBucket]
    by_type: list[StorageUsageByType]

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> StorageUsage:
        return cls(
            quota=StorageQuota.from_dict(d.get("quota") or {}),
            buckets=[
                StorageUsageBucket.from_dict(b) for b in (d.get("buckets") or [])
            ],
            by_type=[
                StorageUsageByType.from_dict(t) for t in (d.get("byType") or [])
            ],
        )


# ── Audience / Contacts ─────────────────────────────────────────────────────


@dataclass
class Contact:
    id: str
    company_id: str
    email: str
    tags: list[str]
    status: str  # "active" | "unsubscribed" | "bounced"
    metadata: dict[str, Any]
    created_at: str
    updated_at: str
    name: Optional[str] = None
    last_emailed_at: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Contact:
        return cls(
            id=d["id"],
            company_id=d.get("companyId", d.get("company_id", "")),
            email=d.get("email", ""),
            name=d.get("name"),
            tags=d.get("tags", []),
            status=d.get("status", ""),
            metadata=d.get("metadata") or {},
            last_emailed_at=d.get("lastEmailedAt", d.get("last_emailed_at")),
            created_at=d.get("createdAt", d.get("created_at", "")),
            updated_at=d.get("updatedAt", d.get("updated_at", "")),
        )


@dataclass
class ContactList:
    id: str
    company_id: str
    name: str
    created_at: str
    updated_at: str
    description: Optional[str] = None
    member_count: Optional[int] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> ContactList:
        return cls(
            id=d["id"],
            company_id=d.get("companyId", d.get("company_id", "")),
            name=d.get("name", ""),
            description=d.get("description"),
            member_count=d.get("memberCount", d.get("member_count")),
            created_at=d.get("createdAt", d.get("created_at", "")),
            updated_at=d.get("updatedAt", d.get("updated_at", "")),
        )


@dataclass
class ContactListResult:
    contacts: list[Contact]
    total: int
    page: int
    limit: int

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> ContactListResult:
        return cls(
            contacts=[Contact.from_dict(c) for c in d.get("contacts", [])],
            total=d.get("total", 0),
            page=d.get("page", 0),
            limit=d.get("limit", 0),
        )


# ── Suppressions ────────────────────────────────────────────────────────────


@dataclass
class Suppression:
    """A suppressed recipient — skipped at send time until removed."""

    id: str
    email: str
    reason: str
    domain_id: str
    created_at: str
    # Populated domain name when the server expands the relation.
    domain: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Suppression:
        domain_raw = d.get("domain")
        domain = (
            domain_raw.get("domain")
            if isinstance(domain_raw, dict)
            else domain_raw
        )
        return cls(
            id=d["id"],
            email=d.get("email", ""),
            reason=d.get("reason", ""),
            domain_id=d.get("domainId", d.get("domain_id", "")),
            created_at=d.get("createdAt", d.get("created_at", "")),
            domain=domain,
        )


# ── Webhooks ────────────────────────────────────────────────────────────────


@dataclass
class Webhook:
    id: str
    url: str
    events: list[str]
    active: bool
    domain_id: str
    created_at: str
    updated_at: str
    # Returned ONLY on create — store it for HMAC verification.
    secret: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Webhook:
        return cls(
            id=d["id"],
            url=d.get("url", ""),
            events=d.get("events", []),
            active=d.get("active", False),
            domain_id=d.get("domainId", d.get("domain_id", "")),
            secret=d.get("secret"),
            created_at=d.get("createdAt", d.get("created_at", "")),
            updated_at=d.get("updatedAt", d.get("updated_at", "")),
        )


@dataclass
class WebhookDelivery:
    """One recorded test/replay dispatch row."""

    id: str
    webhook_id: str
    company_id: str
    kind: str  # "test" | "replay"
    event: str
    payload: dict[str, Any]
    url: str
    response_status: int  # 0 if the request never landed
    response_body: str  # truncated to 4 KB
    duration_ms: int
    status: str  # "success" | "failed" | "pending"
    triggered_by: str
    created_at: str
    error: Optional[str] = None
    replay_of: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WebhookDelivery:
        return cls(
            id=d["id"],
            webhook_id=d.get("webhookId", d.get("webhook_id", "")),
            company_id=d.get("companyId", d.get("company_id", "")),
            kind=d.get("kind", ""),
            event=d.get("event", ""),
            payload=d.get("payload") or {},
            url=d.get("url", ""),
            response_status=d.get("responseStatus", d.get("response_status", 0)),
            response_body=d.get("responseBody", d.get("response_body", "")),
            duration_ms=d.get("durationMs", d.get("duration_ms", 0)),
            status=d.get("status", ""),
            error=d.get("error"),
            replay_of=d.get("replayOf", d.get("replay_of")),
            triggered_by=d.get("triggeredBy", d.get("triggered_by", "")),
            created_at=d.get("createdAt", d.get("created_at", "")),
        )


@dataclass
class WebhookDeliveryListResult:
    items: list[WebhookDelivery]
    total: int
    page: int
    limit: int

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WebhookDeliveryListResult:
        return cls(
            items=[WebhookDelivery.from_dict(i) for i in d.get("items", [])],
            total=d.get("total", 0),
            page=d.get("page", 0),
            limit=d.get("limit", 0),
        )


@dataclass
class WebhookDispatchResult:
    delivery_id: str
    response_status: int
    duration_ms: int
    status: str  # "success" | "failed"
    error: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WebhookDispatchResult:
        return cls(
            delivery_id=d.get("deliveryId", d.get("delivery_id", "")),
            response_status=d.get("responseStatus", d.get("response_status", 0)),
            duration_ms=d.get("durationMs", d.get("duration_ms", 0)),
            status=d.get("status", ""),
            error=d.get("error"),
        )


# ── Mail logs ───────────────────────────────────────────────────────────────


@dataclass
class MailLog:
    id: str
    to: str
    from_addr: str
    subject: str
    status: str  # "queued" | "processing" | "sent" | "bounced" | "failed"
    message_id: Optional[str]
    domain_id: str
    template_id: Optional[str]
    variables: Optional[dict[str, Any]]
    sent_at: Optional[str]
    bounced_at: Optional[str]
    error: Optional[str]
    created_at: str
    domain: Optional[str] = None
    scheduled_at: Optional[str] = None
    opened_at: Optional[str] = None
    clicked_at: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MailLog:
        domain_raw = d.get("domain")
        domain = (
            domain_raw.get("domain")
            if isinstance(domain_raw, dict)
            else domain_raw
        )
        return cls(
            id=d["id"],
            to=d.get("to", ""),
            from_addr=d.get("from", d.get("from_addr", "")),
            subject=d.get("subject", ""),
            status=d.get("status", ""),
            message_id=d.get("messageId", d.get("message_id")),
            domain_id=d.get("domainId", d.get("domain_id", "")),
            domain=domain,
            template_id=d.get("templateId", d.get("template_id")),
            variables=d.get("variables"),
            scheduled_at=d.get("scheduledAt", d.get("scheduled_at")),
            sent_at=d.get("sentAt", d.get("sent_at")),
            bounced_at=d.get("bouncedAt", d.get("bounced_at")),
            opened_at=d.get("openedAt", d.get("opened_at")),
            clicked_at=d.get("clickedAt", d.get("clicked_at")),
            error=d.get("error"),
            created_at=d.get("createdAt", d.get("created_at", "")),
        )


# ── WhatsApp ────────────────────────────────────────────────────────────────


@dataclass
class WhatsAppNumber:
    session_id: str
    phone_number: Optional[str]
    label: Optional[str]
    status: str
    # Convenience: status == "connected". Only connected numbers can send.
    connected: bool

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WhatsAppNumber:
        return cls(
            session_id=d.get("sessionId", d.get("session_id", "")),
            phone_number=d.get("phoneNumber", d.get("phone_number")),
            label=d.get("label"),
            status=d.get("status", ""),
            connected=d.get("connected", False),
        )


@dataclass
class WhatsAppTemplate:
    id: str
    name: str
    # Message body with {{variable}} placeholders.
    body: str
    # Variable names extracted server-side from the body.
    variables: list[str]
    media_url: Optional[str]
    category: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WhatsAppTemplate:
        return cls(
            id=d["id"],
            name=d.get("name", ""),
            body=d.get("body", ""),
            variables=d.get("variables", []),
            media_url=d.get("mediaUrl", d.get("media_url")),
            category=d.get("category"),
            created_at=d.get("createdAt", d.get("created_at", "")),
            updated_at=d.get("updatedAt", d.get("updated_at", "")),
        )


@dataclass
class WhatsAppAudienceEntry:
    phone: str
    variables: Optional[dict[str, str]] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WhatsAppAudienceEntry:
        return cls(phone=d.get("phone", ""), variables=d.get("variables"))

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"phone": self.phone}
        if self.variables is not None:
            out["variables"] = self.variables
        return out


@dataclass
class WhatsAppAudience:
    id: str
    name: str
    description: Optional[str]
    entries: list[WhatsAppAudienceEntry]
    entry_count: int
    created_at: str
    updated_at: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WhatsAppAudience:
        return cls(
            id=d["id"],
            name=d.get("name", ""),
            description=d.get("description"),
            entries=[
                WhatsAppAudienceEntry.from_dict(e)
                for e in d.get("entries", [])
                if isinstance(e, dict)
            ],
            entry_count=d.get("entryCount", d.get("entry_count", 0)),
            created_at=d.get("createdAt", d.get("created_at", "")),
            updated_at=d.get("updatedAt", d.get("updated_at", "")),
        )


@dataclass
class WhatsAppSendResultItem:
    to: str
    status: str  # "sent" | "failed"
    wa_message_id: Optional[str] = None
    error: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WhatsAppSendResultItem:
        return cls(
            to=d.get("to", ""),
            status=d.get("status", ""),
            wa_message_id=d.get("waMessageId", d.get("wa_message_id")),
            error=d.get("error"),
        )


@dataclass
class WhatsAppSendResult:
    total: int
    sent: int
    failed: int
    results: list[WhatsAppSendResultItem]

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WhatsAppSendResult:
        return cls(
            total=d.get("total", 0),
            sent=d.get("sent", 0),
            failed=d.get("failed", 0),
            results=[
                WhatsAppSendResultItem.from_dict(r) for r in d.get("results", [])
            ],
        )


@dataclass
class WhatsAppLog:
    id: str
    session_id: str
    to: str
    template_id: Optional[str]
    audience_id: Optional[str]
    status: str  # "queued" | "sent" | "failed"
    wa_message_id: Optional[str]
    error: Optional[str]
    created_at: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WhatsAppLog:
        return cls(
            id=d["id"],
            session_id=d.get("sessionId", d.get("session_id", "")),
            to=d.get("to", ""),
            template_id=d.get("templateId", d.get("template_id")),
            audience_id=d.get("audienceId", d.get("audience_id")),
            status=d.get("status", ""),
            wa_message_id=d.get("waMessageId", d.get("wa_message_id")),
            error=d.get("error"),
            created_at=d.get("createdAt", d.get("created_at", "")),
        )


@dataclass
class WhatsAppLogListResult:
    data: list[WhatsAppLog]
    page: int
    limit: int
    total: int

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WhatsAppLogListResult:
        return cls(
            data=[WhatsAppLog.from_dict(x) for x in d.get("data", [])],
            page=d.get("page", 0),
            limit=d.get("limit", 0),
            total=d.get("total", 0),
        )
