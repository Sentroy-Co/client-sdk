import type { HttpClient } from "../http"
import type {
  CreateWebhookParams,
  UpdateWebhookParams,
  Webhook,
} from "../types"

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
}
