import type { HttpClient } from "../http"
import type { LogListParams, MailLog } from "../types"

export class Logs {
  constructor(private http: HttpClient) {}

  /**
   * List mail-log entries. Filter by status, domain, and ISO timestamp
   * range (`from` / `to`). Results are paginated server-side; pass `page`
   * and `limit` to walk a large window.
   */
  async list(params?: LogListParams): Promise<MailLog[]> {
    const query: Record<string, unknown> = {}
    if (params?.page !== undefined) query.page = params.page
    if (params?.limit !== undefined) query.limit = params.limit
    if (params?.status) query.status = params.status
    if (params?.domainId) query.domainId = params.domainId
    if (params?.from) query.from = params.from
    if (params?.to) query.to = params.to
    return this.http.get<MailLog[]>("/logs", query)
  }

  /** Get a single mail-log entry by id. */
  async get(id: string): Promise<MailLog> {
    return this.http.get<MailLog>(`/logs/${encodeURIComponent(id)}`)
  }
}
