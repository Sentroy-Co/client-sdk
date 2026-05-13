/**
 * Sentroy Auth-as-a-Service — browser/server SDK entry.
 *
 *   import { SentroyAuth } from "@sentroy-co/client-sdk/auth"
 *   const auth = new SentroyAuth({ projectSlug: "my-app" })
 *
 * For server admin operations (verifyIdToken, etc):
 *   import { SentroyAuthAdmin } from "@sentroy-co/client-sdk/auth/admin"
 *
 * For React integration:
 *   import { SentroyAuthProvider, useAuth } from "@sentroy-co/client-sdk/auth/react"
 */

export { SentroyAuth } from "./client"
export type {
  SentroyAuthOptions,
  AuthStateChangeListener,
  AuthStorageAdapter,
} from "./client"
export {
  SentroyAuthError,
  type SentroyAuthUser,
  type SignupResponse,
  type LoginResponse,
  type AuthTokensResponse,
} from "./types"
