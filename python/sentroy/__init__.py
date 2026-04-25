from __future__ import annotations

import urllib.parse

from sentroy._http import SentroyError, _HttpClient
from sentroy.buckets import BucketsResource
from sentroy.domains import DomainsResource
from sentroy.inbox import InboxResource
from sentroy.mailboxes import MailboxesResource
from sentroy.media import MediaResource
from sentroy.send import SendResource
from sentroy.storage import StorageResource
from sentroy.templates import TemplatesResource
from sentroy.types import (
    Attachment,
    AttachmentInfo,
    Bucket,
    Domain,
    InboxListParams,
    LocalizedString,
    Mailbox,
    MailboxUser,
    Media,
    MediaImageMeta,
    MediaListResult,
    MediaThumbnail,
    MessageAddress,
    MessageDetail,
    MessageSummary,
    SendParams,
    SendResult,
    StorageQuota,
    StorageUsage,
    StorageUsageBucket,
    StorageUsageByType,
    Template,
)


class Sentroy:
    """Sentroy platform client.

    A single ``base_url`` covers every resource — mail (domains, mailboxes,
    templates, inbox, send) and storage (buckets, media). The platform
    gateway transparently forwards mail requests to the mail subdomain
    and storage requests to the storage subdomain.

    Example::

        sentroy = Sentroy(
            base_url="https://sentroy.com",
            company_slug="my-company",
            access_token="stk_abc123...",
        )

        domains = sentroy.domains.list()
        buckets = sentroy.buckets.list()
    """

    domains: DomainsResource
    mailboxes: MailboxesResource
    templates: TemplatesResource
    inbox: InboxResource
    send: SendResource
    buckets: BucketsResource
    media: MediaResource
    storage: StorageResource

    def __init__(
        self,
        *,
        base_url: str,
        company_slug: str,
        access_token: str,
        timeout: int = 30,
    ) -> None:
        base = base_url.rstrip("/")
        slug = urllib.parse.quote(company_slug, safe="")

        # Mail resources go through the `/api/mail/companies` gateway path.
        mail_http = _HttpClient(
            f"{base}/api/mail/companies/{slug}", access_token, timeout
        )
        # Storage uses the same pattern via `/api/storage/companies`.
        storage_http = _HttpClient(
            f"{base}/api/storage/companies/{slug}", access_token, timeout
        )

        self.domains = DomainsResource(mail_http)
        self.mailboxes = MailboxesResource(mail_http)
        self.templates = TemplatesResource(mail_http)
        self.inbox = InboxResource(mail_http)
        self.send = SendResource(mail_http)
        self.buckets = BucketsResource(storage_http)
        self.media = MediaResource(storage_http)
        self.storage = StorageResource(storage_http)


__all__ = [
    "Sentroy",
    "SentroyError",
    "Attachment",
    "AttachmentInfo",
    "Bucket",
    "Domain",
    "InboxListParams",
    "LocalizedString",
    "Mailbox",
    "MailboxUser",
    "Media",
    "MediaImageMeta",
    "MediaListResult",
    "MediaThumbnail",
    "MessageAddress",
    "MessageDetail",
    "MessageSummary",
    "SendParams",
    "SendResult",
    "StorageQuota",
    "StorageUsage",
    "StorageUsageBucket",
    "StorageUsageByType",
    "Template",
]
