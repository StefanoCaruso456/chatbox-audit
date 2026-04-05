import type { TutorMeAIUserRole } from '@shared/types/settings'
import type {
  GetOAuthConnectionRequest,
  OAuthConnectionRecord,
  PlatformSessionRecord,
  UserRecord,
} from './types'

export interface AuthRepository {
  saveUser(user: UserRecord): Promise<void>
  getUserById(userId: string): Promise<UserRecord | undefined>
  getUserByEmail(email: string): Promise<UserRecord | undefined>
  getUserByUsername(username: string): Promise<UserRecord | undefined>
  listUsersByRole(role: TutorMeAIUserRole): Promise<UserRecord[]>

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
  initialUsers?: UserRecord[]
  initialPlatformSessions?: PlatformSessionRecord[]
  initialOAuthConnections?: OAuthConnectionRecord[]
}

export class InMemoryAuthRepository implements AuthRepository {
  private readonly usersById = new Map<string, UserRecord>()
  private readonly userIdsByEmail = new Map<string, string>()
  private readonly userIdsByUsername = new Map<string, string>()

  private readonly platformSessionsById = new Map<string, PlatformSessionRecord>()
  private readonly platformSessionIdsByTokenHash = new Map<string, string>()
  private readonly platformSessionIdsByRefreshTokenHash = new Map<string, string>()
  private readonly platformSessionIdsByUser = new Map<string, Set<string>>()

  private readonly oauthConnectionsById = new Map<string, OAuthConnectionRecord>()
  private readonly oauthConnectionIdsByStateHash = new Map<string, string>()
  private readonly oauthConnectionIdsByUserAppProvider = new Map<string, string>()
  private readonly oauthConnectionIdsByUser = new Map<string, Set<string>>()

  constructor(options: InMemoryAuthRepositoryOptions = {}) {
    options.initialUsers?.forEach((user) => {
      void this.saveUser(user)
    })

    options.initialPlatformSessions?.forEach((session) => {
      void this.savePlatformSession(session)
    })

    options.initialOAuthConnections?.forEach((connection) => {
      void this.saveOAuthConnection(connection)
    })
  }

  async saveUser(user: UserRecord): Promise<void> {
    const previous = this.usersById.get(user.userId)
    if (previous) {
      this.unindexUser(previous)
    }

    const snapshot = clone(user)
    this.usersById.set(snapshot.userId, snapshot)

    const normalizedEmail = normalizeEmail(snapshot.email)
    if (normalizedEmail) {
      this.userIdsByEmail.set(normalizedEmail, snapshot.userId)
    }

    const normalizedUsername = normalizeUsername(snapshot.username)
    if (normalizedUsername) {
      this.userIdsByUsername.set(normalizedUsername, snapshot.userId)
    }
  }

  async getUserById(userId: string): Promise<UserRecord | undefined> {
    const user = this.usersById.get(userId)
    return user ? clone(user) : undefined
  }

  async getUserByEmail(email: string): Promise<UserRecord | undefined> {
    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail) {
      return undefined
    }

    const userId = this.userIdsByEmail.get(normalizedEmail)
    return userId ? this.getUserById(userId) : undefined
  }

  async getUserByUsername(username: string): Promise<UserRecord | undefined> {
    const normalizedUsername = normalizeUsername(username)
    if (!normalizedUsername) {
      return undefined
    }

    const userId = this.userIdsByUsername.get(normalizedUsername)
    return userId ? this.getUserById(userId) : undefined
  }

  async listUsersByRole(role: TutorMeAIUserRole): Promise<UserRecord[]> {
    return [...this.usersById.values()]
      .filter((user) => user.role === role && user.deletedAt === null && user.onboardingCompletedAt !== null)
      .sort(compareUsersForDirectory)
      .map((user) => clone(user))
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

  private unindexPlatformSession(session: PlatformSessionRecord) {
    this.platformSessionIdsByTokenHash.delete(session.sessionTokenHash)
    this.platformSessionIdsByRefreshTokenHash.delete(session.refreshTokenHash)
    this.removeFromUserIndex(this.platformSessionIdsByUser, session.userId, session.platformSessionId)
  }

  private unindexUser(user: UserRecord) {
    const normalizedEmail = normalizeEmail(user.email)
    if (normalizedEmail) {
      this.userIdsByEmail.delete(normalizedEmail)
    }

    const normalizedUsername = normalizeUsername(user.username)
    if (normalizedUsername) {
      this.userIdsByUsername.delete(normalizedUsername)
    }
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

function normalizeEmail(email: string | null | undefined) {
  if (typeof email !== 'string') {
    return null
  }

  const normalized = email.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function normalizeUsername(username: string | null | undefined) {
  if (typeof username !== 'string') {
    return null
  }

  const normalized = username.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function compareUsersForDirectory(left: UserRecord, right: UserRecord) {
  return compareDirectoryStrings(left.displayName, right.displayName) ||
    compareDirectoryStrings(left.email ?? '', right.email ?? '') ||
    compareDirectoryStrings(left.userId, right.userId)
}

function compareDirectoryStrings(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}
