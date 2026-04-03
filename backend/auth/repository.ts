import type {
  GetOAuthConnectionRequest,
  OAuthConnectionRecord,
  PlatformUserProfileRecord,
  PlatformSessionRecord,
} from './types'

export interface AuthRepository {
  savePlatformUserProfile(profile: PlatformUserProfileRecord): Promise<void>
  getPlatformUserProfileById(userId: string): Promise<PlatformUserProfileRecord | undefined>
  getPlatformUserProfileByEmail(email: string): Promise<PlatformUserProfileRecord | undefined>

  savePlatformSession(session: PlatformSessionRecord): Promise<void>
  getPlatformSessionById(platformSessionId: string): Promise<PlatformSessionRecord | undefined>
  getPlatformSessionBySessionTokenHash(sessionTokenHash: string): Promise<PlatformSessionRecord | undefined>
  getPlatformSessionByRefreshTokenHash(refreshTokenHash: string): Promise<PlatformSessionRecord | undefined>
  listPlatformSessionsByUser(userId: string): Promise<PlatformSessionRecord[]>

  saveOAuthConnection(connection: OAuthConnectionRecord): Promise<void>
  getOAuthConnectionById(oauthConnectionId: string): Promise<OAuthConnectionRecord | undefined>
  getOAuthConnectionByStateHash(authorizationStateHash: string): Promise<OAuthConnectionRecord | undefined>
  getOAuthConnection(request: GetOAuthConnectionRequest): Promise<OAuthConnectionRecord | undefined>
  listOAuthConnectionsByUser(userId: string): Promise<OAuthConnectionRecord[]>
}

export interface InMemoryAuthRepositoryOptions {
  initialPlatformUserProfiles?: PlatformUserProfileRecord[]
  initialPlatformSessions?: PlatformSessionRecord[]
  initialOAuthConnections?: OAuthConnectionRecord[]
}

export class InMemoryAuthRepository implements AuthRepository {
  private readonly platformUserProfilesById = new Map<string, PlatformUserProfileRecord>()
  private readonly platformUserIdsByEmail = new Map<string, string>()

  private readonly platformSessionsById = new Map<string, PlatformSessionRecord>()
  private readonly platformSessionIdsByTokenHash = new Map<string, string>()
  private readonly platformSessionIdsByRefreshTokenHash = new Map<string, string>()
  private readonly platformSessionIdsByUser = new Map<string, Set<string>>()

  private readonly oauthConnectionsById = new Map<string, OAuthConnectionRecord>()
  private readonly oauthConnectionIdsByStateHash = new Map<string, string>()
  private readonly oauthConnectionIdsByUserAppProvider = new Map<string, string>()
  private readonly oauthConnectionIdsByUser = new Map<string, Set<string>>()

  constructor(options: InMemoryAuthRepositoryOptions = {}) {
    options.initialPlatformUserProfiles?.forEach((profile) => {
      void this.savePlatformUserProfile(profile)
    })

    options.initialPlatformSessions?.forEach((session) => {
      void this.savePlatformSession(session)
    })

    options.initialOAuthConnections?.forEach((connection) => {
      void this.saveOAuthConnection(connection)
    })
  }

  async savePlatformUserProfile(profile: PlatformUserProfileRecord): Promise<void> {
    const previous = this.platformUserProfilesById.get(profile.userId)
    if (previous) {
      this.unindexPlatformUserProfile(previous)
    }

    const snapshot = clone(profile)
    this.platformUserProfilesById.set(snapshot.userId, snapshot)
    if (snapshot.email) {
      this.platformUserIdsByEmail.set(this.normalizeEmailKey(snapshot.email), snapshot.userId)
    }
  }

  async getPlatformUserProfileById(userId: string): Promise<PlatformUserProfileRecord | undefined> {
    const profile = this.platformUserProfilesById.get(userId)
    return profile ? clone(profile) : undefined
  }

  async getPlatformUserProfileByEmail(email: string): Promise<PlatformUserProfileRecord | undefined> {
    const userId = this.platformUserIdsByEmail.get(this.normalizeEmailKey(email))
    return userId ? this.getPlatformUserProfileById(userId) : undefined
  }

  async savePlatformSession(session: PlatformSessionRecord): Promise<void> {
    const previous = this.platformSessionsById.get(session.platformSessionId)
    if (previous) {
      this.unindexPlatformSession(previous)
    }

    const snapshot = clone(session)
    this.platformSessionsById.set(snapshot.platformSessionId, snapshot)
    this.platformSessionIdsByTokenHash.set(snapshot.sessionTokenHash, snapshot.platformSessionId)
    this.platformSessionIdsByRefreshTokenHash.set(snapshot.refreshTokenHash, snapshot.platformSessionId)
    this.addToUserIndex(this.platformSessionIdsByUser, snapshot.userId, snapshot.platformSessionId)
  }

  async getPlatformSessionById(platformSessionId: string): Promise<PlatformSessionRecord | undefined> {
    const session = this.platformSessionsById.get(platformSessionId)
    return session ? clone(session) : undefined
  }

