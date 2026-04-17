import type { HttpClient } from "../http"
import type {
  MessageSummary,
  MessageDetail,
  Mailbox,
  InboxListParams,
} from "../types"

export class Inbox {
  constructor(private http: HttpClient) {}

  /** List messages in a mailbox folder */
  async list(params?: InboxListParams): Promise<MessageSummary[]> {
    const query: Record<string, unknown> = {}
    if (params?.mailbox) query.mailbox = params.mailbox
    if (params?.folder) query.folder = params.folder
    if (params?.page) query.page = params.page
    if (params?.limit) query.limit = params.limit
    if (params?.unreadOnly) query.unreadOnly = "true"
    return this.http.get<MessageSummary[]>("/inbox", query)
  }

  /** Get a single message detail */
  async get(
    uid: number,
    options?: { mailbox?: string; folder?: string },
  ): Promise<MessageDetail> {
    const query: Record<string, unknown> = {}
    if (options?.mailbox) query.mailbox = options.mailbox
    if (options?.folder) query.folder = options.folder
    return this.http.get<MessageDetail>(`/inbox/${uid}`, query)
  }

  /** List IMAP folders (mailboxes) for a given email account */
  async listFolders(mailbox?: string): Promise<Mailbox[]> {
    const query: Record<string, unknown> = {}
    if (mailbox) query.mailbox = mailbox
    return this.http.get<Mailbox[]>("/inbox/mailboxes", query)
  }

  /** Get thread messages by subject */
  async getThread(
    subject: string,
    mailbox?: string,
  ): Promise<(MessageDetail & { folder: string })[]> {
    const query: Record<string, unknown> = { subject }
    if (mailbox) query.mailbox = mailbox
    return this.http.get<(MessageDetail & { folder: string })[]>(
      "/inbox/thread",
      query,
    )
  }

  /** Mark a message as read */
  async markAsRead(
    uid: number,
    options?: { mailbox?: string; folder?: string },
  ): Promise<void> {
    await this.http.post(`/inbox/${uid}/read`, {
      mailbox: options?.mailbox,
      folder: options?.folder,
    })
  }

  /** Mark a message as unread */
  async markAsUnread(
    uid: number,
    options?: { mailbox?: string; folder?: string },
  ): Promise<void> {
    await this.http.del(`/inbox/${uid}/read`, {
      mailbox: options?.mailbox,
      folder: options?.folder,
    })
  }

  /** Move a message to another folder */
  async move(
    uid: number,
    to: string,
    options?: { from?: string; mailbox?: string },
  ): Promise<void> {
    await this.http.post(`/inbox/${uid}/move`, {
      to,
      from: options?.from,
      mailbox: options?.mailbox,
    })
  }

  /** Delete a message */
  async delete(
    uid: number,
    options?: { mailbox?: string; folder?: string },
  ): Promise<void> {
    const query: Record<string, unknown> = {}
    if (options?.mailbox) query.mailbox = options.mailbox
    if (options?.folder) query.folder = options.folder
    await this.http.del(`/inbox/${uid}`, query)
  }
}
