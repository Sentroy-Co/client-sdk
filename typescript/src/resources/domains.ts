import type { HttpClient } from "../http"
import type { Domain } from "../types"

export class Domains {
  constructor(private http: HttpClient) {}

  /** List all verified domains for the company */
  async list(): Promise<Domain[]> {
    return this.http.get<Domain[]>("/domains")
  }

  /** Get a single domain by ID */
  async get(id: string): Promise<Domain> {
    return this.http.get<Domain>(`/domains/${encodeURIComponent(id)}`)
  }
}
