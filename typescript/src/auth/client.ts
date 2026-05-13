import {
  type SentroyAuthUser,
  type SignupResponse,
  type LoginResponse,
  type AuthTokensResponse,
} from "./types"
import { AuthHttp, type AuthHttpOptions } from "./http"

/**
 * Browser-facing Sentroy Auth SDK — Firebase Auth tarzı session API.
 *
 * `apiKey` BROWSER'DA OLMAMALI; bu sınıf `apiKey`'i header'a koyacaktır.
 * RP backend gerçek api-key tutar; browser'da end-user kendi access/refresh
 * token'larıyla yaşar. Yine de DX için sınıf hem apiKey-less browser
 * akışına (signup/login backend proxy üzerinden) hem apiKey'li server
 * akışına (admin) tek tip API sunar — caller hangi mod'da olduğunu
 * `SentroyAuthAdmin` (admin SDK, sunucu) vs `SentroyAuth` (browser SDK,
 * apiKey-less) seçimiyle netleştirir.
 *
 * Storage: browser'da access + refresh `storage` adapter'a yazılır
 * (default `localStorage`). Refresh expire'a 5dk kala arka planda
 * yenilenir; fail olursa `onAuthStateChanged(null)` ve storage silinir.
 *
 * **Server-side rendering**: `typeof window === "undefined"` korumalı —
 * Node ortamında `localStorage` yok, default `memory` storage'a düşer.
 */

export type AuthStateChangeListener = (user: SentroyAuthUser | null) => void

export interface AuthStorageAdapter {
  read(): { accessToken: string; refreshToken: string; user: SentroyAuthUser } | null
  write(value: {
    accessToken: string
    refreshToken: string
    user: SentroyAuthUser
  }): void
  clear(): void
}

const STORAGE_KEY_PREFIX = "sentroy.auth"

/**
 * Base64URL → UTF-8 decode. Browser'da `atob` + manuel UTF-8 reconstruction;
 * Node'da `Buffer.from(..., "base64url")`. Tek kod yolu, runtime detect.
 */
function decodeBase64Url(s: string): string {
  // Pad + standard base64
  const padded = s.replace(/-/g, "+").replace(/_/g, "/")
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
  if (typeof atob === "function") {
    const binary = atob(padded + pad)
    // UTF-8 reconstruction (JWT claims yabancı karakter içerebilir)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  }
  // Node fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B = (globalThis as any).Buffer
  if (B) return B.from(padded + pad, "base64").toString("utf8")
  throw new Error("No base64 decoder available")
}

function localStorageAdapter(projectSlug: string): AuthStorageAdapter {
  if (typeof window === "undefined" || !window.localStorage) {
    return memoryStorageAdapter()
  }
  const key = `${STORAGE_KEY_PREFIX}.${projectSlug}`
  return {
    read() {
      try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return null
        return JSON.parse(raw) as {
          accessToken: string
          refreshToken: string
          user: SentroyAuthUser
        }
      } catch {
        return null
      }
    },
    write(value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // QuotaExceeded, etc — degrade to memory silently.
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // ignore
      }
    },
  }
}

function memoryStorageAdapter(): AuthStorageAdapter {
  let store: {
    accessToken: string
    refreshToken: string
    user: SentroyAuthUser
  } | null = null
  return {
    read: () => store,
    write: (value) => {
      store = value
    },
    clear: () => {
      store = null
    },
  }
}

export interface SentroyAuthOptions extends AuthHttpOptions {
  /** Token persistence stratejisi. Default `"localStorage"` browser'da,
   *  Node'da otomatik `"memory"`. Custom için adapter geçilebilir. */
  storage?: "localStorage" | "memory" | AuthStorageAdapter
  /** Background refresh tetikleme süresi (saniye, expiresIn altında).
   *  Default 300 (5dk). */
  refreshSkew?: number
}

export class SentroyAuth {
  private readonly http: AuthHttp
  private readonly storage: AuthStorageAdapter
  private readonly listeners = new Set<AuthStateChangeListener>()
  private readonly refreshSkew: number
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private currentUser: SentroyAuthUser | null = null

