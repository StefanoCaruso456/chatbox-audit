import { exampleFlashcardsCompletionSignal, examplePublicFlashcardsManifest } from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { AppSessionService, InMemoryAppSessionRepository } from '../../app-sessions'
import { ConversationService, InMemoryConversationRepository } from '../../conversations'
import { InMemoryToolInvocationRepository, ToolInvocationLoggingService } from '../../tool-invocations'
import { ConversationAppContextAssembler } from './service'

function createClock() {
  let current = new Date('2026-04-01T12:00:00.000Z').getTime()

  return () => {
    const timestamp = new Date(current).toISOString()
    current += 1000
    return timestamp
  }
}

function createFixture() {
  const now = createClock()
  const conversations = new ConversationService(new InMemoryConversationRepository(), { now })
  const appSessions = new AppSessionService(new InMemoryAppSessionRepository(), { now })
  const toolInvocations = new ToolInvocationLoggingService(new InMemoryToolInvocationRepository(), { now })
  const assembler = new ConversationAppContextAssembler(
    {
      conversations,
      appSessions,
      toolInvocations,
    },
    { now }
  )

  return {
    conversations,
    appSessions,
    toolInvocations,
    assembler,
  }
}

describe('ConversationAppContextAssembler', () => {
  it('assembles active app state, recent completions, and invocation notes', async () => {
    const { conversations, appSessions, toolInvocations, assembler } = createFixture()

    await conversations.createConversation({
      conversationId: 'conversation.1',
      userId: 'user.1',
      activeAppSessionId: 'app-session.chess.1',
    })

    await appSessions.createSession({
      appSessionId: 'app-session.chess.1',
      conversationId: 'conversation.1',
      appId: 'chess.internal',
      launchReason: 'chat-tool',
      authState: 'connected',
      status: 'active',
      currentToolCallId: 'tool-call.chess.1',
      latestSequence: 4,
      latestSnapshot: {
        sequence: 4,
        capturedAt: '2026-04-01T12:01:00.000Z',
        status: 'active',
        summary: 'White is evaluating the current board.',
        stateDigest: {
          boardState: 'startpos',
        },
      },
      startedAt: '2026-04-01T12:00:05.000Z',
      lastActiveAt: '2026-04-01T12:01:00.000Z',
      resumableUntil: '2026-04-02T12:00:00.000Z',
    })

    await appSessions.createSession({
      appSessionId: 'app-session.flashcards.1',
      conversationId: 'conversation.1',
      appId: examplePublicFlashcardsManifest.appId,
      launchReason: 'manual-open',
      authState: 'not-required',
      status: 'completed',
      completedAt: '2026-04-01T12:03:00.000Z',
      latestSequence: 2,
      latestSnapshot: {
        sequence: 2,
        capturedAt: '2026-04-01T12:03:00.000Z',
        status: 'completed',
        summary: 'Flashcards session on fractions finished and is ready for follow-up.',
        stateDigest: {
          topic: 'fractions',
          reviewedCount: 3,
        },
      },
      completion: {
        ...exampleFlashcardsCompletionSignal,
        appSessionId: 'app-session.flashcards.1',
        appId: examplePublicFlashcardsManifest.appId,
        conversationId: 'conversation.1',
        resultSummary: 'Flashcards on fractions are ready for review.',
        startedAt: '2026-04-01T12:02:00.000Z',
        completedAt: '2026-04-01T12:03:00.000Z',
      },
    })

    await toolInvocations.queueInvocation({
      toolCallId: 'tool-call.chess.1',
      conversationId: 'conversation.1',
      appSessionId: 'app-session.chess.1',
      userId: 'user.1',
      appId: 'chess.internal',
      toolName: 'chess.launch-game',
      invocationMode: 'embedded-bridge',
      authRequirement: 'platform-session',
      requestPayloadJson: {
        mode: 'analysis',
      },
    })

    const result = await assembler.buildContext({
      conversationId: 'conversation.1',
      availableToolNamesByAppId: {
        'chess.internal': ['chess.launch-game'],
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.activeApp?.appSessionId).toBe('app-session.chess.1')
    expect(result.value.activeApp?.availableToolNames).toEqual(['chess.launch-game'])
    expect(result.value.recentCompletions[0].appSessionId).toBe('app-session.flashcards.1')
    expect(result.value.sessionTimeline.map((session) => session.appSessionId)).toEqual([
      'app-session.chess.1',
      'app-session.flashcards.1',
    ])
    expect(result.value.notes).toContain('Active app tool "chess.launch-game" is currently "queued".')
  })

  it('keeps multi-app timelines bounded and reports omissions', async () => {
    const { conversations, appSessions, assembler } = createFixture()

    await conversations.createConversation({
      conversationId: 'conversation.2',
      userId: 'user.2',
    })

    for (const sessionId of ['1', '2', '3', '4']) {
      await appSessions.createSession({
        appSessionId: `app-session.${sessionId}`,
        conversationId: 'conversation.2',
        appId: `app.${sessionId}`,
        launchReason: 'manual-open',
        authState: 'not-required',
        status: sessionId === '4' ? 'active' : 'completed',
        completedAt: sessionId === '4' ? undefined : `2026-04-01T12:0${sessionId}:30.000Z`,
        latestSequence: Number(sessionId),
        latestSnapshot: {
          sequence: Number(sessionId),
          capturedAt: `2026-04-01T12:0${sessionId}:00.000Z`,
          status: sessionId === '4' ? 'active' : 'completed',
          summary: `Session ${sessionId} summary.`,
          stateDigest: {
            ordinal: Number(sessionId),
          },
        },
        completion:
          sessionId === '4'
            ? undefined
            : {
                ...exampleFlashcardsCompletionSignal,
                appSessionId: `app-session.${sessionId}`,
                appId: `app.${sessionId}`,
                conversationId: 'conversation.2',
                startedAt: `2026-04-01T12:0${sessionId}:00.000Z`,
                completedAt: `2026-04-01T12:0${sessionId}:30.000Z`,
                resultSummary: `Completed session ${sessionId}.`,
              },
      })
    }

    await conversations.setActiveAppSessionReference({
      conversationId: 'conversation.2',
      activeAppSessionId: 'app-session.4',
    })

    const result = await assembler.buildContext({
      conversationId: 'conversation.2',
      maxSessionTimeline: 2,
      maxRecentCompletions: 1,
      includeInvocationNotes: false,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.selection.omittedSessionCount).toBe(2)
    expect(result.value.selection.includedSessionIds).toEqual(['app-session.4', 'app-session.3'])
    expect(result.value.recentCompletions).toHaveLength(1)
    expect(result.value.notes).toContain('Omitted 2 older app sessions from the assembled context.')
  })

  it('returns a normalized failure for missing conversations', async () => {
    const { assembler } = createFixture()

    const result = await assembler.buildContext({
      conversationId: 'missing-conversation',
    })

    expect(result).toEqual({
      ok: false,
      domain: 'app-context',
      code: 'conversation-not-found',
      message: 'Conversation "missing-conversation" was not found.',
      details: undefined,
      retryable: false,
    })
  })
})
