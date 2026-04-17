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

  async del<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("DELETE", path, { query })
  }
}
