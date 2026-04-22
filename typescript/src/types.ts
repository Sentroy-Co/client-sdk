// ── Configuration ──────────────────────────────────────────────────────────

export interface SentroyClientConfig {
  /**
   * Platform root URL, e.g. "https://sentroy.com". Every resource —
   * mail (domains, mailboxes, templates, inbox, send) and storage
   * (buckets, media) — is reached through this single origin. The
   * platform gateway transparently forwards mail requests to the mail
   * subdomain and storage requests to the storage subdomain; consumers
   * never see the split.
   */
  baseUrl: string
  /** Company slug */
  companySlug: string
  /** Access token (stk_...). Same token works for mail + storage. */
  accessToken: string
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
}

// ── API response ───────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  error?: string
}

// ── Domains ────────────────────────────────────────────────────────────────

export interface Domain {
  id: string
  domain: string
  status: "pending" | "verifying" | "active" | "failed"
  spfVerified: boolean
  dkimVerified: boolean
  dmarcVerified: boolean
  createdAt: string
  updatedAt: string
}

// ── Mailboxes ──────────────────────────────────────────────────────────────

export interface MailboxUser {
  email: string
  domain: string
  username: string
}

// ── Templates ──────────────────────────────────────────────────────────────

export type LocalizedString = string | Record<string, string>

export interface Template {
  id: string
  name: LocalizedString
  subject: LocalizedString
  mjmlBody: LocalizedString
  htmlBody?: LocalizedString
  variables?: string[]
  domainId?: string
  domainName?: string
  createdAt: string
  updatedAt: string
}

// ── Inbox ──────────────────────────────────────────────────────────────────

export interface MessageAddress {
  name: string
  address: string
}

export interface MessageSummary {
  uid: number
  subject: string
  from: MessageAddress
  to: MessageAddress[]
  date: string
  seen: boolean
  flagged: boolean
  size: number
  hasAttachments: boolean
  preview: string
  messageId: string | null
  inReplyTo: string | null
  category: string
}

export interface MessageDetail {
  uid: number
  subject: string
  from: MessageAddress
  to: MessageAddress[]
  cc: MessageAddress[]
  replyTo: MessageAddress | null
  date: string
  seen: boolean
  flagged: boolean
  textBody: string | null
  htmlBody: string | null
  attachments: AttachmentInfo[]
  headers: Record<string, string>
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  folder?: string
}

export interface AttachmentInfo {
  partId: string
  filename: string
  size: number
  contentType: string
  contentId: string | null
}

export interface Mailbox {
  name: string
  path: string
  specialUse: string | null
  totalMessages: number
  unreadMessages: number
}

export interface InboxListParams {
  mailbox?: string
  folder?: string
  page?: number
  limit?: number
  unreadOnly?: boolean
}

// ── Send ───────────────────────────────────────────────────────────────────

export interface Attachment {
  filename: string
  content: string
  contentType?: string
}

export interface SendParams {
  to: string | string[]
  from: string
  subject: string
  domainId: string
  cc?: string | string[]
  templateId?: string
  /** Template language code (e.g. "en", "tr"). Falls back to default if omitted. */
  lang?: string
  html?: string
  text?: string
  variables?: Record<string, string>
  replyTo?: string
  attachments?: Attachment[]
  scheduledAt?: string
  headers?: Record<string, string>
  inReplyTo?: string
  references?: string[]
}

export interface SendResult {
  jobId: string
  mailLogId: string
  status: string
  scheduledAt?: string
}

// ── Storage / Buckets ──────────────────────────────────────────────────────

export interface Bucket {
  id: string
  companyId: string
  name: string
  slug: string
  description?: string
  isPublic: boolean
  storageUsed: number
  fileCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateBucketParams {
  name: string
  /** URL-safe slug. Auto-derived from name if omitted. */
  slug?: string
  description?: string
  /** Public buckets serve files without auth; private requires proxy. */
  isPublic?: boolean
}

export interface UpdateBucketParams {
  name?: string
  description?: string
  /** Toggling cascades to every file's S3 ACL + Media doc. */
  isPublic?: boolean
}

// ── Storage / Media ────────────────────────────────────────────────────────

export type MediaType = "image" | "video" | "audio" | "document" | "other"

export interface MediaThumbnail {
  width: number
  height: number
  fileName: string
  size: number
}

export interface MediaImageMeta {
  width: number
  height: number
  orientation: "landscape" | "portrait" | "square"
  thumbnails: MediaThumbnail[]
}

export interface Media {
  id: string
  bucketId: string
  companyId: string
  fileName: string
  originalName: string
  type: MediaType
  size: number
  mimeType: string
  folder: string
  uploadedBy: string
  tags: string[]
  alt?: string
  caption?: string
  isPublic: boolean
  imageMeta?: MediaImageMeta
  createdAt: string
  updatedAt: string
}

export interface MediaListResult {
  items: Media[]
  total: number
  limit: number
  skip: number
}

export interface MediaListParams {
  type?: MediaType
  folder?: string
  limit?: number
  skip?: number
}

/**
 * Upload input. Works in both Node and the browser:
 *   - Node: pass a `Blob` via `new Blob([buffer])` or `File` polyfill.
 *   - Browser: pass a `File` (from input) or `Blob` directly.
 *
 * `filename` is required when `body` is a raw `Blob` without a `.name`;
 * otherwise the client reads `body.name` (File) or defaults to
 * `"upload.bin"`.
 */
export interface UploadMediaParams {
  body: Blob
  filename?: string
  /** Folder name inside the bucket (default "uploads"). */
  folder?: string
  /** Sets media.isPublic; bucket must itself be public for this to take. */
  isPublic?: boolean
  alt?: string
  caption?: string
  tags?: string[]
}
