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

/**
 * Login response when MFA is enrolled — first step returns mfaRequired+
 * mfaToken; second step `verifyMfa(mfaToken, code)` issues final tokens.
 */
export interface MfaChallengeResponse {
  mfaRequired: true
  mfaToken: string
  factorType: "totp"
}

/** Discriminated union — Login may resolve to tokens OR MFA challenge. */
export type LoginOutcome =
  | { kind: "tokens"; data: LoginResponse }
  | { kind: "mfa"; data: MfaChallengeResponse }

export interface SessionSummary {
  id: string
  refreshTokenPrefix: string
  userAgent: string | null
  ip: string | null
  expiresAt: string
  createdAt: string
}

export interface ActivityEntry {
  id: string
  action: string
  ipAddress: string | null
  createdAt: string
  details: Record<string, unknown> | null
}

export interface MfaStatus {
  enrolled: boolean
  factorType?: "totp"
  verifiedAt?: string | null
  recoveryCodesRemaining?: number
}

export interface MfaEnrollResponse {
  secret: string
  otpauthUri: string
}

export interface MfaVerifyEnrollmentResponse {
  enrolled: true
  recoveryCodes: string[]
}

export interface PasskeySummary {
  id: string
  credentialIdPrefix: string
  deviceName: string | null
  transports: string[]
  lastUsedAt: string | null
  createdAt: string
}

export type SocialProvider =
  | "google"
  | "github"
  | "facebook"
  | "microsoft"
  | "twitter"
  | "apple"
