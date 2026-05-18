import { AuthHttp } from "../http"
import type {
  SentroyAuthUser,
  SignupResponse,
  LoginResponse,
  LoginOutcome,
  AuthTokensResponse,
  MfaChallengeResponse,
} from "../types"

/**
 * Server-side Sentroy Auth admin SDK. **Node only — apiKey browser'a
 * koymayın**; bu sınıf Project'in master `aps_` token'ını taşır.
 *
 * Tüm public auth endpoint'lerini apiKey'le proxy eder ve JWT'yi local
 * verify edebilir (JWKS cache + RSA Subtle). RP backend tipik akış:
 *
 *   const admin = new SentroyAuthAdmin({ projectSlug, apiKey })
 *   const out = await admin.users.signIn({ email, password })
 *   if (out.kind === "tokens") setCookie(out.data.accessToken, ...)
 *   else // MFA flow
 *
 *   // Mid-request: verify
 *   const claims = await admin.verifyIdToken(req.cookies.accessToken)
 *
 * Token persistence yok — server-side request-scoped; caller cookie /
 * session / DB nereye isterse oraya yazar.
 */

export interface SentroyAuthAdminOptions {
  authBaseUrl?: string
  projectSlug: string
  apiKey: string
  /** JWKS cache TTL (saniye). Default 3600 (1 saat) — JWT rotation
   *  grace period'una uyumlu; daha agresif rotation yapan project'ler
   *  daha düşük set edebilir. */
  jwksCacheTtl?: number
}

interface CachedJwks {
  keys: Record<string, unknown>[]
  expiresAt: number
}

export class SentroyAuthAdmin {
  private readonly http: AuthHttp
  private readonly jwksCacheTtl: number
  private cachedJwks: CachedJwks | null = null

  constructor(opts: SentroyAuthAdminOptions) {
    this.http = new AuthHttp(opts)
    this.jwksCacheTtl = opts.jwksCacheTtl ?? 3600
  }

  get projectSlug(): string {
    return this.http.projectSlug
  }

  get baseUrl(): string {
    return this.http.baseUrl
  }

  // ─── User pool admin ──────────────────────────────────────────────────

