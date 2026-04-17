import type { HttpClient } from "../http"
import type { Template } from "../types"

export class Templates {
  constructor(private http: HttpClient) {}

  /** List all templates */
  async list(): Promise<Template[]> {
    return this.http.get<Template[]>("/templates")
  }

  /** Get a single template by ID */
  async get(id: string): Promise<Template> {
    return this.http.get<Template>(`/templates/${encodeURIComponent(id)}`)
  }
}
