import type { ApiResponse } from "./types"

export class SentroyError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message || `Sentroy API error (${statusCode})`)
    this.name = "SentroyError"
  }
}

export class HttpClient {
  private baseUrl: string
  private token: string
  private timeout: number

  constructor(baseUrl: string, token: string, timeout = 30_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, "")
    this.token = token
    this.timeout = timeout
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const url = new URL(`${this.baseUrl}${path}`)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value))
        }
      }
    }
    return url.toString()
  }

  /**
   * Raw fetch — JSON parse etmez, Response döner. Binary endpoint'ler
   * (media download) için kullanılır. Authorization header eklenir.
   */
  async fetchRaw(
    path: string,
    init?: { method?: string; query?: Record<string, unknown> },
  ): Promise<Response> {
    const url = this.buildUrl(path, init?.query)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)
    try {
      return await fetch(url, {
        method: init?.method || "GET",
        headers: { Authorization: `Bearer ${this.token}` },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      query?: Record<string, unknown>
      body?: unknown
    },
  ): Promise<T> {
    const url = this.buildUrl(path, options?.query)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
      }
      if (options?.body) {
        headers["Content-Type"] = "application/json"
      }

      const res = await fetch(url, {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      })

      const json = (await res.json()) as ApiResponse<T>

      if (!res.ok) {
        throw new SentroyError(
          res.status,
          json,
          json.error || `Request failed with status ${res.status}`,
        )
      }

      return json.data
    } finally {
      clearTimeout(timer)
    }
  }

  async get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, { query })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body })
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, { body })
  }

  async del<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("DELETE", path, { query })
  }

  /**
   * Multipart upload. Body is a FormData; we deliberately do not set
   * Content-Type so the runtime (browser or Node undici) writes the
   * correct `multipart/form-data; boundary=...` header.
   */
  async postForm<T>(path: string, form: FormData): Promise<T> {
    const url = this.buildUrl(path)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}` },
        body: form,
        signal: controller.signal,
      })
      const json = (await res.json()) as { data: T; error?: string }
      if (!res.ok) {
        throw new SentroyError(
          res.status,
          json,
          json.error || `Upload failed with status ${res.status}`,
        )
      }
      return json.data
    } finally {
      clearTimeout(timer)
    }
  }
}
