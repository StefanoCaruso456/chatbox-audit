import type { JsonObject } from '@shared/contracts/v1'
import type { TutorMeAIUserRole } from '@shared/types/settings'
import { Pool, type PoolConfig } from 'pg'
import { InMemoryAuthRepository, type AuthRepository } from './repository'
import type {
  GetOAuthConnectionRequest,
  OAuthConnectionRecord,
  PlatformSessionRecord,
  UserRecord,
} from './types'

interface UserRow {
  user_id: string
  email: string | null
  username: string | null
  display_name: string
  role: UserRecord['role']
  onboarding_completed_at: string | Date | null
  metadata: JsonObject
  created_at: string | Date
  updated_at: string | Date
  deleted_at: string | Date | null
}

interface PlatformSessionRow {
  platform_session_id: string
  user_id: string
  provider: string
  status: PlatformSessionRecord['status']
  session_token_hash: string
  refresh_token_hash: string
  token_version: number
  session_expires_at: string | Date
  refresh_expires_at: string | Date
  issued_at: string | Date
  last_used_at: string | Date | null
  last_refreshed_at: string | Date | null
  revoked_at: string | Date | null
  user_agent: string | null
  ip_address: string | null
  metadata: JsonObject
  created_at: string | Date
  updated_at: string | Date
}

interface OAuthConnectionRow {
  oauth_connection_id: string
  user_id: string
  app_id: string
  provider: string
  status: OAuthConnectionRecord['status']
  authorization_state_hash: string
  authorization_url: string
  authorization_expires_at: string | Date | null
  code_verifier_ciphertext: string | null
  requested_scopes: string[]
  external_account_id: string | null
  scopes: string[]
  access_token_ciphertext: string | null
  refresh_token_ciphertext: string | null
  token_type: string | null
  access_token_expires_at: string | Date | null
  refresh_token_expires_at: string | Date | null
  last_refreshed_at: string | Date | null
  connected_at: string | Date | null
  disconnected_at: string | Date | null
  metadata: JsonObject
  created_at: string | Date
  updated_at: string | Date
}

