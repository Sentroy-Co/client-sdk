import { HttpClient } from "./http"
import { Domains } from "./resources/domains"
import { Mailboxes } from "./resources/mailboxes"
import { Templates } from "./resources/templates"
import { Inbox } from "./resources/inbox"
import { Send } from "./resources/send"
import { Audience } from "./resources/audience"
import { Suppressions } from "./resources/suppressions"
import { Webhooks } from "./resources/webhooks"
import { Logs } from "./resources/logs"
import { Buckets } from "./resources/buckets"
import { MediaResource } from "./resources/media"
import { Storage } from "./resources/storage"
import type { SentroyClientConfig } from "./types"

export class Sentroy {
  public readonly domains: Domains
  public readonly mailboxes: Mailboxes
  public readonly templates: Templates
  public readonly inbox: Inbox
  public readonly send: Send
  public readonly audience: Audience
  public readonly suppressions: Suppressions
  public readonly webhooks: Webhooks
  public readonly logs: Logs
  public readonly buckets: Buckets
  public readonly media: MediaResource
  public readonly storage: Storage

  /**
   * Create a new Sentroy client.
   *
   * Single `baseUrl` covers every resource: the platform gateway routes
   * `/api/mail/companies/...` to the mail backend and
   * `/api/storage/companies/...` to the storage backend. The same
   * access token works across both.
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
   * const buckets = await sentroy.buckets.list()
   * ```
   */
  constructor(config: SentroyClientConfig) {
    const root = config.baseUrl.replace(/\/+$/, "")
    const slug = encodeURIComponent(config.companySlug)

    // Mail resources hit the `/api/mail/companies` gateway path — core
    // forwards to the mail subdomain. The SDK consumer never sees the
    // subdomain split.
    const mailHttp = new HttpClient(
      `${root}/api/mail/companies/${slug}`,
      config.accessToken,
      config.timeout,
    )

    // Storage uses the same pattern via `/api/storage/companies`.
    const storageHttp = new HttpClient(
      `${root}/api/storage/companies/${slug}`,
      config.accessToken,
      config.timeout,
    )

    this.domains = new Domains(mailHttp)
    this.mailboxes = new Mailboxes(mailHttp)
    this.templates = new Templates(mailHttp)
    this.inbox = new Inbox(mailHttp)
    this.send = new Send(mailHttp)
    this.audience = new Audience(mailHttp)
    this.suppressions = new Suppressions(mailHttp)
    this.webhooks = new Webhooks(mailHttp)
    this.logs = new Logs(mailHttp)
    this.buckets = new Buckets(storageHttp)
    this.media = new MediaResource(storageHttp)
    this.storage = new Storage(storageHttp)
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
  Bucket,
  CreateBucketParams,
  UpdateBucketParams,
  Media,
  MediaType,
  MediaThumbnail,
  MediaImageMeta,
  MediaListParams,
  MediaListResult,
  UploadMediaParams,
  StorageQuota,
  StorageUsage,
  StorageUsageBucket,
  StorageUsageByType,
  Contact,
  ContactStatus,
  ContactList,
  CreateContactParams,
  UpdateContactParams,
  ContactListParams,
  ContactListResult,
  CreateAudienceListParams,
  Suppression,
  AddSuppressionParams,
  SuppressionListParams,
  Webhook,
  WebhookEvent,
  CreateWebhookParams,
  UpdateWebhookParams,
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookDeliveryKind,
  WebhookDeliveryListParams,
  WebhookDeliveryListResult,
  WebhookTestParams,
  WebhookDispatchResult,
  MailLog,
  MailLogStatus,
  LogListParams,
} from "./types"

export { SentroyError } from "./http"

export {
  pickThumbnailUrl,
  pickPresetThumbnailUrl,
  THUMBNAIL_PRESETS,
  type ThumbnailPreset,
  type ThumbnailSourceMedia,
} from "./thumbnails"