  users = {
    /**
     * Server-side signup proxy. apiKey backend'de — browser'a sızmaz.
     * Email verification project config'ine bağlı: required ise
     * `emailVerificationRequired: true` döner, tokens undefined.
     */
    create: (input: {
      email: string
      password: string
      displayName?: string
      metadata?: Record<string, unknown>
    }): Promise<SignupResponse> =>
      this.http.request<SignupResponse>("/signup", {
        method: "POST",
        json: input,
      }),

    /**
     * Server-side login proxy. MFA-aware: tokens VEYA MFA challenge.
     * RP backend `out.kind === "mfa"` ise kullanıcıdan code alıp
     * `users.verifyMfa(...)` çağırır.
     */
    signIn: async (input: {
      email: string
      password: string
      rememberMe?: boolean
    }): Promise<LoginOutcome> => {
      const res = await this.http.request<
        LoginResponse | MfaChallengeResponse
      >("/login", { method: "POST", json: input })
      if ("mfaRequired" in res && res.mfaRequired) {
        return { kind: "mfa", data: res }
      }
      return { kind: "tokens", data: res as LoginResponse }
    },

    /** MFA verify ikinci adımı — `signIn` kind:"mfa" döndüyse. */
    verifyMfa: (input: {
      mfaToken: string
      code?: string
      recoveryCode?: string
    }): Promise<LoginResponse> =>
      this.http.request<LoginResponse>("/login/mfa/verify", {
        method: "POST",
        json: input,
      }),

    /** Refresh access token (rotation). Yeni refresh + access döner. */
    refresh: (refreshToken: string): Promise<AuthTokensResponse> =>
      this.http.request<AuthTokensResponse>("/refresh", {
        method: "POST",
        json: { refreshToken },
      }),

    /** Logout (refresh token revoke). */
    signOut: (refreshToken: string): Promise<void> =>
      this.http
        .request<void>("/logout", {
          method: "POST",
          json: { refreshToken },
        })
        .then(() => undefined),

    /** Verify email — link'ten gelen token. */
    verifyEmail: (token: string): Promise<{ user: SentroyAuthUser }> =>
      this.http.request<{ user: SentroyAuthUser }>("/verify-email", {
        method: "POST",
        json: { token },
      }),

    /** Password reset mail tetikle. */
    requestPasswordReset: (email: string): Promise<void> =>
      this.http
        .request<void>("/password-reset/request", {
          method: "POST",
          json: { email },
        })
        .then(() => undefined),

    /** Reset token + yeni şifre ile finalize. */
    confirmPasswordReset: (input: {
      token: string
      newPassword: string
    }): Promise<{ user: SentroyAuthUser }> =>
      this.http.request<{ user: SentroyAuthUser }>("/password-reset/confirm", {
        method: "POST",
        json: input,
      }),

    /** Magic-link mail tetikle. */
    sendMagicLink: (input: {
      email: string
      redirectUri?: string
    }): Promise<void> =>
      this.http
        .request<void>("/magic-link/request", {
          method: "POST",
          json: input,
        })
        .then(() => undefined),

    /** Magic-link token consume → login. */
    consumeMagicLink: (token: string): Promise<LoginResponse> =>
      this.http.request<LoginResponse>("/magic-link/consume", {
        method: "POST",
        json: { token },
      }),

    /** Davet token'ı ile yeni hesap + login. */
    acceptInvitation: (input: {
      token: string
      password: string
      displayName?: string
    }): Promise<LoginResponse> =>
      this.http.request<LoginResponse>("/invitation/accept", {
        method: "POST",
        json: input,
      }),

    /**
     * Access token ile remote /me — JWT'ye bağımlı kalmadan canlı
     * profile çek. Token expire ise SentroyAuthError fırlatır.
     */
    getUser: (accessToken: string): Promise<SentroyAuthUser> =>
      this.http.request<SentroyAuthUser>("/me", {
        method: "GET",
        bearer: accessToken,
      }),

    /**
     * Token bazlı userinfo (OIDC tarzı). `/userinfo` claims response —
     * SentroyAuthUser shape'inden daha minimal olabilir.
     */
    getUserinfo: (
      accessToken: string,
    ): Promise<{
      sub: string
      email?: string
      email_verified?: boolean
      name?: string
      picture?: string
    }> =>
      this.http.request("/userinfo", {
        method: "GET",
        bearer: accessToken,
      }),

    /**
     * Admin list (paginated). **Şu an public API yok** — dashboard
     * cookie-auth `/api/companies/[slug]/auth-projects/[id]/users`
     * kullan. v2'de stk_ token'lı admin endpoint açılacak.
     */
    list: (_opts: {
      limit?: number
      skip?: number
      emailVerified?: boolean
    } = {}): Promise<{
      items: SentroyAuthUser[]
      pagination: { total: number; limit: number; skip: number }
    }> => {
      throw new Error(
        "admin.users.list requires session-authenticated admin API; use dashboard /api/companies/[slug]/auth-projects/[id]/users instead. (v2 admin SDK will proxy this with stk_ tokens.)",
      )
    },
  }

  // ─── ID token verification ─────────────────────────────────────────────

