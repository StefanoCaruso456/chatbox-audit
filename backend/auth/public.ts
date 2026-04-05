import type { OAuthConnectionRecord } from './types'

export interface PublicOAuthConnectionRecord {
  oauthConnectionId: string
  userId: string
  appId: string
  provider: string
  status: OAuthConnectionRecord['status']
  requestedScopes: string[]
  externalAccountId: string | null
  scopes: string[]
  tokenType: string | null
  accessTokenExpiresAt: string | null
  refreshTokenExpiresAt: string | null
  lastRefreshedAt: string | null
  connectedAt: string | null
  disconnectedAt: string | null
  createdAt: string
  updatedAt: string
  hasAccessToken: boolean
  hasRefreshToken: boolean
}

export function toPublicOAuthConnectionRecord(connection: OAuthConnectionRecord): PublicOAuthConnectionRecord {
  return {
    oauthConnectionId: connection.oauthConnectionId,
    userId: connection.userId,
    appId: connection.appId,
    provider: connection.provider,
    status: connection.status,
    requestedScopes: [...connection.requestedScopes],
    externalAccountId: connection.externalAccountId,
    scopes: [...connection.scopes],
    tokenType: connection.tokenType,
    accessTokenExpiresAt: connection.accessTokenExpiresAt,
    refreshTokenExpiresAt: connection.refreshTokenExpiresAt,
    lastRefreshedAt: connection.lastRefreshedAt,
    connectedAt: connection.connectedAt,
    disconnectedAt: connection.disconnectedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    hasAccessToken: Boolean(connection.accessTokenCiphertext),
    hasRefreshToken: Boolean(connection.refreshTokenCiphertext),
  }
}
