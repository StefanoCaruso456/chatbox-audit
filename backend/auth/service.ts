import type { JsonObject } from '@shared/contracts/v1'
import { createHash, randomBytes, randomUUID } from 'crypto'
import { failureResult } from '../errors'
import type { AuthRepository } from './repository'
import type {
  AuthTokenCipher,
  CompleteOAuthConnectionRequest,
  CompleteOAuthConnectionResult,
  DisconnectOAuthConnectionRequest,
  GetOAuthConnectionRequest,
  IssuePlatformSessionRequest,
  OAuthAuthFailure,
  OAuthAuthResult,
  OAuthConnectionRecord,
  OAuthProviderConfig,
  PlatformAuthFailure,
  PlatformAuthResult,
  PlatformSessionIssueResult,
  PlatformSessionRecord,
  PlatformSessionRefreshResult,
  RefreshOAuthConnectionRequest,
  RefreshOAuthConnectionResult,
  RefreshPlatformSessionRequest,
  RevokeOAuthConnectionRequest,
  RevokePlatformSessionRequest,
  StartOAuthConnectionRequest,
  StartOAuthConnectionResult,
  ValidatePlatformSessionRequest,
} from './types'

const DEFAULT_PLATFORM_SESSION_PROVIDER = 'tutormeai-platform'
const DEFAULT_PLATFORM_SESSION_TTL_MS = 8 * 60 * 60 * 1000
const DEFAULT_PLATFORM_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_OAUTH_STATE_TTL_MS = 15 * 60 * 1000
const DEFAULT_OAUTH_SCOPES: string[] = []

export interface PlatformAuthServiceOptions {
  now?: () => string
  sessionTtlMs?: number
  refreshTtlMs?: number
}

export interface OAuthAuthServiceOptions {
  now?: () => string
  tokenCipher?: AuthTokenCipher
  stateTtlMs?: number
}

export class PlatformAuthService {
  private readonly now: () => string
  private readonly sessionTtlMs: number
  private readonly refreshTtlMs: number

  constructor(
    private readonly repository: AuthRepository,
    options: PlatformAuthServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_PLATFORM_SESSION_TTL_MS
    this.refreshTtlMs = options.refreshTtlMs ?? DEFAULT_PLATFORM_REFRESH_TTL_MS
  }

  async issuePlatformSession(
    request: IssuePlatformSessionRequest
  ): Promise<PlatformAuthResult<PlatformSessionIssueResult>> {
    const userId = this.normalizeNonEmptyString(request.userId)
    if (!userId) {
      return this.failure('invalid-request', 'userId is required.')
    }

    const provider = this.normalizeNonEmptyString(request.provider) ?? DEFAULT_PLATFORM_SESSION_PROVIDER
    const issuedAt = this.now()
    const platformSessionId =
      this.normalizeNonEmptyString(request.platformSessionId) ?? this.buildPlatformSessionId(userId)
    const sessionToken = this.generateOpaqueValue(32)
    const refreshToken = this.generateOpaqueValue(32)
    const sessionTtlMs = request.sessionTtlMs ?? this.sessionTtlMs
    const refreshTtlMs = request.refreshTtlMs ?? this.refreshTtlMs
    const session: PlatformSessionRecord = {
      platformSessionId,
      userId,
      provider,
      status: 'active',
      sessionTokenHash: this.hash(sessionToken),
      refreshTokenHash: this.hash(refreshToken),
      tokenVersion: 1,
      sessionExpiresAt: this.addDuration(issuedAt, sessionTtlMs),
      refreshExpiresAt: this.addDuration(issuedAt, refreshTtlMs),
      issuedAt,
      lastUsedAt: issuedAt,
      lastRefreshedAt: null,
      revokedAt: null,
      userAgent: this.normalizeNullableText(request.userAgent),
      ipAddress: this.normalizeNullableText(request.ipAddress),
      metadata: request.metadata ?? {},
      createdAt: issuedAt,
      updatedAt: issuedAt,
    }

    await this.repository.savePlatformSession(session)
    return {
      ok: true,
      value: {
        session,
        sessionToken,
        refreshToken,
      },
    }
  }

