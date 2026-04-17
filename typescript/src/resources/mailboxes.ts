import type { HttpClient } from "../http"
import type { MailboxUser } from "../types"

export class Mailboxes {
  constructor(private http: HttpClient) {}

  /** List all mailbox accounts for the company */
  async list(): Promise<MailboxUser[]> {
    return this.http.get<MailboxUser[]>("/mailboxes")
  }
}
