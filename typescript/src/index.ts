import { HttpClient } from "./http"
import { Domains } from "./resources/domains"
import { Mailboxes } from "./resources/mailboxes"
import { Templates } from "./resources/templates"
import { Inbox } from "./resources/inbox"
import { Send } from "./resources/send"
import type { SentroyClientConfig } from "./types"

export class Sentroy {
  public readonly domains: Domains
  public readonly mailboxes: Mailboxes
  public readonly templates: Templates
  public readonly inbox: Inbox
  public readonly send: Send

  /**
   * Create a new Sentroy client.
   *
   * @example
   * ```ts
   * const sentroy = new Sentroy({
   *   baseUrl: "https://sentroy.com",
   *   companySlug: "my-company",
   *   accessToken: "stk_abc123...",
   * })
   *
   * const domains = await sentroy.domains.list()
   * ```
   */
  constructor(config: SentroyClientConfig) {
    const base = config.baseUrl.replace(/\/+$/, "")
    const apiBase = `${base}/api/companies/${encodeURIComponent(config.companySlug)}`
    const http = new HttpClient(apiBase, config.accessToken, config.timeout)

    this.domains = new Domains(http)
    this.mailboxes = new Mailboxes(http)
    this.templates = new Templates(http)
    this.inbox = new Inbox(http)
    this.send = new Send(http)
  }
}

// Re-export types
export type {
  SentroyClientConfig,
  ApiResponse,
  Domain,
  MailboxUser,
  Template,
  LocalizedString,
  MessageAddress,
  MessageSummary,
  MessageDetail,
  AttachmentInfo,
  Mailbox,
  InboxListParams,
  Attachment,
  SendParams,
  SendResult,
} from "./types"

export { SentroyError } from "./http"