  async getPlatformSessionBySessionTokenHash(
    sessionTokenHash: string
  ): Promise<PlatformSessionRecord | undefined> {
    const platformSessionId = this.platformSessionIdsByTokenHash.get(sessionTokenHash)
    return platformSessionId ? this.getPlatformSessionById(platformSessionId) : undefined
  }

  async getPlatformSessionByRefreshTokenHash(
    refreshTokenHash: string
  ): Promise<PlatformSessionRecord | undefined> {
    const platformSessionId = this.platformSessionIdsByRefreshTokenHash.get(refreshTokenHash)
    return platformSessionId ? this.getPlatformSessionById(platformSessionId) : undefined
  }

  async listPlatformSessionsByUser(userId: string): Promise<PlatformSessionRecord[]> {
    return this.getIndexedList(this.platformSessionIdsByUser, this.platformSessionsById, userId)
  }

  async saveOAuthConnection(connection: OAuthConnectionRecord): Promise<void> {
    const previous = this.oauthConnectionsById.get(connection.oauthConnectionId)
    if (previous) {
      this.unindexOAuthConnection(previous)
    }

    const snapshot = clone(connection)
    this.oauthConnectionsById.set(snapshot.oauthConnectionId, snapshot)
    this.oauthConnectionIdsByStateHash.set(snapshot.authorizationStateHash, snapshot.oauthConnectionId)
    this.oauthConnectionIdsByUserAppProvider.set(
      this.userAppProviderKey(snapshot.userId, snapshot.appId, snapshot.provider),
      snapshot.oauthConnectionId
    )
    this.addToUserIndex(this.oauthConnectionIdsByUser, snapshot.userId, snapshot.oauthConnectionId)
  }

  async getOAuthConnectionById(oauthConnectionId: string): Promise<OAuthConnectionRecord | undefined> {
    const connection = this.oauthConnectionsById.get(oauthConnectionId)
    return connection ? clone(connection) : undefined
  }

  async getOAuthConnectionByStateHash(
    authorizationStateHash: string
  ): Promise<OAuthConnectionRecord | undefined> {
    const oauthConnectionId = this.oauthConnectionIdsByStateHash.get(authorizationStateHash)
    return oauthConnectionId ? this.getOAuthConnectionById(oauthConnectionId) : undefined
  }

  async getOAuthConnection(
    request: GetOAuthConnectionRequest
  ): Promise<OAuthConnectionRecord | undefined> {
    if (request.oauthConnectionId) {
      return this.getOAuthConnectionById(request.oauthConnectionId)
    }

    if (request.userId && request.appId && request.provider) {
      const oauthConnectionId = this.oauthConnectionIdsByUserAppProvider.get(
        this.userAppProviderKey(request.userId, request.appId, request.provider)
      )
      return oauthConnectionId ? this.getOAuthConnectionById(oauthConnectionId) : undefined
    }

    return undefined
  }

  async listOAuthConnectionsByUser(userId: string): Promise<OAuthConnectionRecord[]> {
    return this.getIndexedList(this.oauthConnectionIdsByUser, this.oauthConnectionsById, userId)
  }

  private unindexPlatformUserProfile(profile: PlatformUserProfileRecord) {
    if (profile.email) {
      this.platformUserIdsByEmail.delete(this.normalizeEmailKey(profile.email))
    }
  }

  private unindexPlatformSession(session: PlatformSessionRecord) {
    this.platformSessionIdsByTokenHash.delete(session.sessionTokenHash)
    this.platformSessionIdsByRefreshTokenHash.delete(session.refreshTokenHash)
    this.removeFromUserIndex(this.platformSessionIdsByUser, session.userId, session.platformSessionId)
  }

  private unindexOAuthConnection(connection: OAuthConnectionRecord) {
    this.oauthConnectionIdsByStateHash.delete(connection.authorizationStateHash)
    this.oauthConnectionIdsByUserAppProvider.delete(
      this.userAppProviderKey(connection.userId, connection.appId, connection.provider)
    )
    this.removeFromUserIndex(this.oauthConnectionIdsByUser, connection.userId, connection.oauthConnectionId)
  }

  private userAppProviderKey(userId: string, appId: string, provider: string): string {
    return [userId, appId, provider].join('|')
  }

  private normalizeEmailKey(email: string): string {
    return email.trim().toLowerCase()
  }

  private addToUserIndex(
    index: Map<string, Set<string>>,
    userId: string,
    valueId: string
  ): void {
    const values = index.get(userId) ?? new Set<string>()
    values.add(valueId)
    index.set(userId, values)
  }

  private removeFromUserIndex(
    index: Map<string, Set<string>>,
    userId: string,
    valueId: string
  ): void {
    const values = index.get(userId)
    if (!values) {
      return
    }

    values.delete(valueId)
    if (values.size === 0) {
      index.delete(userId)
    }
  }

  private getIndexedList<T>(
    index: Map<string, Set<string>>,
    records: Map<string, T>,
    key: string
  ): T[] {
    const values = index.get(key)
    if (!values) {
      return []
    }

    const result: T[] = []
    for (const valueId of values) {
      const record = records.get(valueId)
      if (record !== undefined) {
        result.push(clone(record))
      }
    }

    return result
  }
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T)
}