  async validatePlatformSession(
    request: ValidatePlatformSessionRequest
  ): Promise<PlatformAuthResult<PlatformSessionRecord>> {
    const sessionToken = this.normalizeNonEmptyString(request.sessionToken)
    if (!sessionToken) {
      return this.failure('invalid-request', 'sessionToken is required.')
    }

    const session = await this.repository.getPlatformSessionBySessionTokenHash(this.hash(sessionToken))
    if (!session) {
      return this.failure('platform-session-not-found', 'No platform session matched the provided token.')
    }

    const validationError = await this.validatePlatformSessionRecord(session)
    if (validationError) {
      return validationError
    }

    if (request.touchLastUsedAt ?? true) {
      const now = this.now()
      const updated: PlatformSessionRecord = {
        ...session,
        lastUsedAt: now,
        updatedAt: now,
      }
      await this.repository.savePlatformSession(updated)
      return { ok: true, value: updated }
    }

    return { ok: true, value: session }
  }

  async refreshPlatformSession(
    request: RefreshPlatformSessionRequest
  ): Promise<PlatformAuthResult<PlatformSessionRefreshResult>> {
    const refreshToken = this.normalizeNonEmptyString(request.refreshToken)
    if (!refreshToken) {
      return this.failure('invalid-request', 'refreshToken is required.')
    }

    const session = await this.repository.getPlatformSessionByRefreshTokenHash(this.hash(refreshToken))
    if (!session) {
      return this.failure('platform-session-refresh-invalid', 'No platform session matched the refresh token.')
    }

    const refreshValidationError = await this.validatePlatformSessionRefresh(session)
    if (refreshValidationError) {
      return refreshValidationError
    }

    const now = this.now()
    const nextSessionToken = this.generateOpaqueValue(32)
    const nextRefreshToken = this.generateOpaqueValue(32)
    const updated: PlatformSessionRecord = {
      ...session,
      status: 'active',
      sessionTokenHash: this.hash(nextSessionToken),
      refreshTokenHash: this.hash(nextRefreshToken),
      tokenVersion: session.tokenVersion + 1,
      sessionExpiresAt: this.addDuration(now, request.sessionTtlMs ?? this.sessionTtlMs),
      refreshExpiresAt: this.addDuration(now, request.refreshTtlMs ?? this.refreshTtlMs),
      lastUsedAt: now,
      lastRefreshedAt: now,
      revokedAt: null,
      updatedAt: now,
    }

    await this.repository.savePlatformSession(updated)

    return {
      ok: true,
      value: {
        session: updated,
        sessionToken: nextSessionToken,
        refreshToken: nextRefreshToken,
      },
    }
  }

  async revokePlatformSession(
    request: RevokePlatformSessionRequest
  ): Promise<PlatformAuthResult<PlatformSessionRecord>> {
    const session = await this.resolvePlatformSession(request)
    if (!session) {
      return this.failure('platform-session-not-found', 'No platform session matched the supplied selector.')
    }

    const now = this.now()
    const metadata = structuredClone(session.metadata)
    const reason = this.normalizeNullableText(request.reason)
    if (reason) {
      metadata.revocationReason = reason
    }

    const updated: PlatformSessionRecord = {
      ...session,
      status: 'revoked',
      revokedAt: now,
      metadata,
      updatedAt: now,
    }

    await this.repository.savePlatformSession(updated)
    return { ok: true, value: updated }
  }

  async getPlatformSession(platformSessionId: string): Promise<PlatformAuthResult<PlatformSessionRecord>> {
    const normalizedPlatformSessionId = this.normalizeNonEmptyString(platformSessionId)
    if (!normalizedPlatformSessionId) {
      return this.failure('invalid-request', 'platformSessionId is required.')
    }

    const session = await this.repository.getPlatformSessionById(normalizedPlatformSessionId)
    if (!session) {
      return this.failure('platform-session-not-found', `Platform session "${normalizedPlatformSessionId}" was not found.`)
    }

    return { ok: true, value: session }
  }

