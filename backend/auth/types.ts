import type { JsonObject } from '@shared/contracts/v1'
import type { BackendFailureResult, BackendResult } from '../errors'

export type PlatformSessionStatus = 'active' | 'expired' | 'revoked'

export interface PlatformSessionRecord {
  platformSessionId: string
  userId: string
  provider: string
  status: PlatformSessionStatus
  sessionTokenHash: string
  refreshTokenHash: string
  tokenVersion: number
  sessionExpiresAt: string
  refreshExpiresAt: string
  issuedAt: string
  lastUsedAt: string | null
  lastRefreshedAt: string | null
  revokedAt: string | null
  userAgent: string | null
  ipAddress: string | null
  metadata: JsonObject
  createdAt: string
  updatedAt: string
}

export interface IssuePlatformSessionRequest {
  userId: string
  provider?: string
  platformSessionId?: string
  sessionTtlMs?: number
  refreshTtlMs?: number
  userAgent?: string
  ipAddress?: string
  metadata?: JsonObject
}

export interface ValidatePlatformSessionRequest {
  sessionToken: string
  touchLastUsedAt?: boolean
}

export interface RefreshPlatformSessionRequest {
  refreshToken: string
  sessionTtlMs?: number
  refreshTtlMs?: number
}

export interface RevokePlatformSessionRequest {
  platformSessionId?: string
  sessionToken?: string
  refreshToken?: string
  reason?: string
}

export interface PlatformSessionIssueResult {
  session: PlatformSessionRecord
  sessionToken: string
  refreshToken: string
}

export interface PlatformSessionRefreshResult {
  session: PlatformSessionRecord
  sessionToken: string
  refreshToken: string
}

export type PlatformAuthErrorCode =
  | 'invalid-request'
  | 'platform-session-not-found'
  | 'platform-session-invalid-token'
  | 'platform-session-revoked'
  | 'platform-session-expired'
  | 'platform-session-refresh-expired'
  | 'platform-session-refresh-invalid'

export type PlatformAuthFailure = BackendFailureResult<PlatformAuthErrorCode, 'auth'>
export type PlatformAuthResult<T> = BackendResult<T, PlatformAuthErrorCode, 'auth'>

export interface OAuthProviderConfig {
  provider: string
  authorizationUrl: string
  tokenUrl: string
  clientId: string
  redirectUri: string
  defaultScopes: string[]
  extraAuthorizationParameters?: Record<string, string>
  pkce?: boolean
}

export interface OAuthTokenSet {
  accessToken: string
  refreshToken?: string | null
  expiresAt?: string | null
  refreshExpiresAt?: string | null
  scopes?: string[]
  tokenType?: string | null
  externalAccountId?: string | null
  idToken?: string | null
}

export type OAuthConnectionStatus = 'pending' | 'connected' | 'expired' | 'revoked' | 'error'

export interface OAuthConnectionRecord {
  oauthConnectionId: string
  userId: string
  appId: string
  provider: string
  status: OAuthConnectionStatus
  authorizationStateHash: string
  authorizationUrl: string
  authorizationExpiresAt: string | null
  codeVerifierCiphertext: string | null
  requestedScopes: string[]
  externalAccountId: string | null
  scopes: string[]
  accessTokenCiphertext: string | null
  refreshTokenCiphertext: string | null
  tokenType: string | null
  accessTokenExpiresAt: string | null
  refreshTokenExpiresAt: string | null
  lastRefreshedAt: string | null
  connectedAt: string | null
  disconnectedAt: string | null
  metadata: JsonObject
  createdAt: string
  updatedAt: string
}

export interface OAuthProviderFailure {
  ok: false
  message: string
  details?: string[]
  retryable?: boolean
}

export interface OAuthProviderSuccess<T> {
  ok: true
  value: T
}

export type OAuthProviderResult<T> = OAuthProviderSuccess<T> | OAuthProviderFailure

export interface OAuthProviderExchangeRequest {
  provider: OAuthProviderConfig
  authorizationCode: string
  redirectUri: string
  codeVerifier?: string
  state: string
}

export interface OAuthProviderRefreshRequest {
  provider: OAuthProviderConfig
  refreshToken: string
  scopes?: string[]
}

export interface OAuthProviderAdapter {
  exchangeAuthorizationCode(
    request: OAuthProviderExchangeRequest
  ): Promise<OAuthProviderResult<OAuthTokenSet>>
  refreshTokens(request: OAuthProviderRefreshRequest): Promise<OAuthProviderResult<OAuthTokenSet>>
}

export interface AuthTokenCipher {
  seal(value: string): string
  open(value: string): string
}

export interface StartOAuthConnectionRequest {
  userId: string
  appId: string
  provider: OAuthProviderConfig
  authorizationState?: string
  codeVerifier?: string
  requestedScopes?: string[]
  metadata?: JsonObject
}

export interface CompleteOAuthConnectionRequest {
  state: string
  authorizationCode: string
  provider: OAuthProviderConfig
  adapter: OAuthProviderAdapter
}

export interface RefreshOAuthConnectionRequest {
  oauthConnectionId?: string
  userId?: string
  appId?: string
  provider: OAuthProviderConfig
  adapter: OAuthProviderAdapter
}

export interface RevokeOAuthConnectionRequest {
  oauthConnectionId?: string
  userId?: string
  appId?: string
  provider?: string
  reason?: string
}

export interface DisconnectOAuthConnectionRequest {
  oauthConnectionId?: string
  userId?: string
  appId?: string
  provider?: string
  reason?: string
}

export interface GetOAuthConnectionRequest {
  oauthConnectionId?: string
  userId?: string
  appId?: string
  provider?: string
}

export interface ListOAuthConnectionsRequest {
  userId?: string
  appId?: string
  provider?: string
  status?: OAuthConnectionStatus
}

export interface StartOAuthConnectionResult {
  connection: OAuthConnectionRecord
  authorizationUrl: string
  state: string
  codeVerifier: string
}

export interface CompleteOAuthConnectionResult {
  connection: OAuthConnectionRecord
}

export interface RefreshOAuthConnectionResult {
  connection: OAuthConnectionRecord
}

export type OAuthAuthErrorCode =
  | 'invalid-request'
  | 'oauth-connection-not-found'
  | 'oauth-connection-not-pending'
  | 'oauth-connection-expired'
  | 'oauth-connection-revoked'
  | 'oauth-token-exchange-failed'
  | 'oauth-token-refresh-failed'
  | 'oauth-token-missing'
  | 'oauth-connection-missing-refresh-token'
  | 'oauth-connection-missing-code-verifier'
  | 'oauth-provider-adapter-missing'

export type OAuthAuthFailure = BackendFailureResult<OAuthAuthErrorCode, 'oauth'>
export type OAuthAuthResult<T> = BackendResult<T, OAuthAuthErrorCode, 'oauth'>
