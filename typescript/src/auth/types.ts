/**
 * Sentroy Auth-as-a-Service — SDK types.
 *
 * Public types are kept narrow on purpose: SDK shapes evolve with backend;
 * caller code should depend on these names, not on hand-coded interfaces.
 */

export interface SentroyAuthUser {
  id: string
  authProjectId: string
  email: string
  emailVerified: boolean
  displayName: string | null
  image: string | null
  metadata: Record<string, unknown>
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AuthTokensResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: "Bearer"
}

export interface SignupResponse {
  user: SentroyAuthUser
  /** Email verification gerekiyorsa undefined; aksi halde set. */
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  tokenType?: "Bearer"
  emailVerificationRequired?: boolean
}

export interface LoginResponse {
  user: SentroyAuthUser
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: "Bearer"
}

export interface AuthApiError {
  error: string
  error_description: string
}

export class SentroyAuthError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = "SentroyAuthError"
    this.code = code
    this.status = status
  }
}
