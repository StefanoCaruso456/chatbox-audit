import {
  exampleActiveChessSessionState,
  exampleChessCompletionSignal,
  validateAppSessionState,
} from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { InMemoryAppSessionRepository } from './repository'
import { AppSessionService } from './service'

function createService() {
  return new AppSessionService(new InMemoryAppSessionRepository(), {
    now: () => '2026-04-01T12:00:00.000Z',
  })
}

function createChessCompletion(overrides: Partial<typeof exampleChessCompletionSignal> = {}) {
  return {
    ...exampleChessCompletionSignal,
    conversationId: 'conversation.1',
    appSessionId: 'app-session.chess.3',
    appId: 'chess.internal',
    startedAt: '2026-04-01T12:00:10.000Z',
    completedAt: '2026-04-01T12:08:00.000Z',
    ...overrides,
  }
}

describe('AppSessionService', () => {
  it('creates a valid app session and persists it independently from chat text', async () => {
    const service = createService()

    const result = await service.createSession({
      appSessionId: 'app-session.chess.3',
      conversationId: 'conversation.1',
      appId: 'chess.internal',
      launchReason: 'chat-tool',
      authState: 'connected',
      status: 'active',
      startedAt: '2026-04-01T12:00:05.000Z',
      lastActiveAt: '2026-04-01T12:01:00.000Z',
      resumableUntil: '2026-04-02T12:00:00.000Z',
      latestSnapshot: exampleActiveChessSessionState.latestSnapshot,
      metadata: {
        boardTheme: 'lesson-analysis',
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.appSessionId).toBe('app-session.chess.3')
      expect(result.value.conversationId).toBe('conversation.1')
      expect(result.value.isActive).toBe(true)
      expect(result.value.latestSequence).toBe(exampleActiveChessSessionState.latestSnapshot?.sequence)
      expect(result.value.metadata).toEqual({ boardTheme: 'lesson-analysis' })
      expect(validateAppSessionState(result.value).success).toBe(true)
    }
  })

  it('updates validated snapshots and completion state', async () => {
    const service = createService()

    await service.createSession({
      appSessionId: 'app-session.chess.4',
      conversationId: 'conversation.2',
      appId: 'chess.internal',
      launchReason: 'chat-tool',
      authState: 'connected',
      status: 'active',
      startedAt: '2026-04-01T12:00:05.000Z',
    })

    const snapshotResult = await service.recordSnapshot('app-session.chess.4', exampleActiveChessSessionState.latestSnapshot!)
    expect(snapshotResult.ok).toBe(true)
    if (snapshotResult.ok) {
      expect(snapshotResult.value.latestSequence).toBe(exampleActiveChessSessionState.latestSnapshot?.sequence)
      expect(snapshotResult.value.latestSnapshot?.summary).toBe(
        exampleActiveChessSessionState.latestSnapshot?.summary
      )
    }

    const completedResult = await service.markCompleted({
      appSessionId: 'app-session.chess.4',
      completion: createChessCompletion({
        conversationId: 'conversation.2',
        appSessionId: 'app-session.chess.4',
      }),
    })

    expect(completedResult.ok).toBe(true)
    if (completedResult.ok) {
      expect(completedResult.value.status).toBe('completed')
      expect(completedResult.value.isActive).toBe(false)
      expect(completedResult.value.completion?.resultSummary).toBe(exampleChessCompletionSignal.resultSummary)
    }
  })

  it('supports multiple sessions across the same conversation over time', async () => {
    const service = createService()

    const first = await service.createSession({
      appSessionId: 'app-session.chess.5',
      conversationId: 'conversation.3',
      appId: 'chess.internal',
      launchReason: 'chat-tool',
      authState: 'connected',
      status: 'active',
      startedAt: '2026-04-01T12:00:05.000Z',
    })
    expect(first.ok).toBe(true)

    if (first.ok) {
      await service.markCompleted({
        appSessionId: first.value.appSessionId,
        completion: createChessCompletion({
          conversationId: 'conversation.3',
          appSessionId: first.value.appSessionId,
        }),
      })
    }

    const second = await service.createSession({
      appSessionId: 'app-session.chess.6',
      conversationId: 'conversation.3',
      appId: 'chess.internal',
      launchReason: 'chat-tool',
      authState: 'connected',
      status: 'active',
      startedAt: '2026-04-01T12:10:00.000Z',
    })

    expect(second.ok).toBe(true)

    const sessions = await service.listSessionsByConversation('conversation.3')
    expect(sessions).toHaveLength(2)
    expect(sessions.some((session) => session.status === 'completed')).toBe(true)
    expect(sessions.some((session) => session.status === 'active')).toBe(true)
  })

  it('prevents more than one active session in the same conversation', async () => {
    const service = createService()

    await service.createSession({
      appSessionId: 'app-session.chess.7',
      conversationId: 'conversation.4',
      appId: 'chess.internal',
      launchReason: 'chat-tool',
      authState: 'connected',
      status: 'active',
      startedAt: '2026-04-01T12:00:05.000Z',
    })

    const conflict = await service.createSession({
      appSessionId: 'app-session.weather.1',
      conversationId: 'conversation.4',
      appId: 'weather.public',
      launchReason: 'manual-open',
      authState: 'not-required',
      status: 'active',
    })

    expect(conflict).toEqual({
      ok: false,
      code: 'active-session-conflict',
      message: 'Conversation "conversation.4" already has an active app session "app-session.chess.7".',
      details: undefined,
    })
  })

  it('returns the active session for a conversation and supports resumable queries', async () => {
    const service = createService()

    await service.createSession({
      appSessionId: 'app-session.chess.8',
      conversationId: 'conversation.5',
      appId: 'chess.internal',
      launchReason: 'chat-tool',
      authState: 'connected',
      status: 'active',
      resumableUntil: '2026-04-02T12:00:00.000Z',
      startedAt: '2026-04-01T12:00:05.000Z',
    })

    await service.createSession({
      appSessionId: 'app-session.weather.2',
      conversationId: 'conversation.6',
      appId: 'weather.public',
      launchReason: 'manual-open',
      authState: 'not-required',
      status: 'completed',
      completedAt: '2026-04-01T12:05:00.000Z',
      completion: {
        ...exampleChessCompletionSignal,
        conversationId: 'conversation.6',
        appSessionId: 'app-session.weather.2',
        appId: 'weather.public',
        completedAt: '2026-04-01T12:05:00.000Z',
        startedAt: '2026-04-01T12:00:10.000Z',
      },
    })

    const active = await service.getActiveSessionForConversation('conversation.5')
    expect(active?.appSessionId).toBe('app-session.chess.8')

    const resumable = await service.listResumableSessions({
      conversationId: 'conversation.5',
      asOf: '2026-04-01T12:00:00.000Z',
    })
    expect(resumable).toHaveLength(1)
    expect(resumable[0].appSessionId).toBe('app-session.chess.8')
  })

  it('returns not-found for missing sessions and keeps record lookups stable', async () => {
    const service = createService()

    const missing = await service.getSession('app-session.missing')
    expect(missing).toEqual({
      ok: false,
      code: 'not-found',
      message: 'App session "app-session.missing" was not found.',
      details: undefined,
    })
  })

  it('supports marking sessions failed and expired', async () => {
    const service = createService()

    await service.createSession({
      appSessionId: 'app-session.chess.9',
      conversationId: 'conversation.7',
      appId: 'chess.internal',
      launchReason: 'chat-tool',
      authState: 'connected',
      status: 'active',
      startedAt: '2026-04-01T12:00:05.000Z',
    })

    const failed = await service.markFailed({
      appSessionId: 'app-session.chess.9',
      error: {
        code: 'app-timeout',
        message: 'The chess app stopped responding.',
        recoverable: true,
        occurredAt: '2026-04-01T12:02:00.000Z',
      },
    })

    expect(failed.ok).toBe(true)
    if (failed.ok) {
      expect(failed.value.status).toBe('failed')
      expect(failed.value.lastError?.code).toBe('app-timeout')
    }

    const expired = await service.markExpired({
      appSessionId: 'app-session.chess.9',
      expiredAt: '2026-04-01T12:10:00.000Z',
    })

    expect(expired.ok).toBe(true)
    if (expired.ok) {
      expect(expired.value.status).toBe('expired')
    }
  })

  it('supports markWaiting, markActive, markPaused, and updateSession transitions', async () => {
    const service = createService()

    await service.createSession({
      appSessionId: 'app-session.chess.10',
      conversationId: 'conversation.8',
      appId: 'chess.internal',
      launchReason: 'chat-tool',
      authState: 'required',
      status: 'pending',
    })

    const waiting = await service.markWaiting({
      appSessionId: 'app-session.chess.10',
      status: 'waiting-auth',
      authState: 'required',
      resumableUntil: '2026-04-02T12:00:00.000Z',
    })
    expect(waiting.ok).toBe(true)
    if (waiting.ok) {
      expect(waiting.value.status).toBe('waiting-auth')
      expect(waiting.value.isActive).toBe(true)
    }

    const active = await service.markActive({
      appSessionId: 'app-session.chess.10',
      lastActiveAt: '2026-04-01T12:03:00.000Z',
    })
    expect(active.ok).toBe(true)
    if (active.ok) {
      expect(active.value.status).toBe('active')
    }

    const paused = await service.markPaused({
      appSessionId: 'app-session.chess.10',
      lastActiveAt: '2026-04-01T12:04:00.000Z',
    })
    expect(paused.ok).toBe(true)
    if (paused.ok) {
      expect(paused.value.status).toBe('paused')
      expect(paused.value.isActive).toBe(false)
    }

    const updated = await service.updateSession({
      appSessionId: 'app-session.chess.10',
      metadata: {
        route: 'resume-from-pause',
      },
      resumableUntil: '2026-04-03T12:00:00.000Z',
    })
    expect(updated.ok).toBe(true)
    if (updated.ok) {
      expect(updated.value.metadata).toEqual({ route: 'resume-from-pause' })
      expect(updated.value.resumableUntil).toBe('2026-04-03T12:00:00.000Z')
    }
  })
})
