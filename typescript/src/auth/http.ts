import { SentroyAuthError } from "./types"

/**
 * Auth-as-a-Service shared HTTP layer. Project's signup/login/refresh
 * endpoints'iyle aynı format (JSON request + JSON response, 401/403/4xx
 * tek-tip `{error, error_description}` shape).
 *
 * `apiKey` opsiyonel — browser SDK end-user akışında apiKey-less
 * (server-only güvenlik), admin SDK her zaman set'li.
 */

const DEFAULT_AUTH_BASE_URL = "https://auth.sentroy.com"

export interface AuthHttpOptions {
  authBaseUrl?: string
  projectSlug: string
  apiKey?: string
  /** Hata-fırlatma yerine raw response döndür — caller fine-grained handling. */
  rawErrors?: boolean
}

export class AuthHttp {
  readonly baseUrl: string
  readonly projectSlug: string
  readonly apiKey?: string

  constructor(opts: AuthHttpOptions) {
    this.baseUrl = (opts.authBaseUrl || DEFAULT_AUTH_BASE_URL).replace(
      /\/+$/,
      "",
    )
    this.projectSlug = opts.projectSlug
    this.apiKey = opts.apiKey
  }

  url(path: string): string {
    const p = path.startsWith("/") ? path : `/${path}`
    return `${this.baseUrl}/api/v1/auth/${this.projectSlug}${p}`
  }

  async request<T>(
    path: string,
    init: RequestInit & {
      json?: unknown
      bearer?: string
    } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set("Accept", "application/json")
    if (init.json !== undefined) {
      headers.set("Content-Type", "application/json")
    }
    // Auth precedence: explicit `bearer` (user access token) > project `apiKey`.
    // Caller chooses the one that fits the endpoint.
    if (init.bearer) {
      headers.set("Authorization", `Bearer ${init.bearer}`)
    } else if (this.apiKey) {
      headers.set("Authorization", `Bearer ${this.apiKey}`)
    }

    const res = await fetch(this.url(path), {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    })

    let payload: unknown = null
    const ct = res.headers.get("content-type") ?? ""
    if (ct.includes("application/json")) {
      try {
        payload = await res.json()
      } catch {
        payload = null
      }
    }

    if (!res.ok) {
      const err =
        payload && typeof payload === "object"
          ? (payload as { error?: string; error_description?: string })
          : {}
      throw new SentroyAuthError(
        err.error ?? "http_error",
        err.error_description ?? `HTTP ${res.status}`,
        res.status,
      )
    }

    // Sentroy admin endpoints wrap in `{data}`; public endpoints sometimes
    // too. SDK auto-unwraps when present so callers don't keep .data on
    // every call.
    if (
      payload &&
      typeof payload === "object" &&
      "data" in (payload as Record<string, unknown>)
    ) {
      return (payload as { data: T }).data
    }
    return payload as T
  }
}
