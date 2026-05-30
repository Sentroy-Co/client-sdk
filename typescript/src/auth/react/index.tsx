"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { SentroyAuth, type SentroyAuthOptions } from "../client"
import type {
  SentroyAuthUser,
  SessionSummary,
  ActivityEntry,
  MfaStatus,
  PasskeySummary,
} from "../types"

/**
 * Sentroy Auth React integration.
 *
 *   <SentroyAuthProvider projectSlug="my-app">
 *     <App />
 *   </SentroyAuthProvider>
 *
 *   const { user, loading, signIn, signOut } = useAuth()
 *
 * Provider içeride tek bir `SentroyAuth` instance tutar (mount/unmount
 * arasında stable), `onAuthStateChanged` ile React state'i senkron tutar.
 * `loading` ilk render → restore tamam mı henüz değil ayrımı için.
 *
 * Yeni method'lar (MFA, magic link, passkey, social, /me/*) tüm
 * `auth` instance üzerinden erişilebilir — context'te kısayol olarak
 * en sık kullanılanlar mevcut.
 */

interface AuthContextValue {
  /** Underlying SDK instance — gelişmiş senaryolarda doğrudan kullan. */
  auth: SentroyAuth
  user: SentroyAuthUser | null
  /** True iken provider ilk state'i restore etmiş değil — UI'da
   *  "spinner" göster, "redirect to /login" tetikleme. */
  loading: boolean
  // Sık kullanılan kısayollar (proxies)
  signIn: SentroyAuth["signIn"]
  signUp: SentroyAuth["signUp"]
  signOut: SentroyAuth["signOut"]
  sendPasswordReset: SentroyAuth["sendPasswordReset"]
  verifyEmail: SentroyAuth["verifyEmail"]
  verifyMfa: SentroyAuth["verifyMfa"]
  sendMagicLink: SentroyAuth["sendMagicLink"]
  consumeMagicLink: SentroyAuth["consumeMagicLink"]
  acceptInvitation: SentroyAuth["acceptInvitation"]
  socialAuthorizeUrl: SentroyAuth["socialAuthorizeUrl"]
  consumeRedirectFragment: SentroyAuth["consumeRedirectFragment"]
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function SentroyAuthProvider({
  children,
  autoConsumeFragment = true,
  ...opts
}: SentroyAuthOptions & {
  children: ReactNode
  /** Mount'ta `window.location.hash`'ten social-login fragment'ı
   *  consume et — default true. RP'nin redirectUri'sinde session
   *  otomatik kurulur. */
  autoConsumeFragment?: boolean
}) {
  // Single instance — opts deep-compare'a girersek dependency drift'i
  // restart'a yol açar. Caller `projectSlug` değiştirmemeli runtime'da.
  const auth = useMemo(
    () => new SentroyAuth(opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.projectSlug, opts.authBaseUrl, opts.apiKey],
  )
  const [user, setUser] = useState<SentroyAuthUser | null>(auth.user)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u)
      setLoading(false)
    })
    return unsubscribe
  }, [auth])

  // Social login redirect handler — fragment varsa otomatik consume
  useEffect(() => {
    if (!autoConsumeFragment) return
    if (typeof window === "undefined" || !window.location) return
    if (!window.location.hash.includes("access_token=")) return
    auth.consumeRedirectFragment().catch(() => {
      // Fragment varsa ama consume fail ise sessizce yut — caller
      // gerekirse manuel tekrar dener.
    })
  }, [auth, autoConsumeFragment])

  const value = useMemo<AuthContextValue>(
    () => ({
      auth,
      user,
      loading,
      signIn: (i) => auth.signIn(i),
      signUp: (i) => auth.signUp(i),
      signOut: () => auth.signOut(),
      sendPasswordReset: (e) => auth.sendPasswordReset(e),
      verifyEmail: (t) => auth.verifyEmail(t),
      verifyMfa: (i) => auth.verifyMfa(i),
      sendMagicLink: (i) => auth.sendMagicLink(i),
      consumeMagicLink: (t) => auth.consumeMagicLink(t),
      acceptInvitation: (i) => auth.acceptInvitation(i),
      socialAuthorizeUrl: (p, o) => auth.socialAuthorizeUrl(p, o),
      consumeRedirectFragment: () => auth.consumeRedirectFragment(),
    }),
    [auth, user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error(
      "useAuth must be used inside <SentroyAuthProvider> — wrap your app root.",
    )
  }
  return ctx
}

