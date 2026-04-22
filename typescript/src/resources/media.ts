import type { HttpClient } from "../http"
import type {
  Media,
  MediaListParams,
  MediaListResult,
  UploadMediaParams,
} from "../types"

export class MediaResource {
  constructor(private http: HttpClient) {}

  /** List files in a bucket (paginated). */
  async list(
    bucketSlug: string,
    params?: MediaListParams,
  ): Promise<MediaListResult> {
    return this.http.get<MediaListResult>(
      `/buckets/${encodeURIComponent(bucketSlug)}/media`,
      params as Record<string, unknown> | undefined,
    )
  }

  /** Get a single media record. */
  async get(bucketSlug: string, mediaId: string): Promise<Media> {
    return this.http.get<Media>(
      `/buckets/${encodeURIComponent(bucketSlug)}/media/${encodeURIComponent(mediaId)}`,
    )
  }

  /**
   * Upload a file to a bucket. Works in Node and the browser: `body`
   * is a `Blob` or `File`. Returns the full serialized media record
   * (with `url`, `downloadUrl`, image thumbnails when applicable).
   *
   * @example Browser
   * ```ts
   * const file = input.files[0]
   * const media = await sentroy.media.upload("my-bucket", { body: file })
   * console.log(media.url)
   * ```
   *
   * @example Node 18+
   * ```ts
   * import { openAsBlob } from "node:fs"
   * const blob = await openAsBlob("./photo.jpg")
   * const media = await sentroy.media.upload("my-bucket", {
   *   body: blob,
   *   filename: "photo.jpg",
   * })
   * ```
   */
  async upload(
    bucketSlug: string,
    params: UploadMediaParams,
  ): Promise<Media> {
    const form = new FormData()
    const filename =
      params.filename ||
      (params.body as File & { name?: string }).name ||
      "upload.bin"
    form.append("file", params.body, filename)
    if (params.folder) form.append("folder", params.folder)
    if (params.isPublic !== undefined) {
      form.append("public", params.isPublic ? "true" : "false")
    }
    if (params.alt) form.append("alt", params.alt)
    if (params.caption) form.append("caption", params.caption)
    if (params.tags?.length) form.append("tags", params.tags.join(","))

    return this.http.postForm<Media>(
      `/buckets/${encodeURIComponent(bucketSlug)}/media`,
      form,
    )
  }

  /**
   * Delete a file. Cascades through the CDN: S3 objects (original +
   * thumbnails) are removed, then the Media record. If any S3 delete
   * fails the record is kept so you can retry.
   */
  async delete(bucketSlug: string, mediaId: string): Promise<void> {
    await this.http.del<{ deleted: boolean }>(
      `/buckets/${encodeURIComponent(bucketSlug)}/media/${encodeURIComponent(mediaId)}`,
    )
  }

  /**
   * Download a media file. For private buckets this is the only way to
   * fetch the bytes since the CDN public URL won't serve them; the
   * storage app proxies through after auth.
   *
   * Pass `quality` to request a pre-generated thumbnail variant (e.g.
   * `quality: 500` for 500px wide). Falls back to the original if the
   * variant doesn't exist for that file.
   */
  async download(
    bucketSlug: string,
    mediaId: string,
    opts?: { quality?: number | "original" },
  ): Promise<Blob> {
    const quality = opts?.quality
    const query =
      quality && quality !== "original"
        ? { quality: String(quality) }
        : undefined
    const res = await this.http.fetchRaw(
      `/buckets/${encodeURIComponent(bucketSlug)}/media/${encodeURIComponent(mediaId)}/download`,
      { query },
    )
    if (!res.ok) {
      throw new Error(`Download failed with status ${res.status}`)
    }
    return res.blob()
  }
}
