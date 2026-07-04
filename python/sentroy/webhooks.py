from __future__ import annotations

import urllib.parse
from typing import Any, Optional

from sentroy._http import _HttpClient
from sentroy.types import (
    Webhook,
    WebhookDelivery,
    WebhookDeliveryListResult,
    WebhookDispatchResult,
)


class WebhookDeliveriesScope:
    """Delivery-log operations scoped to a single webhook id."""

    def __init__(self, http: _HttpClient, webhook_id: str) -> None:
        self._http = http
        self._webhook_id = urllib.parse.quote(webhook_id, safe="")

    def list(
        self,
        *,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        status: Optional[str] = None,
    ) -> WebhookDeliveryListResult:
        """List recorded test/replay dispatches for this webhook.

        Only console/SDK-fired dispatches are returned — production
        deliveries (driven by the mail server) live elsewhere.
        ``status`` filters by ``success`` | ``failed`` | ``pending``.
        """
        query: dict[str, Any] = {}
        if page is not None:
            query["page"] = page
        if limit is not None:
            query["limit"] = limit
        if status:
            query["status"] = status
        data = self._http.get(
            f"/webhooks/{self._webhook_id}/deliveries", query or None
        )
        return WebhookDeliveryListResult.from_dict(data or {})

    def get(self, delivery_id: str) -> WebhookDelivery:
        """Get a single delivery row, including the full payload and the
        response body (truncated to 4 KB)."""
        data = self._http.get(
            f"/webhooks/{self._webhook_id}/deliveries/"
            f"{urllib.parse.quote(delivery_id, safe='')}"
        )
        return WebhookDelivery.from_dict(data)

    def replay(self, delivery_id: str) -> WebhookDispatchResult:
        """Re-fire the recorded payload at the webhook's *current* URL.
        The new row is linked to this one via ``replay_of``."""
        data = self._http.post(
            f"/webhooks/{self._webhook_id}/deliveries/"
            f"{urllib.parse.quote(delivery_id, safe='')}/replay"
        )
        return WebhookDispatchResult.from_dict(data)


class WebhooksResource:
    """Outbound webhooks for mail events."""

    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(self, *, domain_id: Optional[str] = None) -> list[Webhook]:
        """List webhooks across the company, or scoped to a single domain."""
        query = {"domainId": domain_id} if domain_id else None
        data = self._http.get("/webhooks", query)
        return [Webhook.from_dict(w) for w in (data or [])]

    def get(self, id: str) -> Webhook:
        """Get a single webhook by id. ``secret`` is NOT returned on reads."""
        data = self._http.get(f"/webhooks/{urllib.parse.quote(id, safe='')}")
        return Webhook.from_dict(data)

    def create(
        self,
        *,
        url: str,
        events: list[str],
        domain_id: str,
    ) -> Webhook:
        """Register a webhook for one or more events
        (``sent`` | ``bounced`` | ``failed`` | ``opened`` | ``clicked`` |
        ``unsubscribed``) on a domain.

        The response includes ``secret`` — store it now; subsequent reads
        never return it. Use it to verify HMAC signatures of deliveries.
        """
        data = self._http.post(
            "/webhooks",
            {"url": url, "events": events, "domainId": domain_id},
        )
        return Webhook.from_dict(data)

    def update(
        self,
        id: str,
        *,
        url: Optional[str] = None,
        events: Optional[list[str]] = None,
        active: Optional[bool] = None,
    ) -> Webhook:
        """Patch URL, event list, or the ``active`` flag."""
        body: dict[str, Any] = {}
        if url is not None:
            body["url"] = url
        if events is not None:
            body["events"] = events
        if active is not None:
            body["active"] = active
        data = self._http.patch(
            f"/webhooks/{urllib.parse.quote(id, safe='')}", body
        )
        return Webhook.from_dict(data)

    def delete(self, id: str) -> None:
        """Delete a webhook. In-flight deliveries are not retried."""
        self._http.delete(f"/webhooks/{urllib.parse.quote(id, safe='')}")

    def test(
        self,
        id: str,
        *,
        event: str,
        payload: dict[str, Any],
    ) -> WebhookDispatchResult:
        """Manually fire a custom event payload at a webhook's current URL.
        Records a row in the delivery log."""
        data = self._http.post(
            f"/webhooks/{urllib.parse.quote(id, safe='')}/test",
            {"event": event, "payload": payload},
        )
        return WebhookDispatchResult.from_dict(data)

    def deliveries(self, webhook_id: str) -> WebhookDeliveriesScope:
        """Delivery-log scope for a single webhook id."""
        return WebhookDeliveriesScope(self._http, webhook_id)
