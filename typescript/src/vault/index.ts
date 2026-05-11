/**
 * `@sentroy-co/client-sdk/vault` — Sentroy Env Vault server-side client.
 *
 * Bootstrap pattern:
 *   `SENTROY_ENV_API_KEY` (process.env) → tek dış env. Fonksiyonlar
 *   `getEnv("KEY")` ya da `getEnvOrThrow("KEY")` çağrılırken in-memory
 *   cache'den döner; ilk çağrıda Sentroy core'a HTTP fetch yapar ve
 *   o token scope'undaki TÜM env'leri (public + private) çeker.
 *
 * Cache stratejisi:
 *   • Default TTL 5 dk; refresh deadline aşıldığında bir sonraki
 *     `getEnv` çağrısında re-fetch tetiklenir.
 *   • `await refreshEnvCache()` manuel invalidation — webhook ya da
 *     SIGHUP-style restart sinyaline bağlanabilir.
 *   • `setEnvCacheTTL(seconds)` runtime'da TTL değiştirme.
 *
 * Hata politikası: bootstrap fail (token yok / network down / 401)
 *   → `getEnv` her çağrıda undefined döner; `getEnvOrThrow` exception
 *   atar. Process startup'ında `await preloadEnv()` çağırırsanız
 *   eksik env'leri erkenden yakalarsınız.
 *
 * **NOT**: Bu modül `Sentroy` ana client'ından (mail/storage REST
 * resource'ları) bağımsızdır. Vault token'ları (stk_env_*) ile mail/
 * storage token'ları (stk_*) farklı namespace'tedir; tek client'ta
 * birleştirmek ergonomiyi bozardı.
 */

export interface EnvVariable {
  key: string
  value: string
  type: string
  public: boolean
}

export interface EnvCacheState {
  fetchedAt: number
  variables: Map<string, EnvVariable>
  project: string
  environment: string
}

const DEFAULT_TTL_MS = 5 * 60 * 1000
const DEFAULT_BASE_URL = "https://sentroy.com"

interface ClientOptions {
  /** Sentroy core URL (defaults to env or https://sentroy.com). */
  baseUrl?: string
  /** API key — defaults to `process.env.SENTROY_ENV_API_KEY`. */
  apiKey?: string
  /** Cache TTL in seconds; default 300. */
  ttlSeconds?: number
  /** Fetch timeout in ms; default 5000. */
  timeoutMs?: number
}

let resolvedBaseUrl = DEFAULT_BASE_URL
let resolvedApiKey: string | undefined
let cacheTtlMs = DEFAULT_TTL_MS
let fetchTimeoutMs = 5000
let cache: EnvCacheState | null = null
let pendingRefresh: Promise<void> | null = null

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined
  return process.env?.[name]
}

/**
 * One-time client config — Sentroy app'lerinde modül seviyesinde çağrılır,
 * default'lara güvenilirse hiç çağrılmasına gerek yok.
 */
export function configureEnvClient(options: ClientOptions = {}): void {
  if (options.baseUrl) resolvedBaseUrl = options.baseUrl.replace(/\/+$/, "")
  else
    resolvedBaseUrl = (
      readEnv("NEXT_PUBLIC_SENTROY_ENV_API_URL") ||
      readEnv("SENTROY_ENV_API_URL") ||
      readEnv("NEXT_PUBLIC_CORE_APP_URL") ||
      DEFAULT_BASE_URL
    ).replace(/\/+$/, "")
  resolvedApiKey = options.apiKey ?? readEnv("SENTROY_ENV_API_KEY")
  if (options.ttlSeconds) cacheTtlMs = options.ttlSeconds * 1000
  if (options.timeoutMs) fetchTimeoutMs = options.timeoutMs
}

/** TTL'i runtime'da değiştir (örn. development için kısa, prod için uzun). */
export function setEnvCacheTTL(seconds: number): void {
  cacheTtlMs = seconds * 1000
}

/** Cache'i invalidate et — webhook ya da admin-driven manual refresh için. */
export async function refreshEnvCache(): Promise<void> {
  cache = null
  await ensureCache()
}

