"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

/**
 * `@sentroy-co/client-sdk/vault/react` — React provider + hook.
 *
 * Akış:
 *   1. Server-side `getPublicEnvs()` çağrılıp result `<EnvProvider envs={...}>`
 *      ile root layout'a SSR sırasında inject edilir → ilk paint'te
 *      `useEnv()` doğru değeri döndürür (FOUC yok).
 *   2. Client-side periyodik refresh (`/api/env-vault/public` endpoint'i,
 *      yalnızca public:true variable'lar) — admin değer değiştirince UI
 *      kullanıcıyı zorla refresh etmeden günceli alır. `refreshIntervalMs`
 *      0 verilirse polling kapalı.
 *
 * **Güvenlik:** Server-side `getEnv()` private env'leri de döner; bu hook
 * yalnızca PUBLIC env'leri client'a sızdırır. Provider'a server-only
 * env geçmek konvansiyon ihlali — `getPublicEnvs()` filter'ını atlayıp
 * `getAllEnvs()` geçerseniz secret leak'lersiniz.
 */

interface EnvContextValue {
  envs: Record<string, string>
  loading: boolean
  refresh: () => Promise<void>
}

const EnvContext = createContext<EnvContextValue>({
  envs: {},
  loading: false,
  refresh: async () => {},
})

interface EnvProviderProps {
  /** Server-side fetched public envs — SSR'da inject edilir. */
  envs: Record<string, string>
  /** Public refresh endpoint URL — default `/api/env-vault/public`. */
  refreshUrl?: string
  /** Bearer token — public endpoint için. Default `process.env.NEXT_PUBLIC_SENTROY_ENV_API_KEY`. */
  apiKey?: string
  /** Refresh interval ms; 0 ise polling kapalı. Default 5 dk. */
  refreshIntervalMs?: number
  children: ReactNode
}

const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1000

export function EnvProvider({
  envs: initialEnvs,
  refreshUrl = "/api/env-vault/public",
  apiKey,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  children,
}: EnvProviderProps) {
  const [envs, setEnvs] = useState<Record<string, string>>(initialEnvs)
  const [loading, setLoading] = useState(false)

  const effectiveKey =
    apiKey ??
    (typeof process !== "undefined"
      ? process.env?.NEXT_PUBLIC_SENTROY_ENV_API_KEY
      : undefined)

  async function refresh() {
    if (!effectiveKey) return // bootstrap yoksa polling no-op
    setLoading(true)
    try {
      const res = await fetch(refreshUrl, {
        headers: { Authorization: `Bearer ${effectiveKey}` },
        cache: "no-store",
      })
      if (!res.ok) return
      const json = (await res.json()) as {
        data?: { variables: { key: string; value: string }[] }
      }
      const next: Record<string, string> = {}
      for (const v of json.data?.variables ?? []) next[v.key] = v.value
      setEnvs(next)
    } catch {
      // network error — keep previous envs, fail-soft
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!refreshIntervalMs || refreshIntervalMs <= 0) return
    const id = setInterval(refresh, refreshIntervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshIntervalMs, effectiveKey])

  return (
    <EnvContext.Provider value={{ envs, loading, refresh }}>
      {children}
    </EnvContext.Provider>
  )
}

/**
 * `useEnv("KEY")` — provider'ın hydrate ettiği env değerini döner.
 * Yoksa undefined; çağıran fallback verir (`useEnv("X") ?? "default"`).
 */
export function useEnv(key: string): string | undefined {
  const ctx = useContext(EnvContext)
  return ctx.envs[key]
}

/** Tüm public env'leri Record olarak döner. */
export function useAllEnvs(): Record<string, string> {
  return useContext(EnvContext).envs
}

/** Manuel refresh tetikleme (örn. admin "config updated" notification sonrası). */
export function useEnvRefresh(): { refresh: () => Promise<void>; loading: boolean } {
  const ctx = useContext(EnvContext)
  return { refresh: ctx.refresh, loading: ctx.loading }
}
