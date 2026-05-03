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
  /**
   * Bearer access token. Tanımsızsa Authorization header eklenmez ve
   * `credentials: "include"` ile cookie auth kullanılır — bu mod Sentroy
   * site içinden (sentroy.com / mail.sentroy.com / storage.sentroy.com)
   * MediaManager gibi React component'leri kullanırken caller'ın access
   * token üretmesine gerek bırakmaz; mevcut session cookie'si yeter.
   */
  private token: string | undefined
  private timeout: number

  constructor(baseUrl: string, token: string | undefined, timeout = 30_000) {
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

  private authHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {}
  }

  /** Cookie modunda credentials include; bearer modunda omit. */
  private get fetchCredentials(): RequestCredentials {
    return this.token ? "omit" : "include"
  }

  /**
   * Raw fetch — JSON parse etmez, Response döner. Binary endpoint'ler
   * (media download) için kullanılır. Authorization header eklenir veya
   * cookie auth ile çalışılır.
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
        headers: this.authHeaders(),
        credentials: this.fetchCredentials,
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
      const headers: Record<string, string> = { ...this.authHeaders() }
      if (options?.body) {
        headers["Content-Type"] = "application/json"
      }

      const res = await fetch(url, {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        credentials: this.fetchCredentials,
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
   * DELETE with a JSON body. Most endpoints take an id in the path, but a
   * few collection-membership endpoints (audience list members) carry the
   * member id in the body so a single route can address both members of
   * the parent. Fetch + undici both allow DELETE bodies — keep separate
   * from `del` so the common case stays query-only.
   */
  async delWithBody<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("DELETE", path, { body })
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
        headers: this.authHeaders(),
        credentials: this.fetchCredentials,
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

  /**
   * XHR-tabanlı multipart upload — `fetch` progress event veremiyor, XHR
   * `upload.onprogress` ile bytes loaded/total event'i tetikler. Caller
   * `onProgress` ve `signal` (AbortController) verir.
   *
   * Cookie auth (`token` undefined) için `withCredentials = true`. Timeout
   * uygulanmaz (büyük dosyalar için 30sn'de patlayıp kaybolmasın); caller
   * istiyorsa `signal` ile kendi timeout'unu kurar.
   */
  async postFormWithProgress<T>(
    path: string,
    form: FormData,
    opts: {
      onProgress?: (loaded: number, total: number) => void
      signal?: AbortSignal
    } = {},
  ): Promise<T> {
    const url = this.buildUrl(path)
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("POST", url, true)
      if (this.token) {
        xhr.setRequestHeader("Authorization", `Bearer ${this.token}`)
      } else {
        xhr.withCredentials = true
      }

      if (opts.signal) {
        if (opts.signal.aborted) {
          reject(new SentroyError(0, null, "Upload aborted"))
          return
        }
        opts.signal.addEventListener(
          "abort",
          () => {
            try {
              xhr.abort()
            } catch {
              /* noop */
            }
            reject(new SentroyError(0, null, "Upload aborted"))
          },
          { once: true },
        )
      }

      if (opts.onProgress) {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            opts.onProgress!(e.loaded, e.total)
          }
        })
      }

      xhr.addEventListener("load", () => {
        let json: { data?: T; error?: string } = {}
        try {
          json = JSON.parse(xhr.responseText) as { data?: T; error?: string }
        } catch {
          /* fall through with empty object */
        }
        if (xhr.status >= 200 && xhr.status < 300 && json.data !== undefined) {
          resolve(json.data)
        } else {
          reject(
            new SentroyError(
              xhr.status,
              json,
              json.error || `Upload failed with status ${xhr.status}`,
            ),
          )
        }
      })

      xhr.addEventListener("error", () =>
        reject(new SentroyError(0, null, "Upload network error")),
      )
      xhr.addEventListener("timeout", () =>
        reject(new SentroyError(0, null, "Upload timed out")),
      )

      xhr.send(form)
    })
  }
}
