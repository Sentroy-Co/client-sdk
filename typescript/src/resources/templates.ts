import type { HttpClient } from "../http"
import type {
  Template,
  CreateTemplateParams,
  UpdateTemplateParams,
  TemplateListParams,
} from "../types"

export class Templates {
  constructor(private http: HttpClient) {}

  /** List all templates, optionally filtered by sending domain. */
  async list(params: TemplateListParams = {}): Promise<Template[]> {
    return this.http.get<Template[]>("/templates", {
      ...(params.domainId ? { domainId: params.domainId } : {}),
    })
  }

  /** Get a single template by ID */
  async get(id: string): Promise<Template> {
    return this.http.get<Template>(`/templates/${encodeURIComponent(id)}`)
  }

  /**
   * Create an email template. Requires `templates.manage` permission.
   *
   * `name` / `subject` / `mjmlBody` may be a flat string or a `{ tr, en }`
   * map. The platform extracts the variable list from the body and returns
   * it on the created template (`variables`).
   */
  async create(params: CreateTemplateParams): Promise<Template> {
    return this.http.post<Template>("/templates", params)
  }

  /** Update an existing template (partial). Requires `templates.manage`. */
  async update(id: string, params: UpdateTemplateParams): Promise<Template> {
    return this.http.patch<Template>(
      `/templates/${encodeURIComponent(id)}`,
      params,
    )
  }

  /** Delete a template by ID. Requires `templates.manage`. */
  async delete(id: string): Promise<void> {
    await this.http.del<{ message: string }>(
      `/templates/${encodeURIComponent(id)}`,
    )
  }
}