  constructor(opts: SentroyAuthOptions) {
    this.http = new AuthHttp(opts)
    this.refreshSkew = opts.refreshSkew ?? 300

    if (opts.storage === "memory") {
      this.storage = memoryStorageAdapter()
    } else if (
      opts.storage &&
      typeof opts.storage === "object" &&
      "read" in opts.storage
    ) {
      this.storage = opts.storage
    } else {
      this.storage = localStorageAdapter(opts.projectSlug)
    }

    // Restore from storage on construct — `onAuthStateChanged` listener'ları
    // henüz yok; ilk subscribe sırasında dispatch edilir.
    const restored = this.storage.read()
    if (restored) {
      this.currentUser = restored.user
      this.scheduleRefresh(this.estimateExpiry(restored.accessToken))
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  get user(): SentroyAuthUser | null {
    return this.currentUser
  }

  get accessToken(): string | null {
    return this.storage.read()?.accessToken ?? null
  }

  async signUp(input: {
    email: string
    password: string
    displayName?: string
    metadata?: Record<string, unknown>
  }): Promise<SignupResponse> {
    const res = await this.http.request<SignupResponse>("/signup", {
      method: "POST",
      json: input,
    })
    if (res.accessToken && res.refreshToken) {
      this.persist({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        user: res.user,
      })
    }
    return res
  }

  async signIn(input: {
    email: string
    password: string
  }): Promise<LoginResponse> {
    const res = await this.http.request<LoginResponse>("/login", {
      method: "POST",
      json: input,
    })
    this.persist({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      user: res.user,
    })
    return res
  }

  async signOut(): Promise<void> {
    const restored = this.storage.read()
    if (restored?.refreshToken) {
      // Best-effort revoke — fail'ı sessizce yut (network problem
      // sign-out'u bloklamasın).
      await this.http
        .request("/logout", {
          method: "POST",
          json: { refreshToken: restored.refreshToken },
        })
        .catch(() => {})
    }
    this.clearSession()
  }

  async sendPasswordReset(email: string): Promise<void> {
    await this.http.request("/password-reset/request", {
      method: "POST",
      json: { email },
    })
  }

  async verifyEmail(token: string): Promise<SentroyAuthUser> {
    const res = await this.http.request<{ user: SentroyAuthUser }>(
      "/verify-email",
      { method: "POST", json: { token } },
    )
    if (this.currentUser && this.currentUser.id === res.user.id) {
      const restored = this.storage.read()
      if (restored) {
        this.persist({ ...restored, user: res.user })
      } else {
        this.currentUser = res.user
        this.notify()
      }
    }
    return res.user
  }

  /**
   * Subscription pattern — Firebase Auth uyumlu. Caller'ın hemen mevcut
   * state'i alabilmesi için constructor'da restore edilen user
   * subscribe sırasında bir kez dispatch edilir.
   */
  onAuthStateChanged(listener: AuthStateChangeListener): () => void {
    this.listeners.add(listener)
    // Microtask gibi async dispatch — caller's `useEffect` cleanup race
    // problemlerini önler.
    Promise.resolve().then(() => listener(this.currentUser))
    return () => {
      this.listeners.delete(listener)
    }
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private persist(value: {
    accessToken: string
    refreshToken: string
    user: SentroyAuthUser
  }): void {
    this.storage.write(value)
    this.currentUser = value.user
    this.notify()
    this.scheduleRefresh(this.estimateExpiry(value.accessToken))
  }

  private clearSession(): void {
    this.storage.clear()
    this.currentUser = null
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
    this.notify()
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l(this.currentUser)
      } catch {
        // Listener hatası diğer subscriber'ları engellemesin.
      }
    }
  }

  /**
   * JWT'nin `exp` claim'inden expiry'i tahmin et. Parsing fail ise
   * 1 saat varsay (default access TTL). Refresh window: exp - skew.
   *
   * **Browser-safe**: `Buffer` Node'a özel, tarayıcıda yok. `atob`
   * + URL-safe charset normalization ile decode ediyoruz.
   */
  private estimateExpiry(accessToken: string): number {
    try {
      const [, payloadB64] = accessToken.split(".")
      const payload = JSON.parse(decodeBase64Url(payloadB64)) as {
        exp?: number
      }
      if (typeof payload.exp === "number") {
        return payload.exp * 1000
      }
    } catch {
      // ignore — fall through to default
    }
    return Date.now() + 60 * 60 * 1000
  }

  private scheduleRefresh(expiryMs: number): void {
    if (typeof window === "undefined") return // SSR'da auto-refresh yok
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    const fireAt = expiryMs - this.refreshSkew * 1000
    const delay = Math.max(fireAt - Date.now(), 5_000)
    this.refreshTimer = setTimeout(() => {
      this.refresh().catch(() => {
        // Refresh fail → session cleared, listener'lar null user görür
        this.clearSession()
      })
    }, delay)
  }

  private async refresh(): Promise<void> {
    const restored = this.storage.read()
    if (!restored?.refreshToken) {
      this.clearSession()
      return
    }
    const res = await this.http.request<AuthTokensResponse>("/refresh", {
      method: "POST",
      json: { refreshToken: restored.refreshToken },
    })
    this.storage.write({
      ...restored,
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
    })
    this.scheduleRefresh(this.estimateExpiry(res.accessToken))
  }
}
