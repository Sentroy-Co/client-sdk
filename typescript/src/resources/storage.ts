import type { HttpClient } from "../http"
import type { StorageQuota, StorageUsage } from "../types"

/**
 * Storage observability — read-only quota + breakdown endpoints. Bucket
 * and media CRUD lives on `client.buckets` / `client.media`.
 */
export class Storage {
  constructor(private http: HttpClient) {}

  /**
   * Plan storage quota for the company. `used` reflects bucket totals,
   * `mailUsed` what the mail product has stored under the same plan
   * pool, and `limit: 0` means unlimited.
   */
  async quota(): Promise<StorageQuota> {
    return this.http.get<StorageQuota>("/storage-quota")
  }

  /**
   * Combined dashboard payload — plan quota + per-bucket byte/file
   * counts + per-type aggregation across the company. Single round-trip
   * intended for usage UIs.
   */
  async usage(): Promise<StorageUsage> {
    return this.http.get<StorageUsage>("/usage")
  }
}