/** Process start'ında erkenden tetikle — eksik env'i fail-fast yakalar. */
export async function preloadEnv(): Promise<void> {
  await ensureCache()
}

async function fetchVariables(): Promise<EnvCacheState> {
  if (!resolvedApiKey) {
    // Lazy bootstrap — configureEnvClient çağrılmadıysa env'den oku.
    configureEnvClient()
  }
  if (!resolvedApiKey) {
    throw new Error(
      "@sentroy-co/client-sdk/vault: SENTROY_ENV_API_KEY is not set. " +
        "Set it on the platform (Coolify env) or call configureEnvClient({ apiKey: ... }) at boot.",
    )
  }
  const url = `${resolvedBaseUrl}/api/env-vault/fetch`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${resolvedApiKey}` },
    signal: AbortSignal.timeout(fetchTimeoutMs),
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(
      `env-vault fetch failed: ${res.status} ${res.statusText} (url=${url})`,
    )
  }
  const json = (await res.json()) as {
    data?: {
      project: string
      environment: string
      variables: EnvVariable[]
    }
  }
  if (!json.data) throw new Error("env-vault fetch: malformed response")
  const map = new Map<string, EnvVariable>()
  for (const v of json.data.variables) map.set(v.key, v)
  return {
    fetchedAt: Date.now(),
    variables: map,
    project: json.data.project,
    environment: json.data.environment,
  }
}

async function ensureCache(): Promise<EnvCacheState> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < cacheTtlMs) return cache
  if (pendingRefresh) {
    await pendingRefresh
    if (cache) return cache
  }
  pendingRefresh = (async () => {
    try {
      cache = await fetchVariables()
    } finally {
      pendingRefresh = null
    }
  })()
  await pendingRefresh
  if (!cache) throw new Error("env-vault: cache hydrate failed")
  return cache
}

/**
 * Async — env yoksa undefined. Bu fonksiyon TÜM env'leri (server+public)
 * gizler, çünkü `process.env` fallback yok; sadece vault'ta kayıtlı
 * olanlar dönder. Token bootstrap fail ederse exception atar.
 */
export async function getEnv(key: string): Promise<string | undefined> {
  const c = await ensureCache()
  return c.variables.get(key)?.value
}

/** Eksik env'i hemen patlatır — config-validation pattern'inde kullanışlı. */
export async function getEnvOrThrow(key: string): Promise<string> {
  const v = await getEnv(key)
  if (v === undefined) {
    throw new Error(
      `env-vault: required variable ${key} is not defined (project=${cache?.project ?? "?"}, env=${cache?.environment ?? "?"})`,
    )
  }
  return v
}

/**
 * Migration helper — vault'tan oku, yoksa `process.env` fallback.
 *
 * Sentroy app'lerini kademeli olarak `process.env` → vault'a çevirirken
 * "her ikisi de çalışsın" senaryosu için. Vault doldurulmamış / token
 * eksik / fetch fail dönerse sessizce `process.env[key]`'e döner — eski
 * deploy ile yeni kod bir arada çalışabilir.
 *
 * **Migration tamamlandıktan sonra** çağrı sitelerini `getEnv()` ya da
 * `getEnvOrThrow()`'a çevir; fallback'i bırakmak silently process.env
 * sızıntısı riskini taşır (kullanıcı vault'tan key'i sildi sansa bile
 * eski process.env değeri etkili olur).
 *
 * Bootstrap path için (`SENTROY_ENV_API_KEY` set değil) doğrudan
 * `process.env`'e döner — vault fetch denemez. Bu önemli: Sentroy app'i
 * vault'sız boot edilebilir.
 */
export async function getEnvWithFallback(
  key: string,
): Promise<string | undefined> {
  // Token yoksa bypass — vault fetch denemeyelim, log spam etmeyelim.
  const apiKey = resolvedApiKey ?? readEnv("SENTROY_ENV_API_KEY")
  if (!apiKey) return readEnv(key)
  try {
    const v = await getEnv(key)
    if (v !== undefined) return v
  } catch {
    // Fetch fail / network down / 401 → sessizce fallback
  }
  return readEnv(key)
}

/** Tüm env'leri map olarak döner (dump için kullanışlı). */
export async function getAllEnvs(): Promise<Record<string, string>> {
  const c = await ensureCache()
  const out: Record<string, string> = {}
  for (const [k, v] of c.variables) out[k] = v.value
  return out
}

/** Sadece public (`public: true`) env'ler — SSR helper için. */
export async function getPublicEnvs(): Promise<Record<string, string>> {
  const c = await ensureCache()
  const out: Record<string, string> = {}
  for (const [k, v] of c.variables) {
    if (v.public) out[k] = v.value
  }
  return out
}

// ── Webhook handler ─────────────────────────────────────────────────────

export interface VaultWebhookPayload {
  event: "vault.variable.changed"
  project: string
  environment: string
  action: "create" | "update" | "delete"
  /** Etkilenen key'ler — bulk push'ta birden fazla. */
  keys: string[]
  /** Unix ms. */
  timestamp: number
}

export interface CreateVaultWebhookHandlerOptions {
  /**
   * Sentroy vault dashboard'dan aldığın webhook secret (`whsec_...`).
   * Receiver bu secret'la HMAC-SHA256 imzayı doğrular; hatalıysa 401 döner.
   */
  secret: string
  /**
   * Imzayı doğruladıktan sonra çağrılır. Default davranış:
   *   `await refreshEnvCache()` — bir sonraki getEnv() taze değerleri çeker.
   * Custom logic için override et (örn. tek bir key'i targeted invalidate).
   */
  onChange?: (payload: VaultWebhookPayload) => Promise<void> | void
  /**
   * Replay attack'lere karşı body'nin timestamp'i ile şu an arasındaki
   * maksimum tolerans (ms). Default 5 dk. Sıfır ise check kapalı.
   */
  maxAgeMs?: number
}

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000

async function timingSafeEqualHex(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  // Web Crypto — Node 18+ + browser ikisi de destekler.
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body))
  const bytes = new Uint8Array(sig)
  let hex = ""
  for (const b of bytes) hex += b.toString(16).padStart(2, "0")
  return hex
}

/**
 * Bir Sentroy vault webhook receiver'ı için Request → Response handler
 * üretir. Next.js App Router'da:
 *
 *   // app/api/sentroy/vault-webhook/route.ts
 *   import { createVaultWebhookHandler } from "@sentroy-co/client-sdk/vault"
 *   export const POST = createVaultWebhookHandler({
 *     secret: process.env.SENTROY_VAULT_WEBHOOK_SECRET!,
 *   })
 *
 * Default davranış: imza doğruysa cache'i invalidate eder ve 200 döner.
 * Hatalı/eksik imza → 401, eski timestamp → 401, body parse hatası → 400.
 */
export function createVaultWebhookHandler(
  options: CreateVaultWebhookHandlerOptions,
): (request: Request) => Promise<Response> {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  return async (request: Request) => {
    const sigHeader = request.headers.get("x-sentroy-signature") || ""
    const match = sigHeader.match(/^sha256=([a-f0-9]+)$/i)
    if (!match) {
      return new Response("missing or malformed X-Sentroy-Signature header", {
        status: 401,
      })
    }
    const providedSig = match[1].toLowerCase()
    const body = await request.text()
    const expected = await hmacSha256Hex(options.secret, body)
    if (!(await timingSafeEqualHex(providedSig, expected))) {
      return new Response("signature mismatch", { status: 401 })
    }

    let payload: VaultWebhookPayload
    try {
      payload = JSON.parse(body) as VaultWebhookPayload
    } catch {
      return new Response("invalid JSON body", { status: 400 })
    }

    if (maxAgeMs > 0) {
      const age = Date.now() - (payload.timestamp ?? 0)
      if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) {
        return new Response("payload timestamp outside acceptable window", {
          status: 401,
        })
      }
    }

    try {
      if (options.onChange) {
        await options.onChange(payload)
      } else {
        await refreshEnvCache()
      }
    } catch (err) {
      return new Response(
        `handler error: ${err instanceof Error ? err.message : String(err)}`,
        { status: 500 },
      )
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
}
