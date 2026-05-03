import type { HttpClient } from "../http"
import type {
  CreateWebhookParams,
  UpdateWebhookParams,
  Webhook,
  WebhookDelivery,
  WebhookDeliveryListParams,
  WebhookDeliveryListResult,
  WebhookDispatchResult,
  WebhookTestParams,
} from "../types"

class WebhookDeliveries {
  constructor(
    private http: HttpClient,
    private webhookId: string,
  ) {}

  /**
   * List recorded test/replay dispatches for a webhook. Production
   * deliveries (driven by the mail server) live elsewhere — this
   * returns only what was fired from the Sentroy console or this SDK's
   * `test` / `replay` calls.
   */
  async list(
    params?: WebhookDeliveryListParams,
  ): Promise<WebhookDeliveryListResult> {
    const query: Record<string, unknown> = {}
    if (params?.page !== undefined) query.page = params.page
    if (params?.limit !== undefined) query.limit = params.limit
    if (params?.status) query.status = params.status
    return this.http.get<WebhookDeliveryListResult>(
      `/webhooks/${encodeURIComponent(this.webhookId)}/deliveries`,
      query,
    )
  }

  /** Get a single delivery row, including the full payload + response body. */
  async get(deliveryId: string): Promise<WebhookDelivery> {
    return this.http.get<WebhookDelivery>(
      `/webhooks/${encodeURIComponent(this.webhookId)}/deliveries/${encodeURIComponent(deliveryId)}`,
    )
  }

  /**
   * Re-fire the recorded payload at the webhook's *current* URL. The
   * new row is linked to this one via `replayOf`.
   */
  async replay(deliveryId: string): Promise<WebhookDispatchResult> {
    return this.http.post<WebhookDispatchResult>(
      `/webhooks/${encodeURIComponent(this.webhookId)}/deliveries/${encodeURIComponent(deliveryId)}/replay`,
    )
  }
}

export class Webhooks {
  constructor(private http: HttpClient) {}

  /** List webhooks across the company, or scoped to a single domain. */
  async list(domainId?: string): Promise<Webhook[]> {
    return this.http.get<Webhook[]>(
      "/webhooks",
      domainId ? { domainId } : undefined,
    )
  }

  /** Get a single webhook by id. */
  async get(id: string): Promise<Webhook> {
    return this.http.get<Webhook>(`/webhooks/${encodeURIComponent(id)}`)
  }

  /**
   * Register a webhook for one or more events on a domain. The response
   * includes a `secret` — store it now; subsequent reads only return the
   * webhook config without the secret.
   */
  async create(params: CreateWebhookParams): Promise<Webhook> {
    return this.http.post<Webhook>("/webhooks", params)
  }

  /** Patch URL, event list, or `active` flag. */
  async update(id: string, params: UpdateWebhookParams): Promise<Webhook> {
    return this.http.patch<Webhook>(
      `/webhooks/${encodeURIComponent(id)}`,
      params,
    )
  }

  /** Delete a webhook. In-flight deliveries are not retried. */
  async delete(id: string): Promise<void> {
    await this.http.del<{ message: string }>(
      `/webhooks/${encodeURIComponent(id)}`,
    )
  }

  /**
   * Manually fire a custom event payload at a webhook's current URL.
   * Returns the dispatch result (status, duration, deliveryId) and
   * records a row in the delivery log.
   */
  async test(
    id: string,
    params: WebhookTestParams,
  ): Promise<WebhookDispatchResult> {
    return this.http.post<WebhookDispatchResult>(
      `/webhooks/${encodeURIComponent(id)}/test`,
      params,
    )
  }

  /** Delivery-log scope for a single webhook id. */
  deliveries(webhookId: string): WebhookDeliveries {
    return new WebhookDeliveries(this.http, webhookId)
  }
}
