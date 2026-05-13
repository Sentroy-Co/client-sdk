"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { SentroyAuth, type SentroyAuthOptions } from "../client"
import type { SentroyAuthUser } from "../types"

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
 */

interface AuthContextValue {
  auth: SentroyAuth
  user: SentroyAuthUser | null
  /** True iken provider ilk state'i restore etmiş değil — UI'da
   *  "spinner" göster, "redirect to /login" tetikleme. */
  loading: boolean
  /** Convenience proxies — caller `auth.signIn(...)` yerine doğrudan
   *  `signIn(...)` kullanabilir. */
  signIn: SentroyAuth["signIn"]
  signUp: SentroyAuth["signUp"]
  signOut: SentroyAuth["signOut"]
  sendPasswordReset: SentroyAuth["sendPasswordReset"]
  verifyEmail: SentroyAuth["verifyEmail"]
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function SentroyAuthProvider({
  children,
  ...opts
}: SentroyAuthOptions & { children: ReactNode }) {
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
