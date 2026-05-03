import type { HttpClient } from "../http"
import type {
  AddSuppressionParams,
  Suppression,
  SuppressionListParams,
} from "../types"

export class Suppressions {
  constructor(private http: HttpClient) {}

  /**
   * List suppressions across the company (or a single domain). Suppressed
   * recipients are skipped at send time — every entry here is one address
   * that will not receive mail until removed.
   */
  async list(params?: SuppressionListParams): Promise<Suppression[]> {
    const query: Record<string, unknown> = {}
    if (params?.page !== undefined) query.page = params.page
    if (params?.limit !== undefined) query.limit = params.limit
    if (params?.domainId) query.domainId = params.domainId
    if (params?.reason) query.reason = params.reason
    return this.http.get<Suppression[]>("/suppressions", query)
  }

  /**
   * Manually suppress an address (e.g. honoring an off-platform opt-out).
   * Bounces and complaints are added automatically by the mail server.
   */
  async add(params: AddSuppressionParams): Promise<Suppression> {
    return this.http.post<Suppression>("/suppressions", params)
  }

  /** Remove a suppression — the address will be eligible to receive mail again. */
  async remove(id: string): Promise<void> {
    await this.http.del<{ message: string }>(
      `/suppressions/${encodeURIComponent(id)}`,
    )
  }
}
