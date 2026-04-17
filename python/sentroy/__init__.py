from __future__ import annotations

import urllib.parse

from sentroy._http import SentroyError, _HttpClient
from sentroy.domains import DomainsResource
from sentroy.inbox import InboxResource
from sentroy.mailboxes import MailboxesResource
from sentroy.send import SendResource
from sentroy.templates import TemplatesResource
from sentroy.types import (
    Attachment,
    AttachmentInfo,
    Domain,
    InboxListParams,
    LocalizedString,
    Mailbox,
    MailboxUser,
    MessageAddress,
    MessageDetail,
    MessageSummary,
    SendParams,
    SendResult,
    Template,
)


class Sentroy:
    """Sentroy platform client.

    Example::

        sentroy = Sentroy(
            base_url="https://sentroy.com",
            company_slug="my-company",
            access_token="stk_abc123...",
        )

        domains = sentroy.domains.list()
    """

    domains: DomainsResource
    mailboxes: MailboxesResource
    templates: TemplatesResource
    inbox: InboxResource
    send: SendResource

    def __init__(
        self,
        *,
        base_url: str,
        company_slug: str,
        access_token: str,
        timeout: int = 30,
    ) -> None:
        base = base_url.rstrip("/")
        api_base = f"{base}/api/companies/{urllib.parse.quote(company_slug, safe='')}"
        http = _HttpClient(api_base, access_token, timeout)

        self.domains = DomainsResource(http)
        self.mailboxes = MailboxesResource(http)
        self.templates = TemplatesResource(http)
        self.inbox = InboxResource(http)
        self.send = SendResource(http)


__all__ = [
    "Sentroy",
    "SentroyError",
    "Attachment",
    "AttachmentInfo",
    "Domain",
    "InboxListParams",
    "LocalizedString",
    "Mailbox",
    "MailboxUser",
    "MessageAddress",
    "MessageDetail",
    "MessageSummary",
    "SendParams",
    "SendResult",
    "Template",
]