  async listPlatformSessionsByUser(userId: string): Promise<PlatformSessionRecord[]> {
    const normalizedUserId = this.normalizeNonEmptyString(userId)
    if (!normalizedUserId) {
      return []
    }

    return this.repository.listPlatformSessionsByUser(normalizedUserId)
  }

  private async validatePlatformSessionRecord(
    session: PlatformSessionRecord
  ): Promise<PlatformAuthFailure | null> {
    const nowMs = Date.parse(this.now())
    const sessionExpiresMs = Date.parse(session.sessionExpiresAt)

    if (session.status === 'revoked') {
      return this.failure('platform-session-revoked', `Platform session "${session.platformSessionId}" is revoked.`)
    }

    if (Number.isNaN(sessionExpiresMs) || nowMs >= sessionExpiresMs) {
      const expiredSession =
        session.status === 'expired'
          ? session
          : {
              ...session,
              status: 'expired' as const,
              updatedAt: this.now(),
            }
      if (expiredSession !== session) {
        await this.repository.savePlatformSession(expiredSession)
      }

      return this.failure('platform-session-expired', `Platform session "${session.platformSessionId}" is expired.`)
    }

    return null
  }

  private async validatePlatformSessionRefresh(
    session: PlatformSessionRecord
  ): Promise<PlatformAuthFailure | null> {
    if (session.status === 'revoked') {
      return this.failure('platform-session-revoked', `Platform session "${session.platformSessionId}" is revoked.`)
    }

    const nowMs = Date.parse(this.now())
    const refreshExpiresMs = Date.parse(session.refreshExpiresAt)
    if (Number.isNaN(refreshExpiresMs) || nowMs >= refreshExpiresMs) {
      const expired: PlatformSessionRecord = {
        ...session,
        status: 'expired',
        updatedAt: this.now(),
      }
      await this.repository.savePlatformSession(expired)
      return this.failure(
        'platform-session-refresh-expired',
        `Platform session "${session.platformSessionId}" cannot be refreshed because the refresh token expired.`
      )
    }

    return null
  }

  private async resolvePlatformSession(
    request: RevokePlatformSessionRequest
  ): Promise<PlatformSessionRecord | undefined> {
    const platformSessionId = this.normalizeNonEmptyString(request.platformSessionId)
    if (platformSessionId) {
      return this.repository.getPlatformSessionById(platformSessionId)
    }

    const sessionToken = this.normalizeNonEmptyString(request.sessionToken)
    if (sessionToken) {
      return this.repository.getPlatformSessionBySessionTokenHash(this.hash(sessionToken))
    }

    const refreshToken = this.normalizeNonEmptyString(request.refreshToken)
    if (refreshToken) {
      return this.repository.getPlatformSessionByRefreshTokenHash(this.hash(refreshToken))
    }

    return undefined
  }

  private buildPlatformSessionId(userId: string): string {
    return `platform-session.${userId}.${randomUUID()}`
  }

  private generateOpaqueValue(size: number): string {
    return randomBytes(size).toString('base64url')
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('base64url')
  }

  private normalizeNonEmptyString(value: string | null | undefined): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : undefined
  }

  private normalizeNullableText(value: string | null | undefined): string | null {
    return this.normalizeNonEmptyString(value) ?? null
  }

  private addDuration(isoTimestamp: string, durationMs: number): string {
    return new Date(Date.parse(isoTimestamp) + durationMs).toISOString()
  }

  private failure(code: PlatformAuthFailure['code'], message: string): PlatformAuthFailure {
    return failureResult('auth', code, message)
  }
}

export class OAuthAuthService {
  private readonly now: () => string
  private readonly tokenCipher: AuthTokenCipher
  private readonly stateTtlMs: number

