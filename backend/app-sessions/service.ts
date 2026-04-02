import {
  type AppSessionSnapshot,
  type AppSessionStatus,
  parseAppSessionState,
  validateAppSessionState,
} from '@shared/contracts/v1'
import type { AppSessionRepository } from './repository'
import type {
  AppSessionErrorCode,
  AppSessionFailureResult,
  AppSessionRecord,
  AppSessionResult,
  CreateAppSessionInput,
  ListAppSessionsQuery,
  MarkActiveSessionInput,
  MarkCompletedSessionInput,
  MarkExpiredSessionInput,
  MarkFailedSessionInput,
  MarkPausedSessionInput,
  MarkWaitingSessionInput,
  UpdateAppSessionInput,
} from './types'

const ACTIVE_STATUSES = new Set<AppSessionStatus>(['pending', 'active', 'waiting-auth', 'waiting-user'])
const RESUMABLE_STATUSES = new Set<AppSessionStatus>([
  'pending',
  'active',
  'paused',
  'waiting-auth',
  'waiting-user',
])
const TERMINAL_STATUSES = new Set<AppSessionStatus>(['completed', 'failed', 'expired', 'cancelled'])

export interface AppSessionServiceOptions {
  now?: () => string
}

export class AppSessionService {
  private readonly now: () => string

