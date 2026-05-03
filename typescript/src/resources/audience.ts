import type { HttpClient } from "../http"
import type {
  Contact,
  ContactList,
  ContactListParams,
  ContactListResult,
  CreateAudienceListParams,
  CreateContactParams,
  UpdateContactParams,
} from "../types"

class AudienceListMembers {
  constructor(
    private http: HttpClient,
    private listId: string,
  ) {}

  /** List all contacts in this audience list. */
  async list(): Promise<Contact[]> {
    return this.http.get<Contact[]>(
      `/audience/lists/${encodeURIComponent(this.listId)}/members`,
    )
  }

  /** Add a contact to the list by id. */
  async add(contactId: string): Promise<void> {
    await this.http.post<{ message: string }>(
      `/audience/lists/${encodeURIComponent(this.listId)}/members`,
      { contactId },
    )
  }

  /** Remove a contact from the list. The contact record itself is preserved. */
  async remove(contactId: string): Promise<void> {
    await this.http.delWithBody<{ message: string }>(
      `/audience/lists/${encodeURIComponent(this.listId)}/members`,
      { contactId },
    )
  }
}

class AudienceLists {
  constructor(private http: HttpClient) {}

  /** List every audience list in the company. */
  async list(): Promise<ContactList[]> {
    return this.http.get<ContactList[]>("/audience/lists")
  }

  /** Get a single audience list by id. */
  async get(id: string): Promise<ContactList> {
    return this.http.get<ContactList>(
      `/audience/lists/${encodeURIComponent(id)}`,
    )
  }

  /** Create a new audience list. */
  async create(params: CreateAudienceListParams): Promise<ContactList> {
    return this.http.post<ContactList>("/audience/lists", params)
  }

  /** Delete an audience list. Contacts stay in the company; only the grouping is removed. */
  async delete(id: string): Promise<void> {
    await this.http.del<{ message: string }>(
      `/audience/lists/${encodeURIComponent(id)}`,
    )
  }

  /** Membership operations scoped to a list id. */
  members(listId: string): AudienceListMembers {
    return new AudienceListMembers(this.http, listId)
  }
}

class AudienceContacts {
  constructor(private http: HttpClient) {}

  /**
   * Paginated list of contacts. Filter by status or tag set; tags are
   * sent as a comma-joined query param.
   */
  async list(params?: ContactListParams): Promise<ContactListResult> {
    const query: Record<string, unknown> = {}
    if (params?.page !== undefined) query.page = params.page
    if (params?.limit !== undefined) query.limit = params.limit
    if (params?.status) query.status = params.status
    if (params?.tags?.length) query.tags = params.tags.join(",")
    return this.http.get<ContactListResult>("/audience/contacts", query)
  }

  /**
   * Email-prefix autocomplete. Capped server-side at 10 results — use
   * `list` for paginated browsing.
   */
  async search(q: string): Promise<Contact[]> {
    return this.http.get<Contact[]>("/audience/contacts", { q })
  }

  /** Get a single contact by id. */
  async get(id: string): Promise<Contact> {
    return this.http.get<Contact>(
      `/audience/contacts/${encodeURIComponent(id)}`,
    )
  }

  /** Create a contact. Defaults to status: "active". */
  async create(params: CreateContactParams): Promise<Contact> {
    return this.http.post<Contact>("/audience/contacts", params)
  }

  /** Patch any contact field. Pass `status` to mark unsubscribed/bounced. */
  async update(id: string, params: UpdateContactParams): Promise<Contact> {
    return this.http.patch<Contact>(
      `/audience/contacts/${encodeURIComponent(id)}`,
      params,
    )
  }

  /**
   * Soft-delete: marks the contact as `unsubscribed`. The record stays so
   * historical mail-log foreign keys keep resolving and the email won't
   * accidentally be re-added.
   */
  async delete(id: string): Promise<void> {
    await this.http.del<{ message: string }>(
      `/audience/contacts/${encodeURIComponent(id)}`,
    )
  }
}

export class Audience {
  public readonly lists: AudienceLists
  public readonly contacts: AudienceContacts

  constructor(http: HttpClient) {
    this.lists = new AudienceLists(http)
    this.contacts = new AudienceContacts(http)
  }
}