  constructor(
    private readonly repository: AuthRepository,
    options: OAuthAuthServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.tokenCipher = options.tokenCipher ?? identityTokenCipher()
    this.stateTtlMs = options.stateTtlMs ?? DEFAULT_OAUTH_STATE_TTL_MS
  }

  async startOAuthConnection(
    request: StartOAuthConnectionRequest
  ): Promise<OAuthAuthResult<StartOAuthConnectionResult>> {
    const normalized = this.normalizeOAuthStartRequest(request)
    if (!normalized.ok) {
      return normalized
    }

    const { userId, appId, provider, requestedScopes, metadata, state, codeVerifier } = normalized.value
    const authorizationUrl = this.buildAuthorizationUrl(provider, state, codeVerifier, requestedScopes)
    const now = this.now()
    const connection: OAuthConnectionRecord = {
      oauthConnectionId: this.buildOAuthConnectionId(userId, appId, provider.provider),
      userId,
      appId,
      provider: provider.provider,
      status: 'pending',
      authorizationStateHash: this.hash(state),
      authorizationUrl,
      authorizationExpiresAt: this.addDuration(now, this.stateTtlMs),
      codeVerifierCiphertext: this.tokenCipher.seal(codeVerifier),
      requestedScopes,
      externalAccountId: null,
      scopes: requestedScopes,
      accessTokenCiphertext: null,
      refreshTokenCiphertext: null,
      tokenType: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      lastRefreshedAt: null,
      connectedAt: null,
      disconnectedAt: null,
      metadata: metadata ?? {},
      createdAt: now,
      updatedAt: now,
    }

    await this.repository.saveOAuthConnection(connection)
    return {
      ok: true,
      value: {
        connection,
        authorizationUrl,
        state,
        codeVerifier,
      },
    }
  }

  async completeOAuthConnection(
    request: CompleteOAuthConnectionRequest
  ): Promise<OAuthAuthResult<CompleteOAuthConnectionResult>> {
    const state = this.normalizeNonEmptyString(request.state)
    const authorizationCode = this.normalizeNonEmptyString(request.authorizationCode)
    if (!state || !authorizationCode) {
      return this.failure('invalid-request', 'state and authorizationCode are required.')
    }

    const connection = await this.repository.getOAuthConnectionByStateHash(this.hash(state))
    if (!connection) {
      return this.failure('oauth-connection-not-found', 'No pending OAuth connection matched the provided state.')
    }

    if (connection.status === 'revoked') {
      return this.failure('oauth-connection-revoked', `OAuth connection "${connection.oauthConnectionId}" is revoked.`)
    }

    if (connection.status !== 'pending') {
      return this.failure(
        'oauth-connection-not-pending',
        `OAuth connection "${connection.oauthConnectionId}" is not pending authorization.`
      )
    }

    if (!connection.codeVerifierCiphertext) {
      return this.failure(
        'oauth-connection-missing-code-verifier',
        `OAuth connection "${connection.oauthConnectionId}" is missing a PKCE code verifier.`
      )
    }

    if (connection.authorizationExpiresAt && Date.parse(this.now()) >= Date.parse(connection.authorizationExpiresAt)) {
      const expiredConnection: OAuthConnectionRecord = {
        ...connection,
        status: 'expired',
        updatedAt: this.now(),
      }
      await this.repository.saveOAuthConnection(expiredConnection)
      return this.failure(
        'oauth-connection-expired',
        `OAuth connection "${connection.oauthConnectionId}" is waiting on an expired authorization state.`
      )
    }

    const tokenResult = await request.adapter.exchangeAuthorizationCode({
      provider: request.provider,
      authorizationCode,
      redirectUri: request.provider.redirectUri,
      codeVerifier: this.tokenCipher.open(connection.codeVerifierCiphertext),
      state,
    })

    if (!tokenResult.ok) {
      return this.failure('oauth-token-exchange-failed', tokenResult.message, tokenResult.details, tokenResult.retryable)
    }

    if (!tokenResult.value.accessToken) {
      return this.failure('oauth-token-missing', 'OAuth token exchange must return an access token.')
    }

    const now = this.now()
    const updated: OAuthConnectionRecord = {
      ...connection,
      status: 'connected',
      externalAccountId: tokenResult.value.externalAccountId ?? connection.externalAccountId,
      scopes: tokenResult.value.scopes?.length ? uniqueStrings(tokenResult.value.scopes) : connection.requestedScopes,
      accessTokenCiphertext: this.tokenCipher.seal(tokenResult.value.accessToken),
      refreshTokenCiphertext: tokenResult.value.refreshToken
        ? this.tokenCipher.seal(tokenResult.value.refreshToken)
        : connection.refreshTokenCiphertext,
      tokenType: tokenResult.value.tokenType ?? connection.tokenType,
      accessTokenExpiresAt: tokenResult.value.expiresAt ?? null,
      refreshTokenExpiresAt: tokenResult.value.refreshExpiresAt ?? connection.refreshTokenExpiresAt,
      lastRefreshedAt: now,
      connectedAt: connection.connectedAt ?? now,
      disconnectedAt: null,
      authorizationExpiresAt: null,
      codeVerifierCiphertext: null,
      updatedAt: now,
    }

    await this.repository.saveOAuthConnection(updated)
    return {
      ok: true,
      value: {
        connection: updated,
      },
    }
  }

