import { createMessage } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { deriveConversationAppContext, routeTutorMeAiAppRequest } from './orchestrator'

describe('routeTutorMeAiAppRequest', () => {
  it('launches chess for a clear play request', async () => {
    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.1',
      userId: 'user.1',
      userRequest: "let's play chess",
      requestMessageId: 'message.1',
      previousMessages: [createMessage('user', 'Hello')],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    expect(
      result.message.contentParts.some((part) => part.type === 'embedded-app' && part.appId === 'chess.internal')
    ).toBe(true)
  })

  it('launches flashcards for explicit study requests', async () => {
    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.2',
      userId: 'user.2',
      userRequest: 'start flashcards on fractions',
      requestMessageId: 'message.2',
      previousMessages: [createMessage('user', 'Hello')],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    expect(
      result.message.contentParts.some((part) => part.type === 'embedded-app' && part.appId === 'flashcards.public')
    ).toBe(true)
  })

  it('opens the authenticated planner app in connect-required mode when auth is missing', async () => {
    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.3',
      userId: 'user.3',
      userRequest: 'open planner for overdue work',
      requestMessageId: 'message.3',
      previousMessages: [createMessage('user', 'Hello')],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    const plannerPart = result.message.contentParts.find(
      (part) => part.type === 'embedded-app' && part.appId === 'planner.oauth'
    )

    expect(plannerPart && plannerPart.type === 'embedded-app' ? plannerPart.bridge?.bootstrap?.authState : null).toBe(
      'required'
    )
  })

  it('asks a clarifying question for generic app requests', async () => {
    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.4',
      userId: 'user.4',
      userRequest: 'open an app for me',
      requestMessageId: 'message.4',
      previousMessages: [createMessage('user', 'Hello')],
    })

    expect(result.kind).toBe('clarify')
  })

  it('passes through normal chat follow-ups without relaunching an app', async () => {
    const priorAssistant = createMessage('assistant', 'Launching Chess Tutor in the right sidebar.')
    priorAssistant.contentParts = [
      {
        type: 'embedded-app',
        appId: 'chess.internal',
        appName: 'Chess Tutor',
        appSessionId: 'app-session.chess.1',
        sourceUrl: 'http://localhost:1212/embedded-apps/chess',
        title: 'Chess Tutor',
        summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w',
        status: 'ready',
        allowedOrigin: 'http://localhost:1212',
        bridge: {
          expectedOrigin: 'http://localhost:1212',
          conversationId: 'conversation.5',
          appSessionId: 'app-session.chess.1',
          bootstrap: {
            launchReason: 'chat-tool',
            authState: 'connected',
            grantedPermissions: ['session:write', 'tool:invoke'],
            availableTools: [],
          },
        },
      },
    ]

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.5',
      userId: 'user.5',
      userRequest: 'what should I do here?',
      requestMessageId: 'message.5',
      previousMessages: [createMessage('user', "let's play chess"), priorAssistant],
    })

    expect(result.kind).toBe('pass-through')
  })

  it('keeps the latest unfinished app active when a later completed app exists', () => {
    const activeChess = createMessage('assistant', 'Chess Tutor is active.')
    activeChess.timestamp = Date.parse('2026-04-01T12:00:00.000Z')
    activeChess.contentParts = [
      {
        type: 'embedded-app',
        appId: 'chess.internal',
        appName: 'Chess Tutor',
        appSessionId: 'app-session.chess.1',
        sourceUrl: 'http://localhost:1212/embedded-apps/chess',
        title: 'Chess Tutor',
        summary: 'White is evaluating the next move.',
        status: 'ready',
        allowedOrigin: 'http://localhost:1212',
        bridge: {
          expectedOrigin: 'http://localhost:1212',
          conversationId: 'conversation.multi',
          appSessionId: 'app-session.chess.1',
          pendingInvocation: {
            toolCallId: 'tool-call.chess.1',
            toolName: 'chess.launch-game',
          },
          bootstrap: {
            launchReason: 'chat-tool',
            authState: 'connected',
            availableTools: [],
          },
        },
      },
    ]

    const completedFlashcards = createMessage('assistant', 'Flashcards Coach finished.')
    completedFlashcards.timestamp = Date.parse('2026-04-01T12:02:00.000Z')
    completedFlashcards.contentParts = [
      {
        type: 'embedded-app',
        appId: 'flashcards.public',
        appName: 'Flashcards Coach',
        appSessionId: 'app-session.flashcards.1',
        sourceUrl: 'http://localhost:1212/embedded-apps/flashcards',
        title: 'Flashcards Coach',
        summary: 'Flashcard deck ready for discussion.',
        status: 'ready',
        allowedOrigin: 'http://localhost:1212',
        bridge: {
          expectedOrigin: 'http://localhost:1212',
          conversationId: 'conversation.multi',
          appSessionId: 'app-session.flashcards.1',
          bootstrap: {
            launchReason: 'chat-tool',
            authState: 'connected',
            availableTools: [],
          },
          completion: {
            status: 'succeeded',
            resultSummary: 'Flashcard deck ready for discussion.',
            result: {
              topic: 'fractions',
            },
          },
        },
      },
    ]

    const context = deriveConversationAppContext(
      'conversation.multi',
      [createMessage('user', 'launch chess'), activeChess, completedFlashcards],
      '2026-04-01T12:03:00.000Z'
    )

    expect(context?.activeApp?.appId).toBe('chess.internal')
    expect(context?.recentCompletions).toHaveLength(1)
    expect(context?.recentCompletions[0]?.appId).toBe('flashcards.public')
    expect(context?.sessionTimeline.map((session) => session.appSessionId)).toEqual([
      'app-session.chess.1',
      'app-session.flashcards.1',
    ])
    expect(context?.selection.strategy).toBe('active-plus-recent-completions')
    expect(context?.selection.includedSessionIds).toEqual(['app-session.chess.1', 'app-session.flashcards.1'])
    expect(context?.notes?.[0]).toContain('Multiple app sessions')
  })

  it('prioritizes an explicitly referenced app over a newer active app', () => {
    const completedFlashcards = createMessage('assistant', 'Flashcards Coach finished.')
    completedFlashcards.timestamp = Date.parse('2026-04-01T12:02:00.000Z')
    completedFlashcards.contentParts = [
      {
        type: 'embedded-app',
        appId: 'flashcards.public',
        appName: 'Flashcards Coach',
        appSessionId: 'app-session.flashcards.2',
        sourceUrl: 'http://localhost:1212/embedded-apps/flashcards',
        title: 'Flashcards Coach',
        summary: 'Flashcard deck ready for discussion.',
        status: 'ready',
        bridge: {
          expectedOrigin: 'http://localhost:1212',
          conversationId: 'conversation.multi.2',
          appSessionId: 'app-session.flashcards.2',
          bootstrap: {
            launchReason: 'chat-tool',
            authState: 'connected',
            availableTools: [],
          },
          completion: {
            status: 'succeeded',
            resultSummary: 'Flashcard deck ready for discussion.',
            result: {
              topic: 'fractions',
            },
          },
        },
      },
    ]

    const activePlanner = createMessage('assistant', 'Planner Connect is active.')
    activePlanner.timestamp = Date.parse('2026-04-01T12:04:00.000Z')
    activePlanner.contentParts = [
      {
        type: 'embedded-app',
        appId: 'planner.oauth',
        appName: 'Planner Connect',
        appSessionId: 'app-session.planner.2',
        sourceUrl: 'http://localhost:1212/embedded-apps/planner',
        title: 'Planner Connect',
        summary: 'Planner is active.',
        status: 'ready',
        bridge: {
          expectedOrigin: 'http://localhost:1212',
          conversationId: 'conversation.multi.2',
          appSessionId: 'app-session.planner.2',
          pendingInvocation: {
            toolCallId: 'tool-call.planner.2',
            toolName: 'planner.open-dashboard',
          },
          bootstrap: {
            launchReason: 'chat-tool',
            authState: 'connected',
            availableTools: [],
          },
        },
      },
    ]

    const context = deriveConversationAppContext(
      'conversation.multi.2',
      [createMessage('user', 'open flashcards'), completedFlashcards, activePlanner],
      '2026-04-01T12:05:00.000Z',
      'What did the flashcards app say about fractions?'
    )

    expect(context?.activeApp?.appId).toBe('planner.oauth')
    expect(context?.recentCompletions[0]?.appId).toBe('flashcards.public')
    expect(context?.notes?.some((note) => note.includes('flashcards.public'))).toBe(true)
  })
})
