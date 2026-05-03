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
  /**
   * Access token (`stk_...`). Same token works for mail + storage.
   *
   * Optional: when omitted, the client uses **cookie auth**
   * (`credentials: "include"` on every fetch) — useful for browser code
   * running inside the Sentroy site itself, where the user's session
   * cookie is already valid against `sentroy.com`. End users never have
   * to paste an API key when the SDK is embedded in our own UI.
   */
  accessToken?: string
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
  /** Public bucket'larda direct CDN URL — server response'undan gelir
   *  (her zaman değil). Yoksa caller proxy/download endpoint'i kullanmalı. */
  url?: string
  /** Auth'lu download URL — short-lived signed link veya proxy. */
  downloadUrl?: string
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

// ── Storage quota / usage ─────────────────────────────────────────────────

/**
 * Plan-level storage quota for the company. Mail and storage share the
 * same byte pool; `used` reports storage's slice and `mailUsed` what mail
 * has occupied. `limit` of `0` means the plan is unlimited.
 */
export interface StorageQuota {
  used: number
  limit: number
  mailUsed: number
  planName?: string
}

/** Per-bucket usage row inside `StorageUsage.buckets`. */
export interface StorageUsageBucket {
  id: string
  name: string
  slug: string
  storageUsed: number
  fileCount: number
  isPublic: boolean
}

/** Per-type aggregation row inside `StorageUsage.byType`. */
export interface StorageUsageByType {
  type: MediaType
  count: number
  bytes: number
}

/**
 * Combined snapshot for a "Usage" dashboard: plan quota + every bucket
 * with its byte/file counts + a media-type breakdown across the company.
 */
export interface StorageUsage {
  quota: StorageQuota
  buckets: StorageUsageBucket[]
  byType: StorageUsageByType[]
}

// ── Audience / Contacts ───────────────────────────────────────────────────

export type ContactStatus = "active" | "unsubscribed" | "bounced"

export interface Contact {
  id: string
  companyId: string
  email: string
  name?: string
  tags: string[]
  status: ContactStatus
  metadata: Record<string, unknown>
  lastEmailedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface ContactList {
  id: string
  companyId: string
  name: string
  description?: string
  memberCount?: number
  createdAt: string
  updatedAt: string
}

export interface CreateContactParams {
  email: string
  name?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface UpdateContactParams {
  email?: string
  name?: string
  tags?: string[]
  status?: ContactStatus
  metadata?: Record<string, unknown>
}

export interface ContactListParams {
  page?: number
  limit?: number
  status?: ContactStatus
  /** Comma-joined when sent over the wire — pass an array, the SDK joins. */
  tags?: string[]
}

export interface ContactListResult {
  contacts: Contact[]
  total: number
  page: number
  limit: number
}

export interface CreateAudienceListParams {
  name: string
  description?: string
}

// ── Suppressions ──────────────────────────────────────────────────────────

export interface Suppression {
  id: string
  email: string
  reason: string
  domainId: string
  createdAt: string
  domain?: { domain: string }
}

export interface AddSuppressionParams {
  email: string
  /** Free-form label (e.g. "manual", "complaint"). Defaults backend-side. */
  reason?: string
  domainId: string
}

export interface SuppressionListParams {
  page?: number
  limit?: number
  domainId?: string
  reason?: string
}

// ── Webhooks ──────────────────────────────────────────────────────────────

export type WebhookEvent =
  | "sent"
  | "bounced"
  | "failed"
  | "opened"
  | "clicked"
  | "unsubscribed"

export interface Webhook {
  id: string
  url: string
  events: string[]
  active: boolean
  domainId: string
  /** Returned only on create — used to verify HMAC signatures of deliveries. */
  secret?: string
  createdAt: string
  updatedAt: string
}

export interface CreateWebhookParams {
  url: string
  events: WebhookEvent[] | string[]
  domainId: string
}

export interface UpdateWebhookParams {
  url?: string
  events?: WebhookEvent[] | string[]
  active?: boolean
}

// ── Logs ──────────────────────────────────────────────────────────────────

export type MailLogStatus =
  | "queued"
  | "processing"
  | "sent"
  | "bounced"
  | "failed"

export interface MailLog {
  id: string
  to: string
  from: string
  subject: string
  status: MailLogStatus
  messageId: string | null
  domainId: string
  domain?: { domain: string }
  templateId: string | null
  variables: Record<string, unknown> | null
  scheduledAt?: string | null
  sentAt: string | null
  bouncedAt: string | null
  openedAt?: string | null
  clickedAt?: string | null
  error: string | null
  createdAt: string
}

export interface LogListParams {
  page?: number
  limit?: number
  status?: MailLogStatus
  domainId?: string
  /** ISO timestamp lower bound (inclusive). */
  from?: string
  /** ISO timestamp upper bound (inclusive). */
  to?: string
}