  async refreshOAuthConnection(
    request: RefreshOAuthConnectionRequest
  ): Promise<OAuthAuthResult<RefreshOAuthConnectionResult>> {
    const connection = await this.resolveOAuthConnection(request)
    if (!connection) {
      return this.failure('oauth-connection-not-found', 'No OAuth connection matched the supplied selector.')
    }

    if (connection.status === 'revoked') {
      return this.failure('oauth-connection-revoked', `OAuth connection "${connection.oauthConnectionId}" is revoked.`)
    }

    if (connection.status !== 'connected') {
      return this.failure(
        'oauth-connection-not-pending',
        `OAuth connection "${connection.oauthConnectionId}" is not connected.`
      )
    }

    if (!connection.refreshTokenCiphertext) {
      return this.failure(
        'oauth-connection-missing-refresh-token',
        `OAuth connection "${connection.oauthConnectionId}" has no refresh token to rotate.`
      )
    }

    if (connection.refreshTokenExpiresAt && Date.parse(this.now()) >= Date.parse(connection.refreshTokenExpiresAt)) {
      const expired: OAuthConnectionRecord = {
        ...connection,
        status: 'expired',
        disconnectedAt: connection.disconnectedAt ?? this.now(),
        updatedAt: this.now(),
      }
      await this.repository.saveOAuthConnection(expired)
      return this.failure(
        'oauth-connection-expired',
        `OAuth connection "${connection.oauthConnectionId}" cannot refresh because the refresh token expired.`
      )
    }

    const refreshToken = this.tokenCipher.open(connection.refreshTokenCiphertext)
    const tokenResult = await request.adapter.refreshTokens({
      provider: request.provider,
      refreshToken,
      scopes: connection.scopes.length > 0 ? connection.scopes : connection.requestedScopes,
    })

    if (!tokenResult.ok) {
      return this.failure('oauth-token-refresh-failed', tokenResult.message, tokenResult.details, tokenResult.retryable)
    }

    if (!tokenResult.value.accessToken) {
      return this.failure('oauth-token-missing', 'OAuth token refresh must return an access token.')
    }

    const now = this.now()
    const updated: OAuthConnectionRecord = {
      ...connection,
      status: 'connected',
      externalAccountId: tokenResult.value.externalAccountId ?? connection.externalAccountId,
      scopes: tokenResult.value.scopes?.length ? uniqueStrings(tokenResult.value.scopes) : connection.scopes,
      accessTokenCiphertext: this.tokenCipher.seal(tokenResult.value.accessToken),
      refreshTokenCiphertext: tokenResult.value.refreshToken
        ? this.tokenCipher.seal(tokenResult.value.refreshToken)
        : connection.refreshTokenCiphertext,
      tokenType: tokenResult.value.tokenType ?? connection.tokenType,
      accessTokenExpiresAt: tokenResult.value.expiresAt ?? null,
      refreshTokenExpiresAt: tokenResult.value.refreshExpiresAt ?? connection.refreshTokenExpiresAt,
      lastRefreshedAt: now,
      disconnectedAt: null,
      updatedAt: now,
    }

    await this.repository.saveOAuthConnection(updated)
    return {
      ok: true,
      value: {
        connection: updated,
      },
    }
  }