  /**
   * Local verify — JWKS cache'lenir (default 1h TTL, opts ile değişir),
   * JWT signature RS256 ile WebCrypto Subtle üzerinden verify edilir.
   * `iss`/`aud` claim eşleşmesi de kontrol edilir.
   *
   * Throw'lar: malformed JWT, expired, iss/aud mismatch, key not found,
   * signature mismatch. Tipik kullanım `try/catch` içinde — fail ise
   * 401 dön.
   */
  async verifyIdToken(token: string): Promise<{
    sub: string
    email?: string
    email_verified?: boolean
    name?: string
    picture?: string
    iss: string
    aud: string
    iat: number
    exp: number
    [claim: string]: unknown
  }> {
    const parts = token.split(".")
    if (parts.length !== 3) {
      throw new Error("Malformed JWT — expected three segments.")
    }
    const [headerB64, payloadB64, sigB64] = parts
    const header = JSON.parse(decodeBase64Url(headerB64)) as {
      alg?: string
      kid?: string
    }
    if (header.alg !== "RS256") {
      throw new Error("Only RS256 supported.")
    }
    const claims = JSON.parse(decodeBase64Url(payloadB64)) as {
      exp?: number
      iss?: string
      aud?: string
    }
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) {
      throw new Error("Token expired.")
    }
    const expectedIssSuffix = `/p/${this.http.projectSlug}`
    if (
      typeof claims.iss !== "string" ||
      !claims.iss.endsWith(expectedIssSuffix)
    ) {
      throw new Error("Issuer mismatch.")
    }
    // aud == project apiKeyPrefix (first 12 chars of api key)
    if (
      typeof claims.aud !== "string" ||
      !this.http.apiKey?.startsWith(claims.aud)
    ) {
      throw new Error("Audience mismatch.")
    }

    const jwks = await this.fetchJwks()
    const key = jwks.keys.find(
      (k) => (k as { kid?: string }).kid === header.kid,
    ) ?? jwks.keys[0]
    if (!key) throw new Error("No public key in JWKS.")

    await verifyRsaSignature({
      data: `${headerB64}.${payloadB64}`,
      sigB64,
      jwk: key as JsonWebKey,
    })

    return claims as never
  }

  /** JWKS cache'ini elle temizle (key rotation sonrası). */
  invalidateJwksCache(): void {
    this.cachedJwks = null
  }

  private async fetchJwks(): Promise<{ keys: Record<string, unknown>[] }> {
    if (this.cachedJwks && this.cachedJwks.expiresAt > Date.now()) {
      return { keys: this.cachedJwks.keys }
    }
    const jwks = await this.http.request<{
      keys: Record<string, unknown>[]
    }>("/jwks.json", { method: "GET" })
    this.cachedJwks = {
      keys: jwks.keys,
      expiresAt: Date.now() + this.jwksCacheTtl * 1000,
    }
    return jwks
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function decodeBase64Url(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/")
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
  if (typeof atob === "function") {
    const binary = atob(padded + pad)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B = (globalThis as any).Buffer
  if (B) return B.from(padded + pad, "base64").toString("utf8")
  throw new Error("No base64 decoder available")
}

function base64UrlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/")
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
  if (typeof atob === "function") {
    const binary = atob(padded + pad)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B = (globalThis as any).Buffer
  if (B) return new Uint8Array(B.from(padded + pad, "base64"))
  throw new Error("No base64 decoder available")
}

async function verifyRsaSignature(input: {
  data: string
  sigB64: string
  jwk: JsonWebKey
}): Promise<void> {
  // Browser + modern Node (>=18) have crypto.subtle. Tek kod yolu.
  const subtle =
    typeof crypto !== "undefined" && crypto.subtle ? crypto.subtle : null
  if (!subtle) {
    throw new Error(
      "Web Crypto unavailable — upgrade Node >= 18 or run in a browser.",
    )
  }
  const key = await subtle.importKey(
    "jwk",
    input.jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  )
  // Web Crypto types want ArrayBuffer-backed BufferSource. Bytes are
  // created fresh from base64 decode so they are ArrayBuffer-safe.
  const sigBytes = base64UrlToBytes(input.sigB64) as Uint8Array
  const dataBytes = new TextEncoder().encode(input.data) as Uint8Array
  const ok = await subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    sigBytes as unknown as ArrayBuffer,
    dataBytes as unknown as ArrayBuffer,
  )
  if (!ok) throw new Error("Signature mismatch.")
}
