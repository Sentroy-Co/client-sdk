import type { HttpClient } from "../http"
import type {
  Bucket,
  CreateBucketParams,
  UpdateBucketParams,
} from "../types"

export class Buckets {
  constructor(private http: HttpClient) {}

  /** List all buckets in the company. */
  async list(): Promise<Bucket[]> {
    return this.http.get<Bucket[]>("/buckets")
  }

  /** Get a single bucket by its slug. */
  async get(slug: string): Promise<Bucket> {
    return this.http.get<Bucket>(`/buckets/${encodeURIComponent(slug)}`)
  }

  /** Create a new bucket. Slug is auto-derived from name if omitted. */
  async create(params: CreateBucketParams): Promise<Bucket> {
    return this.http.post<Bucket>("/buckets", params)
  }

  /**
   * Update a bucket's name, description, or visibility. Toggling
   * `isPublic` cascades to every existing file in the bucket (S3 ACL +
   * Media doc); this call can take a while for large buckets.
   */
  async update(slug: string, params: UpdateBucketParams): Promise<Bucket> {
    return this.http.patch<Bucket>(
      `/buckets/${encodeURIComponent(slug)}`,
      params,
    )
  }

  /**
   * Delete a bucket. Fails with 409 if the bucket has any files unless
   * `force: true` is passed — then every file is purged from storage
   * before the bucket is removed.
   */
  async delete(slug: string, opts?: { force?: boolean }): Promise<void> {
    const query = opts?.force ? { force: "true" } : undefined
    await this.http.del<{ deleted: boolean }>(
      `/buckets/${encodeURIComponent(slug)}`,
      query,
    )
  }
}