  async revokeOAuthConnection(
    request: RevokeOAuthConnectionRequest
  ): Promise<OAuthAuthResult<OAuthConnectionRecord>> {
    const connection = await this.resolveOAuthConnection(request)
    if (!connection) {
      return this.failure('oauth-connection-not-found', 'No OAuth connection matched the supplied selector.')
    }

    const now = this.now()
    const metadata = structuredClone(connection.metadata)
    const reason = this.normalizeNullableText(request.reason)
    if (reason) {
      metadata.revocationReason = reason
    }

    const updated: OAuthConnectionRecord = {
      ...connection,
      status: 'revoked',
      accessTokenCiphertext: null,
      refreshTokenCiphertext: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      disconnectedAt: now,
      metadata,
      updatedAt: now,
    }

    await this.repository.saveOAuthConnection(updated)
    return { ok: true, value: updated }
  }

  async disconnectOAuthConnection(
    request: DisconnectOAuthConnectionRequest
  ): Promise<OAuthAuthResult<OAuthConnectionRecord>> {
    return this.revokeOAuthConnection(request)
  }

  async getOAuthConnection(
    request: GetOAuthConnectionRequest
  ): Promise<OAuthAuthResult<OAuthConnectionRecord>> {
    const connection = await this.repository.getOAuthConnection(request)
    if (!connection) {
      return this.failure('oauth-connection-not-found', 'No OAuth connection matched the supplied selector.')
    }

    return { ok: true, value: connection }
  }

  async listOAuthConnectionsByUser(userId: string): Promise<OAuthConnectionRecord[]> {
    const normalizedUserId = this.normalizeNonEmptyString(userId)
    if (!normalizedUserId) {
      return []
    }

    return this.repository.listOAuthConnectionsByUser(normalizedUserId)
  }

  async isOAuthConnectionLaunchable(
    request: GetOAuthConnectionRequest
  ): Promise<OAuthAuthResult<boolean>> {
    const connection = await this.repository.getOAuthConnection(request)
    if (!connection) {
      return this.failure('oauth-connection-not-found', 'No OAuth connection matched the supplied selector.')
    }

    if (connection.status !== 'connected' || !connection.accessTokenCiphertext) {
      return { ok: true, value: false }
    }

    if (connection.accessTokenExpiresAt && Date.parse(this.now()) >= Date.parse(connection.accessTokenExpiresAt)) {
      return { ok: true, value: false }
    }

    return { ok: true, value: true }
  }

  private normalizeOAuthStartRequest(
    request: StartOAuthConnectionRequest
  ): OAuthAuthResult<{
    userId: string
    appId: string
    provider: OAuthProviderConfig
    requestedScopes: string[]
    metadata?: JsonObject
    state: string
    codeVerifier: string
  }> {
    const userId = this.normalizeNonEmptyString(request.userId)
    const appId = this.normalizeNonEmptyString(request.appId)
    if (!userId || !appId) {
      return this.failure('invalid-request', 'userId and appId are required.')
    }

    if (!this.isValidOAuthProvider(request.provider)) {
      return this.failure(
        'invalid-request',
        'provider.authorizationUrl, provider.tokenUrl, provider.clientId, and provider.redirectUri are required.'
      )
    }

    const requestedScopes = uniqueStrings([
      ...(request.provider.defaultScopes ?? DEFAULT_OAUTH_SCOPES),
      ...(request.requestedScopes ?? []),
    ])
    const state = this.normalizeNonEmptyString(request.authorizationState) ?? this.generateOpaqueValue(24)
    const codeVerifier = this.normalizeNonEmptyString(request.codeVerifier) ?? this.generateOpaqueValue(32)

    return {
      ok: true,
      value: {
        userId,
        appId,
        provider: request.provider,
        requestedScopes,
        metadata: request.metadata,
        state,
        codeVerifier,
      },
    }
  }