export interface PostgresAuthRepositoryOptions {
  pool: Pool
}

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly pool: Pool) {}

  async saveUser(user: UserRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (
        user_id,
        email,
        username,
        display_name,
        role,
        onboarding_completed_at,
        metadata,
        created_at,
        updated_at,
        deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::jsonb, $8::timestamptz, $9::timestamptz, $10::timestamptz)
      ON CONFLICT (user_id) DO UPDATE
      SET
        email = EXCLUDED.email,
        username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        role = EXCLUDED.role,
        onboarding_completed_at = EXCLUDED.onboarding_completed_at,
        metadata = EXCLUDED.metadata,
        updated_at = EXCLUDED.updated_at,
        deleted_at = EXCLUDED.deleted_at`,
      [
        user.userId,
        user.email,
        user.username,
        user.displayName,
        user.role,
        user.onboardingCompletedAt,
        JSON.stringify(user.metadata ?? {}),
        user.createdAt,
        user.updatedAt,
        user.deletedAt,
      ]
    )
  }

  async getUserById(userId: string): Promise<UserRecord | undefined> {
    const result = await this.pool.query<UserRow>(
      `SELECT user_id, email, username, display_name, role, onboarding_completed_at, metadata, created_at, updated_at, deleted_at
      FROM users
      WHERE user_id = $1`,
      [userId]
    )

    return result.rows[0] ? mapUserRow(result.rows[0]) : undefined
  }

  async getUserByEmail(email: string): Promise<UserRecord | undefined> {
    const result = await this.pool.query<UserRow>(
      `SELECT user_id, email, username, display_name, role, onboarding_completed_at, metadata, created_at, updated_at, deleted_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1`,
      [email]
    )

    return result.rows[0] ? mapUserRow(result.rows[0]) : undefined
  }

  async getUserByUsername(username: string): Promise<UserRecord | undefined> {
    const result = await this.pool.query<UserRow>(
      `SELECT user_id, email, username, display_name, role, onboarding_completed_at, metadata, created_at, updated_at, deleted_at
      FROM users
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1`,
      [username]
    )

    return result.rows[0] ? mapUserRow(result.rows[0]) : undefined
  }

  async listUsersByRole(role: TutorMeAIUserRole): Promise<UserRecord[]> {
    const result = await this.pool.query<UserRow>(
      `SELECT user_id, email, username, display_name, role, onboarding_completed_at, metadata, created_at, updated_at, deleted_at
      FROM users
      WHERE role = $1
        AND deleted_at IS NULL
        AND onboarding_completed_at IS NOT NULL
      ORDER BY LOWER(display_name), LOWER(COALESCE(email, '')), user_id`,
      [role]
    )

    return result.rows.map(mapUserRow)
  }

  async savePlatformSession(session: PlatformSessionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO platform_sessions (
        platform_session_id,
        user_id,
        provider,
        status,
        session_token_hash,
        refresh_token_hash,
        token_version,
        session_expires_at,
        refresh_expires_at,
        issued_at,
        last_used_at,
        last_refreshed_at,
        revoked_at,
        user_agent,
        ip_address,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8::timestamptz, $9::timestamptz, $10::timestamptz, $11::timestamptz, $12::timestamptz, $13::timestamptz,
        $14, $15, $16::jsonb, $17::timestamptz, $18::timestamptz
      )
      ON CONFLICT (platform_session_id) DO UPDATE
      SET
        user_id = EXCLUDED.user_id,
        provider = EXCLUDED.provider,
        status = EXCLUDED.status,
        session_token_hash = EXCLUDED.session_token_hash,
        refresh_token_hash = EXCLUDED.refresh_token_hash,
        token_version = EXCLUDED.token_version,
        session_expires_at = EXCLUDED.session_expires_at,
        refresh_expires_at = EXCLUDED.refresh_expires_at,
        issued_at = EXCLUDED.issued_at,
        last_used_at = EXCLUDED.last_used_at,
        last_refreshed_at = EXCLUDED.last_refreshed_at,
        revoked_at = EXCLUDED.revoked_at,
        user_agent = EXCLUDED.user_agent,
        ip_address = EXCLUDED.ip_address,
        metadata = EXCLUDED.metadata,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at`,
      [
        session.platformSessionId,
        session.userId,
        session.provider,
        session.status,
        session.sessionTokenHash,
        session.refreshTokenHash,
        session.tokenVersion,
        session.sessionExpiresAt,
        session.refreshExpiresAt,
        session.issuedAt,
        session.lastUsedAt,
        session.lastRefreshedAt,
        session.revokedAt,
        session.userAgent,
        session.ipAddress,
        JSON.stringify(session.metadata ?? {}),
        session.createdAt,
        session.updatedAt,
      ]
    )
  }

  async getPlatformSessionById(platformSessionId: string): Promise<PlatformSessionRecord | undefined> {
    const result = await this.pool.query<PlatformSessionRow>(
      `SELECT
        platform_session_id,
        user_id,
        provider,
        status,
        session_token_hash,
        refresh_token_hash,
        token_version,
        session_expires_at,
        refresh_expires_at,
        issued_at,
        last_used_at,
        last_refreshed_at,
        revoked_at,
        user_agent,
        ip_address,
        metadata,
        created_at,
        updated_at
      FROM platform_sessions
      WHERE platform_session_id = $1`,
      [platformSessionId]
    )

    return result.rows[0] ? mapPlatformSessionRow(result.rows[0]) : undefined
  }

  async getPlatformSessionBySessionTokenHash(sessionTokenHash: string): Promise<PlatformSessionRecord | undefined> {
    const result = await this.pool.query<PlatformSessionRow>(
      `SELECT
        platform_session_id,
        user_id,
        provider,
        status,
        session_token_hash,
        refresh_token_hash,
        token_version,
        session_expires_at,
        refresh_expires_at,
        issued_at,
        last_used_at,
        last_refreshed_at,
        revoked_at,
        user_agent,
        ip_address,
        metadata,
        created_at,
        updated_at
      FROM platform_sessions
      WHERE session_token_hash = $1`,
      [sessionTokenHash]
    )

    return result.rows[0] ? mapPlatformSessionRow(result.rows[0]) : undefined
  }

  async getPlatformSessionByRefreshTokenHash(refreshTokenHash: string): Promise<PlatformSessionRecord | undefined> {
    const result = await this.pool.query<PlatformSessionRow>(
      `SELECT
        platform_session_id,
        user_id,
        provider,
        status,
        session_token_hash,
        refresh_token_hash,
        token_version,
        session_expires_at,
        refresh_expires_at,
        issued_at,
        last_used_at,
        last_refreshed_at,
        revoked_at,
        user_agent,
        ip_address,
        metadata,
        created_at,
        updated_at
      FROM platform_sessions
      WHERE refresh_token_hash = $1`,
      [refreshTokenHash]
    )

    return result.rows[0] ? mapPlatformSessionRow(result.rows[0]) : undefined
  }

  async listPlatformSessionsByUser(userId: string): Promise<PlatformSessionRecord[]> {
    const result = await this.pool.query<PlatformSessionRow>(
      `SELECT
        platform_session_id,
        user_id,
        provider,
        status,
        session_token_hash,
        refresh_token_hash,
        token_version,
        session_expires_at,
        refresh_expires_at,
        issued_at,
        last_used_at,
        last_refreshed_at,
        revoked_at,
        user_agent,
        ip_address,
        metadata,
        created_at,
        updated_at
      FROM platform_sessions
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
      [userId]
    )

    return result.rows.map(mapPlatformSessionRow)
  }

  async saveOAuthConnection(connection: OAuthConnectionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO oauth_connections (
        oauth_connection_id,
        user_id,
        app_id,
        provider,
        status,
        authorization_state_hash,
        authorization_url,
        authorization_expires_at,
        code_verifier_ciphertext,
        requested_scopes,
        external_account_id,
        scopes,
        access_token_ciphertext,
        refresh_token_ciphertext,
        token_type,
        access_token_expires_at,
        refresh_token_expires_at,
        last_refreshed_at,
        connected_at,
        disconnected_at,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10::text[], $11, $12::text[],
        $13, $14, $15, $16::timestamptz, $17::timestamptz, $18::timestamptz, $19::timestamptz, $20::timestamptz,
        $21::jsonb, $22::timestamptz, $23::timestamptz
      )
      ON CONFLICT (oauth_connection_id) DO UPDATE
      SET
        user_id = EXCLUDED.user_id,
        app_id = EXCLUDED.app_id,
        provider = EXCLUDED.provider,
        status = EXCLUDED.status,
        authorization_state_hash = EXCLUDED.authorization_state_hash,
        authorization_url = EXCLUDED.authorization_url,
        authorization_expires_at = EXCLUDED.authorization_expires_at,
        code_verifier_ciphertext = EXCLUDED.code_verifier_ciphertext,
        requested_scopes = EXCLUDED.requested_scopes,
        external_account_id = EXCLUDED.external_account_id,
        scopes = EXCLUDED.scopes,
        access_token_ciphertext = EXCLUDED.access_token_ciphertext,
        refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
        token_type = EXCLUDED.token_type,
        access_token_expires_at = EXCLUDED.access_token_expires_at,
        refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
        last_refreshed_at = EXCLUDED.last_refreshed_at,
        connected_at = EXCLUDED.connected_at,
        disconnected_at = EXCLUDED.disconnected_at,
        metadata = EXCLUDED.metadata,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at`,
      [
        connection.oauthConnectionId,
        connection.userId,
        connection.appId,
        connection.provider,
        connection.status,
        connection.authorizationStateHash,
        connection.authorizationUrl,
        connection.authorizationExpiresAt,
        connection.codeVerifierCiphertext,
        connection.requestedScopes,
        connection.externalAccountId,
        connection.scopes,
        connection.accessTokenCiphertext,
        connection.refreshTokenCiphertext,
        connection.tokenType,
        connection.accessTokenExpiresAt,
        connection.refreshTokenExpiresAt,
        connection.lastRefreshedAt,
        connection.connectedAt,
        connection.disconnectedAt,
        JSON.stringify(connection.metadata ?? {}),
        connection.createdAt,
        connection.updatedAt,
      ]
    )
  }

  async getOAuthConnectionById(oauthConnectionId: string): Promise<OAuthConnectionRecord | undefined> {
    const result = await this.pool.query<OAuthConnectionRow>(
      `${selectOAuthConnectionSql()} WHERE oauth_connection_id = $1`,
      [oauthConnectionId]
    )

    return result.rows[0] ? mapOAuthConnectionRow(result.rows[0]) : undefined
  }

  async getOAuthConnectionByStateHash(authorizationStateHash: string): Promise<OAuthConnectionRecord | undefined> {
    const result = await this.pool.query<OAuthConnectionRow>(
      `${selectOAuthConnectionSql()} WHERE authorization_state_hash = $1`,
      [authorizationStateHash]
    )

    return result.rows[0] ? mapOAuthConnectionRow(result.rows[0]) : undefined
  }

  async getOAuthConnection(request: GetOAuthConnectionRequest): Promise<OAuthConnectionRecord | undefined> {
    if (request.oauthConnectionId) {
      return this.getOAuthConnectionById(request.oauthConnectionId)
    }

    if (request.userId && request.appId && request.provider) {
      const result = await this.pool.query<OAuthConnectionRow>(
        `${selectOAuthConnectionSql()} WHERE user_id = $1 AND app_id = $2 AND provider = $3 LIMIT 1`,
        [request.userId, request.appId, request.provider]
      )
      return result.rows[0] ? mapOAuthConnectionRow(result.rows[0]) : undefined
    }

    return undefined
  }

  async listOAuthConnectionsByUser(userId: string): Promise<OAuthConnectionRecord[]> {
    const result = await this.pool.query<OAuthConnectionRow>(
      `${selectOAuthConnectionSql()} WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId]
    )

    return result.rows.map(mapOAuthConnectionRow)
  }
}

let cachedRepository: AuthRepository | null = null
let cachedRepositoryKey: string | null = null

export function createRuntimeAuthRepository(
  env: Record<string, string | undefined> = process.env
): AuthRepository {
  const databaseUrl = normalizeNonEmptyString(env.DATABASE_URL)
  if (!databaseUrl) {
    return new InMemoryAuthRepository()
  }

  const cacheKey = `${databaseUrl}|${env.TUTORMEAI_DATABASE_SSL ?? ''}|${env.PGSSLMODE ?? ''}`
  if (cachedRepository && cachedRepositoryKey === cacheKey) {
    return cachedRepository
  }

  const poolConfig: PoolConfig = {
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  }

  if (shouldUseSsl(env, databaseUrl)) {
    poolConfig.ssl = {
      rejectUnauthorized: false,
    }
  }

  cachedRepository = new PostgresAuthRepository(new Pool(poolConfig))
  cachedRepositoryKey = cacheKey
  return cachedRepository
}

function selectOAuthConnectionSql() {
  return `SELECT
    oauth_connection_id,
    user_id,
    app_id,
    provider,
    status,
    authorization_state_hash,
    authorization_url,
    authorization_expires_at,
    code_verifier_ciphertext,
    requested_scopes,
    external_account_id,
    scopes,
    access_token_ciphertext,
    refresh_token_ciphertext,
    token_type,
    access_token_expires_at,
    refresh_token_expires_at,
    last_refreshed_at,
    connected_at,
    disconnected_at,
    metadata,
    created_at,
    updated_at
  FROM oauth_connections`
}

function mapUserRow(row: UserRow): UserRecord {
  return {
    userId: row.user_id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    onboardingCompletedAt: toNullableIsoString(row.onboarding_completed_at),
    metadata: asJsonObject(row.metadata),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    deletedAt: toNullableIsoString(row.deleted_at),
  }
}

function mapPlatformSessionRow(row: PlatformSessionRow): PlatformSessionRecord {
  return {
    platformSessionId: row.platform_session_id,
    userId: row.user_id,
    provider: row.provider,
    status: row.status,
    sessionTokenHash: row.session_token_hash,
    refreshTokenHash: row.refresh_token_hash,
    tokenVersion: row.token_version,
    sessionExpiresAt: toIsoString(row.session_expires_at),
    refreshExpiresAt: toIsoString(row.refresh_expires_at),
    issuedAt: toIsoString(row.issued_at),
    lastUsedAt: toNullableIsoString(row.last_used_at),
    lastRefreshedAt: toNullableIsoString(row.last_refreshed_at),
    revokedAt: toNullableIsoString(row.revoked_at),
    userAgent: row.user_agent,
    ipAddress: row.ip_address,
    metadata: asJsonObject(row.metadata),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }
}

function mapOAuthConnectionRow(row: OAuthConnectionRow): OAuthConnectionRecord {
  return {
    oauthConnectionId: row.oauth_connection_id,
    userId: row.user_id,
    appId: row.app_id,
    provider: row.provider,
    status: row.status,
    authorizationStateHash: row.authorization_state_hash,
    authorizationUrl: row.authorization_url,
    authorizationExpiresAt: toNullableIsoString(row.authorization_expires_at),
    codeVerifierCiphertext: row.code_verifier_ciphertext,
    requestedScopes: Array.isArray(row.requested_scopes) ? [...row.requested_scopes] : [],
    externalAccountId: row.external_account_id,
    scopes: Array.isArray(row.scopes) ? [...row.scopes] : [],
    accessTokenCiphertext: row.access_token_ciphertext,
    refreshTokenCiphertext: row.refresh_token_ciphertext,
    tokenType: row.token_type,
    accessTokenExpiresAt: toNullableIsoString(row.access_token_expires_at),
    refreshTokenExpiresAt: toNullableIsoString(row.refresh_token_expires_at),
    lastRefreshedAt: toNullableIsoString(row.last_refreshed_at),
    connectedAt: toNullableIsoString(row.connected_at),
    disconnectedAt: toNullableIsoString(row.disconnected_at),
    metadata: asJsonObject(row.metadata),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toNullableIsoString(value: string | Date | null) {
  if (!value) {
    return null
  }

  return toIsoString(value)
}

function asJsonObject(value: JsonObject | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}
}

function normalizeNonEmptyString(value: string | undefined | null) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function shouldUseSsl(env: Record<string, string | undefined>, databaseUrl: string) {
  const configured = normalizeNonEmptyString(env.TUTORMEAI_DATABASE_SSL)
  if (configured === 'false' || configured === '0' || configured === 'disable') {
    return false
  }

  if (configured === 'true' || configured === '1' || configured === 'require') {
    return true
  }

  const sslMode = normalizeNonEmptyString(env.PGSSLMODE)
  if (sslMode === 'disable') {
    return false
  }

  return !databaseUrl.includes('sslmode=disable')
}
