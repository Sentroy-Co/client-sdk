import { HttpClient } from "../http"

// ── Types ────────────────────────────────────────────────────────────────────

export interface WhatsAppNumber {
  sessionId: string
  phoneNumber: string | null
  label: string | null
  status: string
  /** Convenience: `status === "connected"`. Only connected numbers can send. */
  connected: boolean
}

export interface WhatsAppTemplate {
  id: string
  name: string
  /** Message body with `{{variable}}` placeholders. */
  body: string
  /** Variable names extracted from the body (for validation/UI). */
  variables: string[]
  mediaUrl: string | null
  category: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateWhatsAppTemplateParams {
  name: string
  body: string
  mediaUrl?: string
  category?: string
}

export interface UpdateWhatsAppTemplateParams {
  name?: string
  body?: string
  mediaUrl?: string | null
  category?: string | null
}

export interface WhatsAppAudienceEntry {
  phone: string
  variables?: Record<string, string>
}

export interface WhatsAppAudience {
  id: string
  name: string
  description: string | null
  entries: WhatsAppAudienceEntry[]
  entryCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateWhatsAppAudienceParams {
  name: string
  description?: string
  /** Plain phone strings or `{ phone, variables }` for per-recipient values. */
  entries: Array<string | WhatsAppAudienceEntry>
}

export interface UpdateWhatsAppAudienceParams {
  name?: string
  description?: string | null
  entries?: Array<string | WhatsAppAudienceEntry>
}

export interface WhatsAppSendParams {
  /** Sender number — a connected number's `sessionId` or `phoneNumber`.
   *  Omit to use the company's only connected number. */
  from?: string
  /** Single recipient phone (E.164). Provide `to` OR `audienceId`. */
  to?: string
  /** Target a saved audience (bulk send). Provide `to` OR `audienceId`. */
  audienceId?: string
  /** Template to render. Provide `templateId` OR raw `body`. */
  templateId?: string
  /** Raw message body with `{{variables}}` (when not using a template). */
  body?: string
  /** Global variable values, merged under per-recipient audience variables. */
  variables?: Record<string, string>
}

export interface WhatsAppSendResult {
  total: number
  sent: number
  failed: number
  results: Array<{
    to: string
    status: "sent" | "failed"
    waMessageId?: string
    error?: string
  }>
}

export type WhatsAppSendStatus = "queued" | "sent" | "failed"

export interface WhatsAppLog {
  id: string
  sessionId: string
  to: string
  templateId: string | null
  audienceId: string | null
  status: WhatsAppSendStatus
  waMessageId: string | null
  error: string | null
  createdAt: string
}

export interface WhatsAppLogListParams {
  page?: number
  limit?: number
  status?: WhatsAppSendStatus
  sessionId?: string
  templateId?: string
}

export interface WhatsAppLogListResult {
  data: WhatsAppLog[]
  page: number
  limit: number
  total: number
}

// ── Sub-resources ────────────────────────────────────────────────────────────

class WhatsAppNumbers {
  constructor(private http: HttpClient) {}
  /** List the company's WhatsApp numbers (only `connected` ones can send). */
  async list(): Promise<WhatsAppNumber[]> {
    return this.http.get<WhatsAppNumber[]>("/numbers")
  }
}

class WhatsAppTemplates {
  constructor(private http: HttpClient) {}
  async list(): Promise<WhatsAppTemplate[]> {
    return this.http.get<WhatsAppTemplate[]>("/templates")
  }
  async get(id: string): Promise<WhatsAppTemplate> {
    return this.http.get<WhatsAppTemplate>(
      `/templates/${encodeURIComponent(id)}`,
    )
  }
  async create(
    params: CreateWhatsAppTemplateParams,
  ): Promise<WhatsAppTemplate> {
    return this.http.post<WhatsAppTemplate>("/templates", params)
  }
  async update(
    id: string,
    params: UpdateWhatsAppTemplateParams,
  ): Promise<WhatsAppTemplate> {
    return this.http.patch<WhatsAppTemplate>(
      `/templates/${encodeURIComponent(id)}`,
      params,
    )
  }
  async delete(id: string): Promise<void> {
    await this.http.del<{ deleted: boolean }>(
      `/templates/${encodeURIComponent(id)}`,
    )
  }
}

class WhatsAppAudiences {
  constructor(private http: HttpClient) {}
  async list(): Promise<WhatsAppAudience[]> {
    return this.http.get<WhatsAppAudience[]>("/audiences")
  }
  async get(id: string): Promise<WhatsAppAudience> {
    return this.http.get<WhatsAppAudience>(
      `/audiences/${encodeURIComponent(id)}`,
    )
  }
  async create(
    params: CreateWhatsAppAudienceParams,
  ): Promise<WhatsAppAudience> {
    return this.http.post<WhatsAppAudience>("/audiences", params)
  }
  async update(
    id: string,
    params: UpdateWhatsAppAudienceParams,
  ): Promise<WhatsAppAudience> {
    return this.http.patch<WhatsAppAudience>(
      `/audiences/${encodeURIComponent(id)}`,
      params,
    )
  }
  async delete(id: string): Promise<void> {
    await this.http.del<{ deleted: boolean }>(
      `/audiences/${encodeURIComponent(id)}`,
    )
  }
}

class WhatsAppLogs {
  constructor(private http: HttpClient) {}
  async list(params: WhatsAppLogListParams = {}): Promise<WhatsAppLogListResult> {
    const query: Record<string, unknown> = {}
    if (params.page) query.page = params.page
    if (params.limit) query.limit = params.limit
    if (params.status) query.status = params.status
    if (params.sessionId) query.sessionId = params.sessionId
    if (params.templateId) query.templateId = params.templateId
    return this.http.get<WhatsAppLogListResult>("/logs", query)
  }
}

// ── Root resource ────────────────────────────────────────────────────────────

/**
 * WhatsApp Santral — send template-based messages, manage templates & audiences,
 * list connected numbers, and read send logs. All via the shared `stk_` token.
 */
export class WhatsApp {
  public readonly numbers: WhatsAppNumbers
  public readonly templates: WhatsAppTemplates
  public readonly audiences: WhatsAppAudiences
  public readonly logs: WhatsAppLogs

  constructor(private http: HttpClient) {
    this.numbers = new WhatsAppNumbers(http)
    this.templates = new WhatsAppTemplates(http)
    this.audiences = new WhatsAppAudiences(http)
    this.logs = new WhatsAppLogs(http)
  }

  /**
   * Send a WhatsApp message to a single recipient (`to`) or a whole audience
   * (`audienceId`), rendering a template (`templateId`) or raw `body` with
   * `{{variables}}`. Returns a per-recipient result summary.
   */
  async send(params: WhatsAppSendParams): Promise<WhatsAppSendResult> {
    return this.http.post<WhatsAppSendResult>("/send", params)
  }
}
