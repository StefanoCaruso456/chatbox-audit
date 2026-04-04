import { exampleChessGetBoardStateToolSchema, exampleChessLaunchToolSchema } from '@shared/contracts/v1'
import { createMessage } from '@shared/types'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetSidebarAppRuntimeSnapshots, upsertSidebarAppRuntimeSnapshot } from '@/stores/sidebarAppRuntimeStore'
import { deriveConversationAppContext, routeTutorMeAiAppRequest } from './orchestrator'

describe('routeTutorMeAiAppRequest', () => {
  beforeEach(() => {
    resetSidebarAppRuntimeSnapshots()
  })

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

    const flashcardsPart = result.message.contentParts.find(
      (part) => part.type === 'embedded-app' && part.appId === 'flashcards.public'
    )

    expect(flashcardsPart).toBeTruthy()
    expect(
      flashcardsPart && flashcardsPart.type === 'embedded-app' ? flashcardsPart.bridge?.bootstrap?.initialState : null
    ).toMatchObject({
      toolArguments: {
        topic: 'fractions',
      },
    })
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

  it('uses the live chess board state for strategy follow-ups without relaunching the app', async () => {
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
            grantedPermissions: ['session:read', 'session:write', 'tool:invoke'],
            initialState: {
              fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
              turn: 'w',
              moveCount: 2,
              lastMove: 'e5',
            },
            availableTools: [exampleChessLaunchToolSchema, exampleChessGetBoardStateToolSchema],
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

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    expect(result.message.contentParts.some((part) => part.type === 'embedded-app')).toBe(false)
    expect(
      result.message.contentParts.find((part) => part.type === 'tool-call' && part.toolName === 'chess.get-board-state')
    ).toBeTruthy()
  })

  it('returns the live chess board state for board-analysis follow-ups instead of relaunching the app', async () => {
    const priorAssistant = createMessage('assistant', 'Launching Chess Tutor in the right sidebar.')
    priorAssistant.contentParts = [
      {
        type: 'embedded-app',
        appId: 'chess.internal',
        appName: 'Chess Tutor',
        appSessionId: 'app-session.chess.7',
        sourceUrl: 'http://localhost:1212/embedded-apps/chess',
        title: 'Chess Tutor',
        summary: 'Current board FEN: rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2. White to move.',
        status: 'ready',
        allowedOrigin: 'http://localhost:1212',
        bridge: {
          expectedOrigin: 'http://localhost:1212',
          conversationId: 'conversation.7',
          appSessionId: 'app-session.chess.7',
          bootstrap: {
            launchReason: 'chat-tool',
            authState: 'connected',
            grantedPermissions: ['session:read', 'session:write', 'tool:invoke'],
            initialState: {
              fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
              turn: 'w',
              moveCount: 2,
              lastMove: 'e5',
            },
            availableTools: [exampleChessLaunchToolSchema, exampleChessGetBoardStateToolSchema],
          },
        },
      },
    ]

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.7',
      userId: 'user.7',
      userRequest: 'analyze the current chess board',
      requestMessageId: 'message.7',
      previousMessages: [createMessage('user', "let's play chess"), priorAssistant],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    expect(result.message.contentParts.some((part) => part.type === 'embedded-app')).toBe(false)

    const toolPart = result.message.contentParts.find((part) => part.type === 'tool-call')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.toolName : null).toBe('chess.get-board-state')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.state : null).toBe('result')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.result : null).toMatchObject({
      appSessionId: 'app-session.chess.7',
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      turn: 'white',
      moveCount: 2,
      lastMove: 'e5',
      legalMoveCount: 29,
      moveExecutionAvailable: false,
    })

    expect(
      result.message.contentParts.find((part) => part.type === 'text' && part.text.includes('Current live Chess board'))
    ).toBeTruthy()
    expect(
      result.message.contentParts.find(
        (part) => part.type === 'text' && part.text.includes('Recommended next move:')
      )
    ).toBeTruthy()
  })

  it('stops move requests from pretending the live chess board changed when move execution is not wired yet', async () => {
    const priorAssistant = createMessage('assistant', 'Launching Chess Tutor in the right sidebar.')
    priorAssistant.contentParts = [
      {
        type: 'embedded-app',
        appId: 'chess.internal',
        appName: 'Chess Tutor',
        appSessionId: 'app-session.chess.8',
        sourceUrl: 'http://localhost:1212/embedded-apps/chess',
        title: 'Chess Tutor',
        summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w. White to move.',
        status: 'ready',
        allowedOrigin: 'http://localhost:1212',
        bridge: {
          expectedOrigin: 'http://localhost:1212',
          conversationId: 'conversation.8',
          appSessionId: 'app-session.chess.8',
          bootstrap: {
            launchReason: 'chat-tool',
            authState: 'connected',
            grantedPermissions: ['session:read', 'session:write', 'tool:invoke'],
            initialState: {
              fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
              turn: 'w',
              moveCount: 0,
            },
            availableTools: [exampleChessLaunchToolSchema, exampleChessGetBoardStateToolSchema],
          },
        },
      },
    ]

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.8',
      userId: 'user.8',
      userRequest: 'move any white piece now',
      requestMessageId: 'message.8',
      previousMessages: [createMessage('user', "let's play chess"), priorAssistant],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    expect(result.message.contentParts.some((part) => part.type === 'embedded-app')).toBe(false)
    expect(
      result.message.contentParts.find(
        (part) => part.type === 'text' && part.text.includes('direct move execution from chat is not wired yet')
      )
    ).toBeTruthy()
  })

  it('reads the live Chess board from the active sidebar runtime when the board was opened outside chat', async () => {
    upsertSidebarAppRuntimeSnapshot({
      hostSessionId: 'conversation.sidebar.9',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess',
      conversationId: 'conversation.sidebar.chess-tutor',
      expectedOrigin: 'http://localhost:1212',
      sourceUrl: 'http://localhost:1212/embedded-apps/chess?chatbridge_panel=1',
      authState: 'connected',
      availableToolNames: ['chess.launch-game', 'chess.get-board-state'],
      status: 'active',
      summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1. White to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      updatedAt: '2026-04-04T05:25:00.000Z',
    })

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.sidebar.9',
      userId: 'user.9',
      userRequest: 'move some of the pieces on the board',
      requestMessageId: 'message.9',
      previousMessages: [createMessage('user', 'hello')],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    const toolPart = result.message.contentParts.find((part) => part.type === 'tool-call')
    const textPart = result.message.contentParts.find((part) => part.type === 'text')

    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.toolName : null).toBe('chess.get-board-state')
    expect(textPart && textPart.type === 'text' ? textPart.text : '').toContain(
      'direct move execution from chat is not wired yet'
    )
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
