// ── Configuration ──────────────────────────────────────────────────────────

export interface SentroyClientConfig {
  /** Sentroy instance base URL (e.g. "https://sentroy.com") */
  baseUrl: string
  /** Company slug */
  companySlug: string
  /** Access token (stk_...) */
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
