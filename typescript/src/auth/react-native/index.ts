import type { AuthStorageAdapter } from "../client"

/** AsyncStorage instance interface — matches @react-native-async-storage/async-storage */
interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

/** SecureStore instance interface — matches expo-secure-store. */
interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>
  setItemAsync(key: string, value: string): Promise<void>
  deleteItemAsync(key: string): Promise<void>
}

interface AdapterValue {
  accessToken: string
  refreshToken: string
  user: unknown  // SentroyAuthUser shape, but kept loose to avoid circular import burden
}

export interface CreateAsyncAdapterOptions {
  /** Project slug — used to namespace the storage key. */
  projectSlug: string
  /** Optional custom key prefix. Default "sentroy.auth". */
  keyPrefix?: string
}

/**
 * Wrap React Native AsyncStorage in the synchronous AuthStorageAdapter
 * contract via a hydrate-on-construct + cache-in-memory + write-through
 * pattern. Reads always hit the cache (sync); writes both update the cache
 * and fire-and-forget to AsyncStorage.
 *
 * Usage:
 *   import AsyncStorage from "@react-native-async-storage/async-storage"
 *   import { createAsyncStorageAdapter } from "@sentroy-co/client-sdk/auth/react-native"
 *
 *   const adapter = createAsyncStorageAdapter(AsyncStorage, { projectSlug: "acme" })
 *   const auth = new SentroyAuth({ projectSlug: "acme", apiKey: "...", storage: adapter })
 *   // Hydration completes asynchronously; auth.user is null until then.
 *   // SentroyAuthProvider's `loading` flag covers this — render a splash.
 *
 *   await adapter.ready  // optional: await before reading auth.user directly
 */
export function createAsyncStorageAdapter(
  storage: AsyncStorageLike,
  opts: CreateAsyncAdapterOptions,
): AuthStorageAdapter & { ready: Promise<void> } {
  const key = `${opts.keyPrefix ?? "sentroy.auth"}.${opts.projectSlug}`
  let cache: AdapterValue | null = null
  const ready = (async () => {
    try {
      const raw = await storage.getItem(key)
      if (raw) cache = JSON.parse(raw) as AdapterValue
    } catch {
      cache = null
    }
  })()
  return {
    read() { return cache as ReturnType<AuthStorageAdapter["read"]> },
    write(value) {
      cache = value as AdapterValue
      void storage.setItem(key, JSON.stringify(value)).catch(() => {})
    },
    clear() {
      cache = null
      void storage.removeItem(key).catch(() => {})
    },
    ready,
  }
}

/**
 * Wrap expo-secure-store in the synchronous AuthStorageAdapter contract.
 * Use this for the refreshToken — it's a long-lived credential and lives
 * better in the OS keychain/keystore than in AsyncStorage.
 *
 * Note: expo-secure-store has a 2KB per-key size limit on iOS. If the user
 * blob exceeds it, split: keep refreshToken in SecureStore via this adapter,
 * keep accessToken+user in AsyncStorage via `createAsyncStorageAdapter`,
 * or strip user.metadata before storing.
 *
 * Usage:
 *   import * as SecureStore from "expo-secure-store"
 *   import { createSecureStoreAdapter } from "@sentroy-co/client-sdk/auth/react-native"
 *
 *   const adapter = createSecureStoreAdapter(SecureStore, { projectSlug: "acme" })
 *   const auth = new SentroyAuth({ projectSlug: "acme", apiKey: "...", storage: adapter })
 */
export function createSecureStoreAdapter(
  store: SecureStoreLike,
  opts: CreateAsyncAdapterOptions,
): AuthStorageAdapter & { ready: Promise<void> } {
  const key = `${opts.keyPrefix ?? "sentroy.auth"}.${opts.projectSlug}`
  let cache: AdapterValue | null = null
  const ready = (async () => {
    try {
      const raw = await store.getItemAsync(key)
      if (raw) cache = JSON.parse(raw) as AdapterValue
    } catch {
      cache = null
    }
  })()
  return {
    read() { return cache as ReturnType<AuthStorageAdapter["read"]> },
    write(value) {
      cache = value as AdapterValue
      void store.setItemAsync(key, JSON.stringify(value)).catch(() => {})
    },
    clear() {
      cache = null
      void store.deleteItemAsync(key).catch(() => {})
    },
    ready,
  }
}

/**
 * Helper for the expo-web-browser social-login pattern. The auth provider
 * launches the system browser, redirects to your registered `redirectUri`,
 * and returns the tokens via URL hash fragment.
 *
 * Usage:
 *   import * as WebBrowser from "expo-web-browser"
 *   import { openSocialAuthSession } from "@sentroy-co/client-sdk/auth/react-native"
 *
 *   const result = await openSocialAuthSession(WebBrowser, {
 *     authorizeUrl: auth.socialAuthorizeUrl("google", { redirectUri: "myapp://auth/callback" }),
 *     redirectUri: "myapp://auth/callback",
 *   })
 *   if (result?.tokens) {
 *     await auth.setSession(result.tokens)
 *   }
 *
 * Returns null if the user cancelled, or { tokens, user } if successful.
 */
export interface WebBrowserLike {
  openAuthSessionAsync(url: string, redirectUri: string): Promise<{ type: string; url?: string }>
}

export async function openSocialAuthSession(
  webBrowser: WebBrowserLike,
  opts: { authorizeUrl: string; redirectUri: string },
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const result = await webBrowser.openAuthSessionAsync(opts.authorizeUrl, opts.redirectUri)
  if (result.type !== "success" || !result.url) return null
  // Parse the hash fragment (#access_token=...&refresh_token=...&...)
  const u = new URL(result.url)
  const fragment = u.hash.replace(/^#/, "")
  const params = new URLSearchParams(fragment)
  const accessToken = params.get("access_token")
  const refreshToken = params.get("refresh_token")
  if (!accessToken || !refreshToken) return null
  return { accessToken, refreshToken }
}
