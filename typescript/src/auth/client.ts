import {
  type SentroyAuthUser,
  type SignupResponse,
  type LoginResponse,
  type AuthTokensResponse,
  type LoginOutcome,
  type SessionSummary,
  type ActivityEntry,
  type MfaStatus,
  type MfaEnrollResponse,
  type MfaVerifyEnrollmentResponse,
  type PasskeySummary,
  type SocialProvider,
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

/**
 * Optional `@simplewebauthn/browser` import — RP webauthn flow kullanmak
 * isterse kendi devDependencies'ine ekler; lazy import ile bundle'a
 * sızmaz.
 */
async function loadSimpleWebAuthnBrowser(): Promise<{
  startRegistration: (opts: {
    optionsJSON: Record<string, unknown>
  }) => Promise<unknown>
  startAuthentication: (opts: {
    optionsJSON: Record<string, unknown>
  }) => Promise<unknown>
}> {
  try {
    // String-concat hides the specifier from TS resolver — `@simplewebauthn/browser`
    // is an optional peer; SDK ships without it bundled. RP'nin npm install'unda
    // varsa runtime'da çözülür, yoksa catch'e düşüp kullanıcıya net hata verir.
    const specifier = "@simplewebauthn/" + "browser"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import(/* @vite-ignore */ specifier)
    return {
      startRegistration: mod.startRegistration,
      startAuthentication: mod.startAuthentication,
    }
  } catch {
    throw new Error(
      "Passkey support requires `@simplewebauthn/browser` — install it as a peer dependency.",
    )
  }
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

  /**
   * Sign in with email/password. MFA enrolled user'lar için response
   * discriminated union: `kind: "mfa"` → caller `verifyMfa()` çağırır.
   * `kind: "tokens"` → session kuruldu.
   */
  async signIn(input: {
    email: string
    password: string
    rememberMe?: boolean
  }): Promise<LoginOutcome> {
    const res = await this.http.request<
      LoginResponse | { mfaRequired: true; mfaToken: string; factorType: "totp" }
    >("/login", { method: "POST", json: input })
    if ("mfaRequired" in res && res.mfaRequired) {
      return { kind: "mfa", data: res }
    }
    const tokens = res as LoginResponse
    this.persist({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
    })
    return { kind: "tokens", data: tokens }
  }

  /**
   * MFA verify — `signIn` ile `kind: "mfa"` döndüyse, kullanıcıdan code
   * (veya recovery code) alıp bu method'u çağır. Başarılıysa session
   * kurulur ve login tamamlanır.
   */
  async verifyMfa(input: {
    mfaToken: string
    code?: string
    recoveryCode?: string
  }): Promise<LoginResponse> {
    const res = await this.http.request<LoginResponse>(
      "/login/mfa/verify",
      { method: "POST", json: input },
    )
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

  /**
   * Reset password using token from email. `newPassword` policy +
   * HaveIBeenPwned breach check yapılır.
   */
  async confirmPasswordReset(input: {
    token: string
    newPassword: string
  }): Promise<SentroyAuthUser> {
    const res = await this.http.request<{ user: SentroyAuthUser }>(
      "/password-reset/confirm",
      { method: "POST", json: input },
    )
    return res.user
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

  // ─── Magic link ──────────────────────────────────────────────────────────

  /**
   * Email magic-link request. Project'in `magicLinkEnabled` true
   * olması gerekir. Uniform 200 response — email yoksa da hata vermez.
   */
  async sendMagicLink(input: { email: string; redirectUri?: string }): Promise<void> {
    await this.http.request("/magic-link/request", {
      method: "POST",
      json: input,
    })
  }

  /**
   * Magic link mail'inden gelen token ile login. Session kurulur.
   */
  async consumeMagicLink(token: string): Promise<LoginResponse> {
    const res = await this.http.request<LoginResponse & { redirectUri?: string | null }>(
      "/magic-link/consume",
      { method: "POST", json: { token } },
    )
    this.persist({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      user: res.user,
    })
    return res
  }

  // ─── Invitation ──────────────────────────────────────────────────────────

  /**
   * Accept admin invitation. Token mail'den gelir, kullanıcı password
   * + optional displayName girer; hesap create + session kurulur.
   */
  async acceptInvitation(input: {
    token: string
    password: string
    displayName?: string
  }): Promise<LoginResponse> {
    const res = await this.http.request<LoginResponse>(
      "/invitation/accept",
      { method: "POST", json: input },
    )
    this.persist({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      user: res.user,
    })
    return res
  }

  // ─── Social federation ───────────────────────────────────────────────────

  /**
   * Provider authorize URL üret. `window.location.assign(url)` ile
   * RP'nin sayfasından redirect — callback'te Sentroy session kurulur,
   * redirectUri fragment'ında token'lar döner.
   */
  socialAuthorizeUrl(
    provider: SocialProvider,
    opts: { redirectUri?: string; rememberMe?: boolean } = {},
  ): string {
    const params = new URLSearchParams()
    if (opts.redirectUri) params.set("redirectUri", opts.redirectUri)
    if (opts.rememberMe) params.set("rememberMe", "1")
    const qs = params.toString()
    return `${this.http.baseUrl}/api/v1/auth/${this.http.projectSlug}/social/${provider}/authorize${qs ? `?${qs}` : ""}`
  }

  /**
   * `window.location.hash`tan social login redirect sonrası gelen
   * `#access_token=...&refresh_token=...&token_type=Bearer` parse +
   * session kur. RP sayfasına redirectUri varsayılan akış kullanıldıysa
   * çağırın. Başarılıysa user döner, fail'da null.
   */
  async consumeRedirectFragment(): Promise<SentroyAuthUser | null> {
    if (typeof window === "undefined") return null
    const hash = window.location.hash.replace(/^#/, "")
    if (!hash) return null
    const params = new URLSearchParams(hash)
    const accessToken = params.get("access_token")
    const refreshToken = params.get("refresh_token")
    if (!accessToken || !refreshToken) return null
    // Fragment'ı URL'den temizle (history clean)
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    )
    const user = await this.fetchMe(accessToken)
    if (!user) return null
    this.persist({ accessToken, refreshToken, user })
    return user
  }

  // ─── /me (current user info) ─────────────────────────────────────────────

  async getCurrentUser(): Promise<SentroyAuthUser | null> {
    const restored = this.storage.read()
    if (!restored) return null
    const user = await this.fetchMe(restored.accessToken)
    if (user) {
      this.persist({ ...restored, user })
    }
    return user
  }

  private async fetchMe(accessToken: string): Promise<SentroyAuthUser | null> {
    try {
      return await this.http.request<SentroyAuthUser>("/me", {
        method: "GET",
        bearer: accessToken,
      })
    } catch {
      return null
    }
  }

  // ─── /me/sessions ────────────────────────────────────────────────────────

  async listSessions(): Promise<SessionSummary[]> {
    return this.http.request<SessionSummary[]>("/me/sessions", {
      method: "GET",
      bearer: this.requireToken(),
    })
  }

  async revokeSession(id: string): Promise<void> {
    await this.http.request(`/me/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      bearer: this.requireToken(),
    })
  }

  // ─── /me/password ────────────────────────────────────────────────────────

  /**
   * Change password. Backend tüm session'ları revoke eder; SDK local
   * session'ı temizler — caller `signIn` ile tekrar oturum açar.
   */
  async changePassword(input: {
    currentPassword: string
    newPassword: string
  }): Promise<void> {
    await this.http.request("/me/password", {
      method: "POST",
      json: input,
      bearer: this.requireToken(),
    })
    this.clearSession()
  }

  // ─── /me/email/change ────────────────────────────────────────────────────

  /**
   * Request email change — confirmation mail yeni adrese gönderilir.
   * Kullanıcı `confirmEmailChange(token)` ile finalize eder.
   */
  async requestEmailChange(input: {
    newEmail: string
    currentPassword: string
  }): Promise<void> {
    await this.http.request("/me/email/change-request", {
      method: "POST",
      json: input,
      bearer: this.requireToken(),
    })
  }

  /** Token-based confirm (mail link'inden gelir). */
  async confirmEmailChange(token: string): Promise<SentroyAuthUser> {
    const user = await this.http.request<SentroyAuthUser>(
      "/me/email/change-confirm",
      { method: "POST", json: { token } },
    )
    // Email changed — tüm sessions revoke edildi, local clear
    this.clearSession()
    return user
  }

  // ─── /me/account (delete) ────────────────────────────────────────────────

  async requestAccountDeletion(currentPassword: string): Promise<void> {
    await this.http.request("/me/account/delete-request", {
      method: "POST",
      json: { currentPassword },
      bearer: this.requireToken(),
    })
  }

  async confirmAccountDeletion(token: string): Promise<void> {
    await this.http.request("/me/account/delete-confirm", {
      method: "POST",
      json: { token },
    })
    this.clearSession()
  }

  // ─── /me/activity ────────────────────────────────────────────────────────

  async getActivity(): Promise<ActivityEntry[]> {
    return this.http.request<ActivityEntry[]>("/me/activity", {
      method: "GET",
      bearer: this.requireToken(),
    })
  }

  // ─── /me/mfa ─────────────────────────────────────────────────────────────

  readonly mfa = {
    getStatus: async (): Promise<MfaStatus> =>
      this.http.request<MfaStatus>("/me/mfa", {
        method: "GET",
        bearer: this.requireToken(),
      }),
    enrollTotp: async (): Promise<MfaEnrollResponse> =>
      this.http.request<MfaEnrollResponse>("/me/mfa/totp/enroll", {
        method: "POST",
        bearer: this.requireToken(),
      }),
    verifyTotpEnrollment: async (
      code: string,
    ): Promise<MfaVerifyEnrollmentResponse> =>
      this.http.request<MfaVerifyEnrollmentResponse>(
        "/me/mfa/totp/verify-enrollment",
        { method: "POST", json: { code }, bearer: this.requireToken() },
      ),
    disableTotp: async (currentPassword: string): Promise<void> => {
      await this.http.request("/me/mfa/totp/disable", {
        method: "POST",
        json: { currentPassword },
        bearer: this.requireToken(),
      })
    },
  }

  // ─── /me/passkey + /passkey/auth ─────────────────────────────────────────

  readonly passkey = {
    list: async (): Promise<PasskeySummary[]> =>
      this.http.request<PasskeySummary[]>("/me/passkey", {
        method: "GET",
        bearer: this.requireToken(),
      }),
    delete: async (id: string): Promise<void> => {
      await this.http.request(`/me/passkey/${encodeURIComponent(id)}`, {
        method: "DELETE",
        bearer: this.requireToken(),
      })
    },
    /**
     * Register a new passkey on this device.
     *
     * Browser-only: dynamically imports `@simplewebauthn/browser`. RP
     * SDK kullanıyor ama webauthn/browser bağımlılığı yoksa caller
     * `peerDependencies` aracılığıyla manuel ekler.
     */
    register: async (deviceName?: string): Promise<void> => {
      const begin = await this.http.request<{
        options: unknown
        challengeToken: string
      }>("/me/passkey/register/begin", {
        method: "POST",
        bearer: this.requireToken(),
      })
      const sw = await loadSimpleWebAuthnBrowser()
      const attestation = await sw.startRegistration({
        optionsJSON: begin.options as Parameters<typeof sw.startRegistration>[0]["optionsJSON"],
      })
      await this.http.request("/me/passkey/register/complete", {
        method: "POST",
        json: {
          challengeToken: begin.challengeToken,
          response: attestation,
          deviceName:
            deviceName ??
            (typeof navigator !== "undefined"
              ? navigator.userAgent.slice(0, 80)
              : null),
        },
        bearer: this.requireToken(),
      })
    },
    /**
     * Sign in with passkey. Email opsiyonel — verilirse server o
     * user'ın passkey'lerini allowList yapar, yoksa "usernameless".
     * Session kurulur.
     */
    authenticate: async (
      opts: { email?: string; rememberMe?: boolean } = {},
    ): Promise<LoginResponse> => {
      const begin = await this.http.request<{
        options: unknown
        challengeToken: string
      }>("/passkey/authenticate/begin", {
        method: "POST",
        json: { email: opts.email },
      })
      const sw = await loadSimpleWebAuthnBrowser()
      const assertion = await sw.startAuthentication({
        optionsJSON: begin.options as Parameters<typeof sw.startAuthentication>[0]["optionsJSON"],
      })
      const res = await this.http.request<LoginResponse>(
        "/passkey/authenticate/complete",
        {
          method: "POST",
          json: {
            challengeToken: begin.challengeToken,
            response: assertion,
            rememberMe: opts.rememberMe,
          },
        },
      )
      this.persist({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        user: res.user,
      })
      return res
    },
  }

  /**
   * Force refresh now — caller'ın sürdüğü access token süresi dolmuş
   * olabilir; bu method yeni token'ları persist eder.
   */
  async refreshNow(): Promise<void> {
    await this.refresh()
  }

  /** Manual session injection — fragment / cookie redirect dışında tokens
   *  başka bir kanaldan elde edildiyse (örn. RP custom auth callback). */
  setSession(input: {
    accessToken: string
    refreshToken: string
    user: SentroyAuthUser
  }): void {
    this.persist(input)
  }

  private requireToken(): string {
    const restored = this.storage.read()
    if (!restored?.accessToken) {
      throw new Error("Not signed in — accessToken missing.")
    }
    return restored.accessToken
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
