import { AuthHttp } from "../http"
import type { SentroyAuthUser } from "../types"

/**
 * Server-side Sentroy Auth admin SDK. **Node only — apiKey browser'a
 * koymayın**; bu sınıf Project'in master `aps_` token'ını taşır ve
 * Sentroy üzerindeki user pool'a yetki vermez.
 *
 * Tipik kullanım: backend, kendi `/api/auth/...` proxy'sinde RP-spesifik
 * authorization yapar, sonra `admin.users.get(...)` ile Sentroy'dan
 * end-user'ı çeker. JWT verify de bu SDK üzerinden — tüm akış stateless.
 */

export interface SentroyAuthAdminOptions {
  authBaseUrl?: string
  projectSlug: string
  apiKey: string
}

export class SentroyAuthAdmin {
  private readonly http: AuthHttp
  private cachedJwks: { keys: Record<string, unknown>[] } | null = null

  constructor(opts: SentroyAuthAdminOptions) {
    this.http = new AuthHttp(opts)
  }

  // ─── User pool admin ──────────────────────────────────────────────────

  users = {
    list: (opts: {
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
      // NOTE Phase 5+: SDK admin endpoint'leri public path'lere taşınmadı;
      // şu an `/api/companies/...` cookie-auth ile. v2'de `/api/v1/admin/...`
      // RP token'ı ile authenticate eden ayrı public admin layer eklenir.
    },
  }

  // ─── ID token verification ─────────────────────────────────────────────

  /**
   * Local verify — JWKS cache'lenir (5dk TTL), JWT signature kontrolü
   * RS256 ile RP backend'inde stateless yapılır. `iss`/`aud` claim
   * eşleşmesi de kontrol edilir.
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
    // iss + aud check
    const expectedIssSuffix = `/p/${this.http.projectSlug}`
    if (typeof claims.iss !== "string" || !claims.iss.endsWith(expectedIssSuffix)) {
      throw new Error("Issuer mismatch.")
    }
    // aud == project apiKeyPrefix (12 chars). API key first 12 = aud check.
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

  private async fetchJwks(): Promise<{ keys: Record<string, unknown>[] }> {
    if (this.cachedJwks) return this.cachedJwks
    const jwks = await this.http.request<{ keys: Record<string, unknown>[] }>(
      "/jwks.json",
      { method: "GET" },
    )
    this.cachedJwks = jwks
    // 5dk cache — basit setTimeout invalidation
    setTimeout(() => {
      this.cachedJwks = null
    }, 5 * 60 * 1000)
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
    throw new Error("Web Crypto unavailable — upgrade Node >= 18 or run in a browser.")
  }
  const key = await subtle.importKey(
    "jwk",
    input.jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  )
  // Web Crypto types want ArrayBuffer-backed BufferSource. TypeScript
  // can't prove Uint8Array isn't SharedArrayBuffer-backed (DOM lib edge);
  // bytes are created fresh from base64 decode so ArrayBuffer-safe — cast.
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