  constructor(
    private readonly repository: AppSessionRepository,
    options: AppSessionServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  async createSession(input: CreateAppSessionInput): Promise<AppSessionResult<AppSessionRecord>> {
    const existing = await this.repository.getByAppSessionId(input.appSessionId)
    if (existing) {
      const canonicalExisting = this.normalizeSession(existing)
      const canonicalRequested = this.normalizeSession(this.buildSessionFromCreateInput(input, canonicalExisting.createdAt))

      if (JSON.stringify(canonicalExisting) === JSON.stringify(canonicalRequested)) {
        return { ok: true, value: canonicalExisting }
      }

      return this.failure(
        'duplicate-session',
        `App session "${input.appSessionId}" already exists with different contents.`
      )
    }

    const session = this.buildSessionFromCreateInput(input)
    if (ACTIVE_STATUSES.has(session.status)) {
      const conflict = await this.findActiveSessionConflict(session.conversationId, session.appSessionId)
      if (conflict) {
        return this.failure(
          'active-session-conflict',
          `Conversation "${session.conversationId}" already has an active app session "${conflict.appSessionId}".`
        )
      }
    }

    return this.saveValidatedSession(session)
  }

  async updateSession(input: UpdateAppSessionInput): Promise<AppSessionResult<AppSessionRecord>> {
    const existing = await this.repository.getByAppSessionId(input.appSessionId)
    if (!existing) {
      return this.failure('not-found', `App session "${input.appSessionId}" was not found.`)
    }

    const next = this.applyPatch(existing, input)
    return this.persistWithActiveCheck(next)
  }

  async recordSnapshot(
    appSessionId: string,
    snapshot: AppSessionSnapshot
  ): Promise<AppSessionResult<AppSessionRecord>> {
    const existing = await this.getExistingOrFailure(appSessionId)
    if (!existing.ok) {
      return existing
    }

    const next: AppSessionRecord = {
      ...existing.value,
      status: snapshot.status,
      isActive: ACTIVE_STATUSES.has(snapshot.status),
      latestSnapshot: snapshot,
      latestSequence: Math.max(existing.value.latestSequence, snapshot.sequence),
      lastActiveAt: snapshot.capturedAt,
      updatedAt: this.resolveUpdatedAt(
        existing.value.createdAt,
        existing.value.updatedAt,
        existing.value.startedAt,
        snapshot.capturedAt
      ),
      currentToolCallId: TERMINAL_STATUSES.has(snapshot.status) ? undefined : existing.value.currentToolCallId,
      completion: snapshot.status === 'completed' ? existing.value.completion : undefined,
      lastError: snapshot.status === 'failed' ? existing.value.lastError : undefined,
    }

    if (snapshot.status === 'completed' && !next.completion) {
      return this.failure(
        'invalid-session-state',
        `Completed snapshot for "${appSessionId}" requires an existing completion payload.`
      )
    }

    return this.persistWithActiveCheck(next)
  }

  async markWaiting(input: MarkWaitingSessionInput): Promise<AppSessionResult<AppSessionRecord>> {
    const existing = await this.getExistingOrFailure(input.appSessionId)
    if (!existing.ok) {
      return existing
    }

    return this.persistWithActiveCheck({
      ...existing.value,
      status: input.status,
      isActive: true,
      authState: input.authState ?? existing.value.authState,
      currentToolCallId:
        input.currentToolCallId === undefined
          ? existing.value.currentToolCallId
          : input.currentToolCallId ?? undefined,
      lastActiveAt: input.lastActiveAt ?? this.now(),
      resumableUntil:
        input.resumableUntil === undefined ? existing.value.resumableUntil : input.resumableUntil ?? undefined,
      updatedAt: this.resolveUpdatedAt(
        existing.value.createdAt,
        existing.value.updatedAt,
        existing.value.startedAt,
        input.lastActiveAt ?? this.now()
      ),
    })
  }

  async markActive(input: MarkActiveSessionInput): Promise<AppSessionResult<AppSessionRecord>> {
    const existing = await this.getExistingOrFailure(input.appSessionId)
    if (!existing.ok) {
      return existing
    }

    const next: AppSessionRecord = {
      ...existing.value,
      status: 'active',
      isActive: true,
      authState: input.authState ?? existing.value.authState,
      currentToolCallId:
        input.currentToolCallId === undefined
          ? existing.value.currentToolCallId
          : input.currentToolCallId ?? undefined,
      startedAt: existing.value.startedAt ?? input.startedAt ?? this.now(),
      lastActiveAt: input.lastActiveAt ?? this.now(),
      resumableUntil:
        input.resumableUntil === undefined ? existing.value.resumableUntil : input.resumableUntil ?? undefined,
      updatedAt: this.resolveUpdatedAt(
        existing.value.createdAt,
        existing.value.updatedAt,
        existing.value.startedAt ?? input.startedAt,
        input.lastActiveAt ?? this.now()
      ),
    }

    return this.persistWithActiveCheck(next)
  }

  async markPaused(input: MarkPausedSessionInput): Promise<AppSessionResult<AppSessionRecord>> {
    const existing = await this.getExistingOrFailure(input.appSessionId)
    if (!existing.ok) {
      return existing
    }

    return this.saveValidatedSession({
      ...existing.value,
      status: 'paused',
      isActive: false,
      lastActiveAt: input.lastActiveAt ?? existing.value.lastActiveAt ?? this.now(),
      resumableUntil:
        input.resumableUntil === undefined ? existing.value.resumableUntil : input.resumableUntil ?? undefined,
      updatedAt: this.resolveUpdatedAt(
        existing.value.createdAt,
        existing.value.updatedAt,
        existing.value.startedAt,
        input.lastActiveAt ?? existing.value.lastActiveAt ?? this.now()
      ),
    })
  }

  async markCompleted(input: MarkCompletedSessionInput): Promise<AppSessionResult<AppSessionRecord>> {
    const existing = await this.getExistingOrFailure(input.appSessionId)
    if (!existing.ok) {
      return existing
    }

    const completion = input.completion
    const next: AppSessionRecord = {
      ...existing.value,
      status: 'completed',
      isActive: false,
      latestSnapshot: input.latestSnapshot ?? existing.value.latestSnapshot,
      latestSequence: input.latestSnapshot
        ? Math.max(existing.value.latestSequence, input.latestSnapshot.sequence)
        : existing.value.latestSequence,
      completion,
      lastError: undefined,
      currentToolCallId: input.currentToolCallId === undefined ? undefined : input.currentToolCallId ?? undefined,
      completedAt: completion.completedAt,
      lastActiveAt: completion.completedAt,
      resumableUntil: undefined,
      updatedAt: this.resolveUpdatedAt(
        existing.value.createdAt,
        existing.value.updatedAt,
        existing.value.startedAt ?? completion.startedAt,
        completion.completedAt,
        input.latestSnapshot?.capturedAt
      ),
    }

    return this.saveValidatedSession(next)
  }

  async markFailed(input: MarkFailedSessionInput): Promise<AppSessionResult<AppSessionRecord>> {
    const existing = await this.getExistingOrFailure(input.appSessionId)
    if (!existing.ok) {
      return existing
    }

    return this.saveValidatedSession({
      ...existing.value,
      status: 'failed',
      isActive: false,
      lastError: input.error,
      completion: undefined,
      currentToolCallId: input.currentToolCallId === undefined ? undefined : input.currentToolCallId ?? undefined,
      completedAt: input.error.occurredAt,
      lastActiveAt: input.error.occurredAt,
      resumableUntil: undefined,
      updatedAt: this.resolveUpdatedAt(
        existing.value.createdAt,
        existing.value.updatedAt,
        existing.value.startedAt,
        input.error.occurredAt
      ),
    })
  }

  async markExpired(input: MarkExpiredSessionInput): Promise<AppSessionResult<AppSessionRecord>> {
    const existing = await this.getExistingOrFailure(input.appSessionId)
    if (!existing.ok) {
      return existing
    }

    const expiredAt = input.expiredAt ?? this.now()

    return this.saveValidatedSession({
      ...existing.value,
      status: 'expired',
      isActive: false,
      completion: undefined,
      currentToolCallId: input.currentToolCallId === undefined ? undefined : input.currentToolCallId ?? undefined,
      completedAt: expiredAt,
      lastActiveAt: expiredAt,
      resumableUntil: undefined,
      updatedAt: this.resolveUpdatedAt(
        existing.value.createdAt,
        existing.value.updatedAt,
        existing.value.startedAt,
        expiredAt
      ),
    })
  }

  async getSession(appSessionId: string): Promise<AppSessionResult<AppSessionRecord>> {
    const session = await this.repository.getByAppSessionId(appSessionId)
    if (!session) {
      return this.failure('not-found', `App session "${appSessionId}" was not found.`)
    }

    return { ok: true, value: this.normalizeSession(session) }
  }

  async listSessionsByConversation(conversationId: string): Promise<AppSessionRecord[]> {
    const sessions = await this.listSessions()
    return sessions
      .filter((session) => session.conversationId === conversationId)
      .sort((left, right) => this.sortSessions(right, left))
  }

  async getActiveSessionForConversation(conversationId: string): Promise<AppSessionRecord | undefined> {
    const sessions = await this.listSessionsByConversation(conversationId)
    return sessions.find((session) => ACTIVE_STATUSES.has(session.status))
  }

  async listResumableSessions(query: ListAppSessionsQuery = {}): Promise<AppSessionRecord[]> {
    const now = query.asOf ?? this.now()
    const sessions = await this.listSessions()

    return sessions
      .filter((session) => {
        if (query.conversationId && session.conversationId !== query.conversationId) {
          return false
        }

        if (query.appId && session.appId !== query.appId) {
          return false
        }

        if (query.activeOnly && !ACTIVE_STATUSES.has(session.status)) {
          return false
        }

        if (query.resumableOnly && !RESUMABLE_STATUSES.has(session.status)) {
          return false
        }

        if (!session.resumableUntil) {
          return false
        }

        return new Date(session.resumableUntil).getTime() >= new Date(now).getTime()
      })
      .sort((left, right) => this.sortResumableSessions(right, left))
  }

  async listAllSessions(): Promise<AppSessionRecord[]> {
    return this.listSessions()
  }

  private async listSessions(): Promise<AppSessionRecord[]> {
    const sessions = await this.repository.list()
    return sessions.map((session) => this.normalizeSession(session))
  }

  private buildSessionFromCreateInput(
    input: CreateAppSessionInput,
    createdAt: string = this.now(),
    updatedAt: string = createdAt
  ): AppSessionRecord {
    const status = input.status ?? 'pending'
    const latestSnapshot = input.latestSnapshot ?? undefined
    const latestSequence = Math.max(input.latestSequence ?? 0, latestSnapshot?.sequence ?? 0)
    const completion = input.completion ?? undefined
    const resolvedUpdatedAt = this.resolveUpdatedAt(
      createdAt,
      updatedAt,
      input.startedAt ?? undefined,
      input.lastActiveAt ?? undefined,
      input.completedAt ?? undefined,
      input.expiresAt ?? undefined,
      input.resumableUntil ?? undefined,
      latestSnapshot?.capturedAt,
      completion?.completedAt,
      input.lastError?.occurredAt
    )

    return this.normalizeSession({
      version: 'v1',
      appSessionId: input.appSessionId,
      conversationId: input.conversationId,
      appId: input.appId,
      status,
      authState: input.authState,
      launchReason: input.launchReason,
      currentToolCallId: input.currentToolCallId === null ? undefined : input.currentToolCallId,
      createdAt,
      updatedAt: resolvedUpdatedAt,
      startedAt: input.startedAt === null ? undefined : input.startedAt,
      lastActiveAt: input.lastActiveAt === null ? undefined : input.lastActiveAt,
      completedAt: input.completedAt === null ? undefined : input.completedAt,
      expiresAt: input.expiresAt === null ? undefined : input.expiresAt,
      resumableUntil: input.resumableUntil === null ? undefined : input.resumableUntil,
      latestSequence,
      latestSnapshot,
      completion,
      lastError: input.lastError === null ? undefined : input.lastError,
      isActive: ACTIVE_STATUSES.has(status),
      metadata: input.metadata,
    })
  }

  private applyPatch(existing: AppSessionRecord, input: UpdateAppSessionInput): AppSessionRecord {
    const nextStatus = input.status ?? existing.status
    const latestSnapshot =
      input.latestSnapshot === undefined ? existing.latestSnapshot : input.latestSnapshot ?? undefined
    const nextLatestSequence = Math.max(
      input.latestSequence ?? existing.latestSequence,
      latestSnapshot?.sequence ?? 0
    )
    const completion =
      input.completion === undefined ? existing.completion : input.completion ?? undefined
    const resolvedUpdatedAt = this.resolveUpdatedAt(
      existing.createdAt,
      existing.updatedAt,
      input.startedAt === undefined ? existing.startedAt : input.startedAt ?? undefined,
      input.lastActiveAt === undefined ? existing.lastActiveAt : input.lastActiveAt ?? undefined,
      input.completedAt === undefined ? existing.completedAt : input.completedAt ?? undefined,
      input.expiresAt === undefined ? existing.expiresAt : input.expiresAt ?? undefined,
      input.resumableUntil === undefined ? existing.resumableUntil : input.resumableUntil ?? undefined,
      latestSnapshot?.capturedAt,
      completion?.completedAt,
      input.lastError === undefined ? existing.lastError?.occurredAt : input.lastError?.occurredAt
    )

    const next: AppSessionRecord = {
      ...existing,
      status: nextStatus,
      authState: input.authState ?? existing.authState,
      launchReason: input.launchReason ?? existing.launchReason,
      currentToolCallId:
        input.currentToolCallId === undefined
          ? existing.currentToolCallId
          : input.currentToolCallId ?? undefined,
      latestSequence: nextLatestSequence,
      latestSnapshot,
      completion,
      lastError: input.lastError === undefined ? existing.lastError : input.lastError ?? undefined,
      startedAt: input.startedAt === undefined ? existing.startedAt : input.startedAt ?? undefined,
      lastActiveAt: input.lastActiveAt === undefined ? existing.lastActiveAt : input.lastActiveAt ?? undefined,
      completedAt: input.completedAt === undefined ? existing.completedAt : input.completedAt ?? undefined,
      expiresAt: input.expiresAt === undefined ? existing.expiresAt : input.expiresAt ?? undefined,
      resumableUntil:
        input.resumableUntil === undefined ? existing.resumableUntil : input.resumableUntil ?? undefined,
      metadata: input.metadata ?? existing.metadata,
      updatedAt: resolvedUpdatedAt,
      isActive: ACTIVE_STATUSES.has(nextStatus),
    }

    if (nextStatus === 'completed' && !next.completion) {
      return next
    }

    if (TERMINAL_STATUSES.has(nextStatus) && nextStatus !== 'completed') {
      next.completion = undefined
    }

    return this.normalizeSession(next)
  }

  private async persistWithActiveCheck(session: AppSessionRecord): Promise<AppSessionResult<AppSessionRecord>> {
    const normalized = this.normalizeSession(session)
    const validation = validateAppSessionState(normalized)
    if (!validation.success) {
      return this.failure('invalid-session-state', 'App session validation failed.', validation.errors)
    }

    if (ACTIVE_STATUSES.has(normalized.status)) {
      const conflict = await this.findActiveSessionConflict(normalized.conversationId, normalized.appSessionId)
      if (conflict) {
        return this.failure(
          'active-session-conflict',
          `Conversation "${normalized.conversationId}" already has an active app session "${conflict.appSessionId}".`
        )
      }
    }

    await this.repository.save(validation.data)
    return { ok: true, value: validation.data }
  }

  private async saveValidatedSession(session: AppSessionRecord): Promise<AppSessionResult<AppSessionRecord>> {
    const normalized = this.normalizeSession(session)
    const validation = validateAppSessionState(normalized)
    if (!validation.success) {
      return this.failure('invalid-session-state', 'App session validation failed.', validation.errors)
    }

    await this.repository.save(validation.data)
    return { ok: true, value: validation.data }
  }

  private async getExistingOrFailure(appSessionId: string): Promise<AppSessionResult<AppSessionRecord>> {
    const session = await this.repository.getByAppSessionId(appSessionId)
    if (!session) {
      return this.failure('not-found', `App session "${appSessionId}" was not found.`)
    }

    return { ok: true, value: this.normalizeSession(session) }
  }

  private async findActiveSessionConflict(
    conversationId: string,
    appSessionId: string
  ): Promise<AppSessionRecord | undefined> {
    const sessions = await this.listSessions()
    return sessions.find(
      (session) =>
        session.conversationId === conversationId &&
        session.appSessionId !== appSessionId &&
        ACTIVE_STATUSES.has(session.status)
    )
  }

  private normalizeSession(session: AppSessionRecord): AppSessionRecord {
    const normalized: AppSessionRecord = {
      ...session,
      status: session.status,
      isActive: ACTIVE_STATUSES.has(session.status),
      latestSequence: session.latestSequence ?? 0,
    }

    if (normalized.status !== 'completed') {
      normalized.completion = normalized.completion ?? undefined
    }

    if (TERMINAL_STATUSES.has(normalized.status) && normalized.status !== 'completed') {
      normalized.completion = undefined
    }

    return parseAppSessionState(normalized)
  }

  private sortSessions(left: AppSessionRecord, right: AppSessionRecord): number {
    const leftUpdated = new Date(left.updatedAt).getTime()
    const rightUpdated = new Date(right.updatedAt).getTime()
    if (leftUpdated !== rightUpdated) {
      return leftUpdated - rightUpdated
    }

    const leftCreated = new Date(left.createdAt).getTime()
    const rightCreated = new Date(right.createdAt).getTime()
    if (leftCreated !== rightCreated) {
      return leftCreated - rightCreated
    }

    return left.appSessionId.localeCompare(right.appSessionId)
  }

  private sortResumableSessions(left: AppSessionRecord, right: AppSessionRecord): number {
    const leftResumable = new Date(left.resumableUntil ?? left.updatedAt).getTime()
    const rightResumable = new Date(right.resumableUntil ?? right.updatedAt).getTime()
    if (leftResumable !== rightResumable) {
      return leftResumable - rightResumable
    }

    return this.sortSessions(left, right)
  }

  private resolveUpdatedAt(...candidates: Array<string | undefined>): string {
    const resolved = candidates
      .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)
      .reduce<string | undefined>((currentMax, candidate) => {
        if (!currentMax) {
          return candidate
        }

        return new Date(candidate).getTime() > new Date(currentMax).getTime() ? candidate : currentMax
      }, undefined)

    return resolved ?? this.now()
  }

  private failure(
    code: AppSessionErrorCode,
    message: string,
    details?: string[]
  ): AppSessionFailureResult {
    return {
      ok: false,
      code,
      message,
      details,
    }
  }
}
