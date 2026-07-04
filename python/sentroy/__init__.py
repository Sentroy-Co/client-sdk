from __future__ import annotations

import urllib.parse

from sentroy._http import SentroyError, _HttpClient
from sentroy.audience import AudienceResource
from sentroy.auth import (
    SentroyAuth,
    SentroyAuthError,
    SentroyAuthUser,
)
from sentroy.buckets import BucketsResource
from sentroy.domains import DomainsResource
from sentroy.inbox import InboxResource
from sentroy.logs import LogsResource
from sentroy.mailboxes import MailboxesResource
from sentroy.media import MediaResource
from sentroy.send import SendResource
from sentroy.storage import StorageResource
from sentroy.suppressions import SuppressionsResource
from sentroy.templates import TemplatesResource
from sentroy.thumbnails import (
    THUMBNAIL_PRESETS,
    pick_preset_thumbnail_url,
    pick_thumbnail_url,
)
from sentroy.types import (
    Attachment,
    AttachmentInfo,
    Bucket,
    Contact,
    ContactList,
    ContactListResult,
    Domain,
    InboxListParams,
    LocalizedString,
    Mailbox,
    MailboxUser,
    MailLog,
    Media,
    MediaImageMeta,
    MediaListResult,
    MediaProcessing,
    MediaThumbnail,
    MediaVideoMeta,
    MediaVideoVariant,
    MessageAddress,
    MessageDetail,
    MessageSummary,
    SendParams,
    SendResult,
    StorageQuota,
    StorageUsage,
    StorageUsageBucket,
    StorageUsageByType,
    Suppression,
    Template,
    Webhook,
    WebhookDelivery,
    WebhookDeliveryListResult,
    WebhookDispatchResult,
    WhatsAppAudience,
    WhatsAppAudienceEntry,
    WhatsAppLog,
    WhatsAppLogListResult,
    WhatsAppNumber,
    WhatsAppSendResult,
    WhatsAppSendResultItem,
    WhatsAppTemplate,
)
from sentroy.webhooks import WebhooksResource
from sentroy.whatsapp import WhatsAppResource


class Sentroy:
    """Sentroy platform client.

    A single ``base_url`` covers every resource — mail (domains, mailboxes,
    templates, inbox, send, audience, suppressions, webhooks, logs),
    storage (buckets, media) and WhatsApp. The platform gateway
    transparently forwards each request to the right subdomain; the same
    ``stk_`` token works across all of them.

    Example::

        sentroy = Sentroy(
            base_url="https://sentroy.com",
            company_slug="my-company",
            access_token="stk_abc123...",
        )

        domains = sentroy.domains.list()
        buckets = sentroy.buckets.list()
        numbers = sentroy.whatsapp.numbers.list()
    """

    domains: DomainsResource
    mailboxes: MailboxesResource
    templates: TemplatesResource
    inbox: InboxResource
    send: SendResource
    audience: AudienceResource
    suppressions: SuppressionsResource
    webhooks: WebhooksResource
    logs: LogsResource
    buckets: BucketsResource
    media: MediaResource
    storage: StorageResource
    whatsapp: WhatsAppResource

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
        # WhatsApp Santral via `/api/whatsapp/companies`.
        whatsapp_http = _HttpClient(
            f"{base}/api/whatsapp/companies/{slug}", access_token, timeout
        )

        self.domains = DomainsResource(mail_http)
        self.mailboxes = MailboxesResource(mail_http)
        self.templates = TemplatesResource(mail_http)
        self.inbox = InboxResource(mail_http)
        self.send = SendResource(mail_http)
        self.audience = AudienceResource(mail_http)
        self.suppressions = SuppressionsResource(mail_http)
        self.webhooks = WebhooksResource(mail_http)
        self.logs = LogsResource(mail_http)
        self.buckets = BucketsResource(storage_http)
        self.media = MediaResource(storage_http)
        self.storage = StorageResource(storage_http)
        self.whatsapp = WhatsAppResource(whatsapp_http)


__all__ = [
    "Sentroy",
    "SentroyError",
    # Auth-as-a-Service (separate entry point — see sentroy.auth)
    "SentroyAuth",
    "SentroyAuthError",
    "SentroyAuthUser",
    # Mail
    "Attachment",
    "AttachmentInfo",
    "Domain",
    "InboxListParams",
    "LocalizedString",
    "Mailbox",
    "MailboxUser",
    "MailLog",
    "MessageAddress",
    "MessageDetail",
    "MessageSummary",
    "SendParams",
    "SendResult",
    "Template",
    # Audience
    "Contact",
    "ContactList",
    "ContactListResult",
    # Suppressions
    "Suppression",
    # Webhooks
    "Webhook",
    "WebhookDelivery",
    "WebhookDeliveryListResult",
    "WebhookDispatchResult",
    # Storage
    "Bucket",
    "Media",
    "MediaImageMeta",
    "MediaListResult",
    "MediaProcessing",
    "MediaThumbnail",
    "MediaVideoMeta",
    "MediaVideoVariant",
    "StorageQuota",
    "StorageUsage",
    "StorageUsageBucket",
    "StorageUsageByType",
    # WhatsApp
    "WhatsAppAudience",
    "WhatsAppAudienceEntry",
    "WhatsAppLog",
    "WhatsAppLogListResult",
    "WhatsAppNumber",
    "WhatsAppSendResult",
    "WhatsAppSendResultItem",
    "WhatsAppTemplate",
    # Thumbnail helpers
    "THUMBNAIL_PRESETS",
    "pick_thumbnail_url",
    "pick_preset_thumbnail_url",
]