  private buildAuthorizationUrl(
    provider: OAuthProviderConfig,
    state: string,
    codeVerifier: string,
    scopes: string[]
  ): string {
    const url = new URL(provider.authorizationUrl)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', provider.clientId)
    url.searchParams.set('redirect_uri', provider.redirectUri)
    url.searchParams.set('state', state)
    if (scopes.length > 0) {
      url.searchParams.set('scope', scopes.join(' '))
    }

    if (provider.pkce ?? true) {
      url.searchParams.set('code_challenge', this.createPkceChallenge(codeVerifier))
      url.searchParams.set('code_challenge_method', 'S256')
    }

    for (const [key, value] of Object.entries(provider.extraAuthorizationParameters ?? {})) {
      url.searchParams.set(key, value)
    }

    return url.toString()
  }

  private createPkceChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url')
  }

  private async resolveOAuthConnection(
    request: RefreshOAuthConnectionRequest | RevokeOAuthConnectionRequest | DisconnectOAuthConnectionRequest
  ): Promise<OAuthConnectionRecord | undefined> {
    const oauthConnectionId = this.normalizeNonEmptyString(request.oauthConnectionId)
    if (oauthConnectionId) {
      return this.repository.getOAuthConnection({ oauthConnectionId })
    }

    const userId = this.normalizeNonEmptyString(request.userId)
    const appId = this.normalizeNonEmptyString(request.appId)
    const provider =
      typeof request.provider === 'string'
        ? this.normalizeNonEmptyString(request.provider)
        : request.provider
          ? this.normalizeNonEmptyString(request.provider.provider)
          : undefined

    if (userId && appId && provider) {
      return this.repository.getOAuthConnection({
        userId,
        appId,
        provider,
      })
    }

    return undefined
  }

  private buildOAuthConnectionId(userId: string, appId: string, provider: string): string {
    return `oauth-connection.${userId}.${appId}.${provider}.${randomUUID()}`
  }

  private generateOpaqueValue(size: number): string {
    return randomBytes(size).toString('base64url')
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('base64url')
  }

  private normalizeNonEmptyString(value: string | null | undefined): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : undefined
  }

  private normalizeNullableText(value: string | null | undefined): string | null {
    return this.normalizeNonEmptyString(value) ?? null
  }

  private isValidOAuthProvider(provider: OAuthProviderConfig): provider is OAuthProviderConfig {
    return Boolean(
      provider &&
        this.normalizeNonEmptyString(provider.provider) &&
        this.normalizeNonEmptyString(provider.authorizationUrl) &&
        this.normalizeNonEmptyString(provider.tokenUrl) &&
        this.normalizeNonEmptyString(provider.clientId) &&
        this.normalizeNonEmptyString(provider.redirectUri)
    )
  }

  private addDuration(isoTimestamp: string, durationMs: number): string {
    return new Date(Date.parse(isoTimestamp) + durationMs).toISOString()
  }

  private failure(
    code: OAuthAuthFailure['code'],
    message: string,
    details?: string[],
    retryable = false
  ): OAuthAuthFailure {
    return failureResult('oauth', code, message, { details, retryable })
  }
}

export function identityTokenCipher(): AuthTokenCipher {
  return {
    seal: (value) => value,
    open: (value) => value,
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}