/**
 * Convenience: yalnızca current user istenirse. `loading` durumunda null
 * dönerken bekleyebilirsin.
 */
export function useUser(): SentroyAuthUser | null {
  return useAuth().user
}

/**
 * Reactive sessions hook — `/me/sessions` çağırır, refresh trigger eden
 * `refresh()` döner. Manual revoke sonrası caller `refresh()` çağırır.
 */
export function useSessions(): {
  sessions: SessionSummary[] | null
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
  revoke: (id: string) => Promise<void>
} {
  const { auth, user } = useAuth()
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setSessions(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await auth.listSessions()
      setSessions(data)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [auth, user])

  useEffect(() => {
    refresh()
  }, [refresh])

  const revoke = useCallback(
    async (id: string) => {
      await auth.revokeSession(id)
      await refresh()
    },
    [auth, refresh],
  )

  return { sessions, loading, error, refresh, revoke }
}

/**
 * Reactive activity log hook — `/me/activity`. RP'nin "recent activity"
 * tab'ı için.
 */
export function useActivity(): {
  activity: ActivityEntry[] | null
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
} {
  const { auth, user } = useAuth()
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setActivity(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await auth.getActivity()
      setActivity(data)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [auth, user])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { activity, loading, error, refresh }
}

/**
 * Reactive MFA status. enroll / verify / disable wrapper'ları, status
 * otomatik yeniden çekilir.
 */
export function useMfa(): {
  status: MfaStatus | null
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
  enrollTotp: SentroyAuth["mfa"]["enrollTotp"]
  verifyTotpEnrollment: (code: string) => Promise<void>
  disableTotp: (currentPassword: string) => Promise<void>
} {
  const { auth, user } = useAuth()
  const [status, setStatus] = useState<MfaStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setStatus(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await auth.mfa.getStatus()
      setStatus(data)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [auth, user])

  useEffect(() => {
    refresh()
  }, [refresh])

  const verifyTotpEnrollment = useCallback(
    async (code: string) => {
      await auth.mfa.verifyTotpEnrollment(code)
      await refresh()
    },
    [auth, refresh],
  )

  const disableTotp = useCallback(
    async (currentPassword: string) => {
      await auth.mfa.disableTotp(currentPassword)
      await refresh()
    },
    [auth, refresh],
  )

  return {
    status,
    loading,
    error,
    refresh,
    enrollTotp: () => auth.mfa.enrollTotp(),
    verifyTotpEnrollment,
    disableTotp,
  }
}

/**
 * Reactive passkey list — list/delete/register, mutation sonrası
 * otomatik refresh.
 */
export function usePasskeys(): {
  passkeys: PasskeySummary[] | null
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
  register: (deviceName?: string) => Promise<void>
  remove: (id: string) => Promise<void>
} {
  const { auth, user } = useAuth()
  const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setPasskeys(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await auth.passkey.list()
      setPasskeys(data)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [auth, user])

  useEffect(() => {
    refresh()
  }, [refresh])

  const register = useCallback(
    async (deviceName?: string) => {
      await auth.passkey.register(deviceName)
      await refresh()
    },
    [auth, refresh],
  )

  const remove = useCallback(
    async (id: string) => {
      await auth.passkey.delete(id)
      await refresh()
    },
    [auth, refresh],
  )

  return { passkeys, loading, error, refresh, register, remove }
}
