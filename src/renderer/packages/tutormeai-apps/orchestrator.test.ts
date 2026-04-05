import {
  exampleChessGetBoardStateToolSchema,
  exampleChessLaunchToolSchema,
  exampleChessMakeMoveToolSchema,
} from '@shared/contracts/v1'
import { createMessage } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyChessSessionMove,
  initializeChessSession,
  resetChessSessions,
} from '@/stores/chessSessionStore'
import { resetSidebarAppRuntimeSnapshots, upsertSidebarAppRuntimeSnapshot } from '@/stores/sidebarAppRuntimeStore'
import { uiStore } from '@/stores/uiStore'
import { deriveConversationAppContext, routeTutorMeAiAppRequest } from './orchestrator'

const { mockEnqueueSidebarAppRuntimeCommand } = vi.hoisted(() => ({
  mockEnqueueSidebarAppRuntimeCommand: vi.fn(),
}))

vi.hoisted(() => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
      clear: () => {
        storage.clear()
      },
    },
    configurable: true,
  })
})

vi.mock('@/stores/sidebarAppRuntimeCommandStore', () => ({
  enqueueSidebarAppRuntimeCommand: (...args: unknown[]) => mockEnqueueSidebarAppRuntimeCommand(...args),
}))

describe('routeTutorMeAiAppRequest', () => {
  beforeEach(() => {
    resetSidebarAppRuntimeSnapshots()
    resetChessSessions()
    mockEnqueueSidebarAppRuntimeCommand.mockReset()
    uiStore.setState({ activeApprovedAppId: null })
    mockEnqueueSidebarAppRuntimeCommand.mockResolvedValue({
      ok: true,
      command: {
        hostSessionId: 'conversation.sidebar.9',
        runtimeAppId: 'chess.internal',
        appSessionId: 'app-session.sidebar.chess',
        toolCallId: 'tool-call.chess.make-move.mock',
        toolName: 'chess.make-move',
        arguments: {
          move: 'd4',
          expectedFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        },
        createdAt: '2026-04-04T05:25:00.000Z',
      },
      completion: {
        version: 'v1',
        conversationId: 'conversation.sidebar.9',
        appSessionId: 'app-session.sidebar.chess',
        appId: 'chess.internal',
        toolCallId: 'tool-call.chess.make-move.mock',
        status: 'succeeded',
        resultSummary: 'Move played: d4. Black to move.',
        result: {
          appSessionId: 'app-session.sidebar.chess',
          requestedMove: 'd4',
          appliedMove: 'd4',
          fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
          turn: 'black',
          moveCount: 1,
          lastMove: 'd4',
          legalMoveCount: 20,
          candidateMoves: ['d5', 'e5'],
          summary: 'Move played: d4. Black to move.',
          explanation: 'It claims central space and opens lines for your pieces.',
          moveExecutionAvailable: true,
        },
        completedAt: '2026-04-04T05:25:02.000Z',
        followUpContext: {
          summary: 'Use the updated live chess board to recommend the best next move from this position.',
        },
      },
    })
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
            availableTools: [exampleChessLaunchToolSchema, exampleChessGetBoardStateToolSchema, exampleChessMakeMoveToolSchema],
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
            availableTools: [exampleChessLaunchToolSchema, exampleChessGetBoardStateToolSchema, exampleChessMakeMoveToolSchema],
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
      moveExecutionAvailable: true,
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

  it('moves the live chess board from chat when a sidebar chess session is active', async () => {
    upsertSidebarAppRuntimeSnapshot({
      hostSessionId: 'conversation.8',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess.8',
      conversationId: 'conversation.sidebar.chess-tutor',
      expectedOrigin: 'http://localhost:1212',
      sourceUrl: 'http://localhost:1212/embedded-apps/chess?chatbridge_panel=1',
      authState: 'connected',
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
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
      conversationId: 'conversation.8',
      userId: 'user.8',
      userRequest: 'move any white piece now',
      requestMessageId: 'message.8',
      previousMessages: [createMessage('user', "let's play chess")],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    expect(result.message.contentParts.some((part) => part.type === 'embedded-app')).toBe(false)
    const toolPart = result.message.contentParts.find((part) => part.type === 'tool-call')
    const textPart = result.message.contentParts.find((part) => part.type === 'text')

    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.toolName : null).toBe('chess.make-move')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.result : null).toMatchObject({
      requestedMove: 'd4',
      appliedMove: 'd4',
      turn: 'black',
      moveExecutionAvailable: true,
    })
    expect(textPart && textPart.type === 'text' ? textPart.text : '').toContain('Move played: d4')
    expect(mockEnqueueSidebarAppRuntimeCommand).toHaveBeenCalledTimes(1)
  })

  it('plays the last structured chess recommendation when the user says play it', async () => {
    upsertSidebarAppRuntimeSnapshot({
      hostSessionId: 'conversation.8.follow-up',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess.8.follow-up',
      conversationId: 'conversation.sidebar.chess-tutor',
      expectedOrigin: 'http://localhost:1212',
      sourceUrl: 'http://localhost:1212/embedded-apps/chess?chatbridge_panel=1',
      authState: 'connected',
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      status: 'active',
      summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1. White to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      updatedAt: '2026-04-04T05:30:00.000Z',
    })

    const priorRecommendation = createMessage('assistant')
    priorRecommendation.contentParts = [
      {
        type: 'tool-call',
        state: 'result',
        toolCallId: 'tool-call.chess.get-board-state.recommendation',
        toolName: 'chess.get-board-state',
        args: {
          scope: 'current-position',
        },
        result: {
          appSessionId: 'app-session.sidebar.chess.8.follow-up',
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          turn: 'white',
          moveCount: 0,
          lastMove: 'No moves yet',
          legalMoveCount: 20,
          legalMoves: ['d4', 'e4'],
          candidateMoves: ['d4', 'e4'],
          phase: 'opening',
          status: 'Position is stable',
          summary: 'Current live Chess board: White to move.',
          moveExecutionAvailable: true,
        },
      },
    ]

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.8.follow-up',
      userId: 'user.8.follow-up',
      userRequest: 'play it',
      requestMessageId: 'message.8.follow-up',
      previousMessages: [createMessage('user', 'what should I move?'), priorRecommendation],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    const toolPart = result.message.contentParts.find((part) => part.type === 'tool-call')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.toolName : null).toBe('chess.make-move')
    expect(mockEnqueueSidebarAppRuntimeCommand).toHaveBeenCalledTimes(1)
    expect(mockEnqueueSidebarAppRuntimeCommand.mock.calls[0]?.[0]).toMatchObject({
      arguments: {
        move: 'd4',
        expectedFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
    })
  })

  it('plays the last plain-text chess recommendation when the user says do it now', async () => {
    upsertSidebarAppRuntimeSnapshot({
      hostSessionId: 'conversation.8.plain-text-follow-up',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess.8.plain-text-follow-up',
      conversationId: 'conversation.sidebar.chess-tutor',
      expectedOrigin: 'http://localhost:1212',
      sourceUrl: 'http://localhost:1212/embedded-apps/chess?chatbridge_panel=1',
      authState: 'connected',
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      status: 'active',
      summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/3P4/PPP1PPPP/RNBQKBNR b KQkq - 0 1. Black to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/3P4/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
        turn: 'b',
        moveCount: 1,
        lastMove: 'd3',
      },
      updatedAt: '2026-04-04T05:31:00.000Z',
    })

    mockEnqueueSidebarAppRuntimeCommand.mockResolvedValueOnce({
      ok: true,
      command: {
        hostSessionId: 'conversation.8.plain-text-follow-up',
        runtimeAppId: 'chess.internal',
        appSessionId: 'app-session.sidebar.chess.8.plain-text-follow-up',
        toolCallId: 'tool-call.chess.make-move.plain-text-follow-up',
        toolName: 'chess.make-move',
        arguments: {
          move: 'g8f6',
          expectedFen: 'rnbqkbnr/pppppppp/8/8/8/3P4/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
        },
        createdAt: '2026-04-04T05:31:02.000Z',
      },
      completion: {
        version: 'v1',
        conversationId: 'conversation.8.plain-text-follow-up',
        appSessionId: 'app-session.sidebar.chess.8.plain-text-follow-up',
        appId: 'chess.internal',
        toolCallId: 'tool-call.chess.make-move.plain-text-follow-up',
        status: 'succeeded',
        resultSummary: 'Move played: Nf6. White to move.',
        result: {
          appSessionId: 'app-session.sidebar.chess.8.plain-text-follow-up',
          requestedMove: 'g8f6',
          appliedMove: 'Nf6',
          fen: 'rnbqkb1r/pppppppp/5n2/8/8/3P4/PPP1PPPP/RNBQKBNR w KQkq - 1 2',
          turn: 'white',
          moveCount: 2,
          lastMove: 'Nf6',
          legalMoveCount: 27,
          candidateMoves: ['e4', 'Nf3'],
          summary: 'Move played: Nf6. White to move.',
          explanation: 'It develops a knight toward the center while keeping options flexible.',
          moveExecutionAvailable: true,
        },
        completedAt: '2026-04-04T05:31:05.000Z',
        followUpContext: {
          summary: 'Use the updated live chess board to recommend the best next move from this position.',
        },
      },
    })

    const priorRecommendation = createMessage(
      'assistant',
      "I'll play a developing move for Black:\n\n...Ng8-f6\n\nThat's a standard, flexible move."
    )

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.8.plain-text-follow-up',
      userId: 'user.8.plain-text-follow-up',
      userRequest: 'do it now',
      requestMessageId: 'message.8.plain-text-follow-up',
      previousMessages: [createMessage('user', 'what should black do?'), priorRecommendation],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    const toolPart = result.message.contentParts.find((part) => part.type === 'tool-call')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.toolName : null).toBe('chess.make-move')
    expect(mockEnqueueSidebarAppRuntimeCommand).toHaveBeenCalledTimes(1)
    expect(mockEnqueueSidebarAppRuntimeCommand.mock.calls[0]?.[0]).toMatchObject({
      arguments: {
        move: 'g8f6',
        expectedFen: 'rnbqkbnr/pppppppp/8/8/8/3P4/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
      },
    })
  })

  it('asks for an explicit move when the user says do it now without a prior chess recommendation', async () => {
    upsertSidebarAppRuntimeSnapshot({
      hostSessionId: 'conversation.8.no-recommendation',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess.8.no-recommendation',
      conversationId: 'conversation.sidebar.chess-tutor',
      expectedOrigin: 'http://localhost:1212',
      sourceUrl: 'http://localhost:1212/embedded-apps/chess?chatbridge_panel=1',
      authState: 'connected',
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      status: 'active',
      summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1. White to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      updatedAt: '2026-04-04T05:32:00.000Z',
    })

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.8.no-recommendation',
      userId: 'user.8.no-recommendation',
      userRequest: 'do it now',
      requestMessageId: 'message.8.no-recommendation',
      previousMessages: [createMessage('user', "let's play chess"), createMessage('assistant', 'Sure, ready when you are.')],
    })

    expect(result.kind).toBe('clarify')
    if (result.kind !== 'clarify') {
      return
    }

    const textPart = result.message.contentParts.find((part) => part.type === 'text')
    expect(textPart && textPart.type === 'text' ? textPart.text : '').toContain('Say the move explicitly')
    expect(mockEnqueueSidebarAppRuntimeCommand).not.toHaveBeenCalled()
  })

  it('treats alternative-follow-up questions as board analysis instead of replaying the named move', async () => {
    upsertSidebarAppRuntimeSnapshot({
      hostSessionId: 'conversation.8.alternatives',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess.8.alternatives',
      conversationId: 'conversation.sidebar.chess-tutor',
      expectedOrigin: 'http://localhost:1212',
      sourceUrl: 'http://localhost:1212/embedded-apps/chess?chatbridge_panel=1',
      authState: 'connected',
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      status: 'active',
      summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1. White to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      updatedAt: '2026-04-04T05:33:00.000Z',
    })

    initializeChessSession({
      conversationId: 'conversation.8.alternatives',
      appSessionId: 'app-session.sidebar.chess.8.alternatives',
      fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
      moveCount: 1,
      lastMove: 'd4',
      status: 'active',
    })

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.8.alternatives',
      userId: 'user.8.alternatives',
      userRequest: 'What were the top 2 alternatives to d4 here, and what were their tradeoffs?',
      requestMessageId: 'message.8.alternatives',
      previousMessages: [createMessage('assistant', 'Move played: d4. Black to move.')],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    const toolPart = result.message.contentParts.find((part) => part.type === 'tool-call')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.toolName : null).toBe('chess.get-board-state')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.result : null).toMatchObject({
      appSessionId: 'app-session.sidebar.chess.8.alternatives',
      turn: 'black',
      lastMove: 'd4',
      moveCount: 1,
    })
    expect(mockEnqueueSidebarAppRuntimeCommand).not.toHaveBeenCalled()
  })

  it('uses the live shared chess session for strategy prompts even in a clean chat thread', async () => {
    initializeChessSession({
      conversationId: 'conversation.8.clean-thread',
      appSessionId: 'app-session.sidebar.chess.8.clean-thread',
      fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
      moveCount: 1,
      lastMove: 'd4',
      status: 'active',
    })
    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.8.clean-thread',
      userId: 'user.8.clean-thread',
      userRequest: 'What should Black play here? Teach the idea first, then recommend the best move.',
      requestMessageId: 'message.8.clean-thread',
      previousMessages: [createMessage('user', 'What should White play on the current board?')],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    const toolPart = result.message.contentParts.find((part) => part.type === 'tool-call')
    const textPart = result.message.contentParts.find((part) => part.type === 'text')

    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.toolName : null).toBe('chess.get-board-state')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.result : null).toMatchObject({
      appSessionId: 'app-session.sidebar.chess.8.clean-thread',
      turn: 'black',
      lastMove: 'd4',
      moveCount: 1,
    })
    expect(textPart && textPart.type === 'text' ? textPart.text : '').toContain('Black to move')
    expect(mockEnqueueSidebarAppRuntimeCommand).not.toHaveBeenCalled()
  })

  it('reads the current live chess position from the shared session when the sidebar snapshot is stale', async () => {
    upsertSidebarAppRuntimeSnapshot({
      hostSessionId: 'conversation.shared.live-board',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.shared-live-board',
      conversationId: 'conversation.sidebar.chess-tutor',
      expectedOrigin: 'http://localhost:1212',
      sourceUrl: 'http://localhost:1212/embedded-apps/chess?chatbridge_panel=1',
      authState: 'connected',
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      status: 'active',
      summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1. White to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      updatedAt: '2026-04-04T06:40:00.000Z',
    })

    initializeChessSession({
      conversationId: 'conversation.shared.live-board',
      appSessionId: 'app-session.sidebar.shared-live-board',
      fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
      moveCount: 1,
      lastMove: 'd4',
      status: 'active',
    })

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.shared.live-board',
      userId: 'user.shared.live-board',
      userRequest: 'what is the best move on the current board right now?',
      requestMessageId: 'message.shared.live-board',
      previousMessages: [createMessage('user', "let's play chess")],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    const toolPart = result.message.contentParts.find((part) => part.type === 'tool-call')
    const textPart = result.message.contentParts.find((part) => part.type === 'text')

    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.toolName : null).toBe('chess.get-board-state')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.result : null).toMatchObject({
      appSessionId: 'app-session.sidebar.shared-live-board',
      fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
      turn: 'black',
      moveCount: 1,
      lastMove: 'd4',
      moveExecutionAvailable: true,
    })
    expect(textPart && textPart.type === 'text' ? textPart.text : '').toContain('Black to move')
    expect(mockEnqueueSidebarAppRuntimeCommand).not.toHaveBeenCalled()
  })

  it('answers last-piece questions from live chess history instead of making a new move', async () => {
    upsertSidebarAppRuntimeSnapshot({
      hostSessionId: 'conversation.shared.history-piece',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.shared-history-piece',
      conversationId: 'conversation.sidebar.chess-tutor',
      expectedOrigin: 'http://localhost:1212',
      sourceUrl: 'http://localhost:1212/embedded-apps/chess?chatbridge_panel=1',
      authState: 'connected',
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      status: 'active',
      summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1. White to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      updatedAt: '2026-04-04T07:32:00.000Z',
    })

    initializeChessSession({
      conversationId: 'conversation.shared.history-piece',
      appSessionId: 'app-session.sidebar.shared-history-piece',
      status: 'active',
    })

    for (const move of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']) {
      const appliedMove = applyChessSessionMove({
        conversationId: 'conversation.shared.history-piece',
        appSessionId: 'app-session.sidebar.shared-history-piece',
        requestedMove: move,
      })
      expect(appliedMove.ok).toBe(true)
    }

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.shared.history-piece',
      userId: 'user.shared.history-piece',
      userRequest: 'what was the last piece that you moved',
      requestMessageId: 'message.shared.history-piece',
      previousMessages: [createMessage('user', "let's play chess")],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    const toolPart = result.message.contentParts.find((part) => part.type === 'tool-call')
    const textPart = result.message.contentParts.find((part) => part.type === 'text')

    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.toolName : null).toBe('chess.get-board-state')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.result : null).toMatchObject({
      appSessionId: 'app-session.sidebar.shared-history-piece',
      lastMove: 'Bb5',
      moveHistory: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
    })
    expect(textPart && textPart.type === 'text' ? textPart.text : '').toContain(
      'The last move on the live Chess board was Bb5, so the last piece moved was a bishop.'
    )
    expect(mockEnqueueSidebarAppRuntimeCommand).not.toHaveBeenCalled()
  })

  it('lists the last five moves from the live chess history when asked', async () => {
    upsertSidebarAppRuntimeSnapshot({
      hostSessionId: 'conversation.shared.history-list',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.shared-history-list',
      conversationId: 'conversation.sidebar.chess-tutor',
      expectedOrigin: 'http://localhost:1212',
      sourceUrl: 'http://localhost:1212/embedded-apps/chess?chatbridge_panel=1',
      authState: 'connected',
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      status: 'active',
      summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1. White to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      updatedAt: '2026-04-04T07:33:00.000Z',
    })

    initializeChessSession({
      conversationId: 'conversation.shared.history-list',
      appSessionId: 'app-session.sidebar.shared-history-list',
      status: 'active',
    })

    for (const move of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']) {
      const appliedMove = applyChessSessionMove({
        conversationId: 'conversation.shared.history-list',
        appSessionId: 'app-session.sidebar.shared-history-list',
        requestedMove: move,
      })
      expect(appliedMove.ok).toBe(true)
    }

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.shared.history-list',
      userId: 'user.shared.history-list',
      userRequest: 'give me a list of the last five moves you made',
      requestMessageId: 'message.shared.history-list',
      previousMessages: [createMessage('user', "let's play chess")],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    const toolPart = result.message.contentParts.find((part) => part.type === 'tool-call')
    const textPart = result.message.contentParts.find((part) => part.type === 'text')

    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.toolName : null).toBe('chess.get-board-state')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.result : null).toMatchObject({
      appSessionId: 'app-session.sidebar.shared-history-list',
      lastMove: 'a6',
      moveHistory: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'],
    })
    expect(textPart && textPart.type === 'text' ? textPart.text : '').toContain(
      'The last 5 moves on the live Chess board are: e5, Nf3, Nc6, Bb5, a6.'
    )
    expect(mockEnqueueSidebarAppRuntimeCommand).not.toHaveBeenCalled()
  })

  it('uses the shared live chess session for explicit follow-up moves when the sidebar snapshot is stale', async () => {
    upsertSidebarAppRuntimeSnapshot({
      hostSessionId: 'conversation.shared.follow-up',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.shared-follow-up',
      conversationId: 'conversation.sidebar.chess-tutor',
      expectedOrigin: 'http://localhost:1212',
      sourceUrl: 'http://localhost:1212/embedded-apps/chess?chatbridge_panel=1',
      authState: 'connected',
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      status: 'active',
      summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1. White to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      updatedAt: '2026-04-04T06:41:00.000Z',
    })

    initializeChessSession({
      conversationId: 'conversation.shared.follow-up',
      appSessionId: 'app-session.sidebar.shared-follow-up',
      fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
      moveCount: 1,
      lastMove: 'd4',
      status: 'active',
    })

    mockEnqueueSidebarAppRuntimeCommand.mockResolvedValueOnce({
      ok: true,
      command: {
        hostSessionId: 'conversation.shared.follow-up',
        runtimeAppId: 'chess.internal',
        appSessionId: 'app-session.sidebar.shared-follow-up',
        toolCallId: 'tool-call.chess.make-move.follow-up',
        toolName: 'chess.make-move',
        arguments: {
          move: 'c5',
          expectedFen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
        },
        createdAt: '2026-04-04T06:41:03.000Z',
      },
      completion: {
        version: 'v1',
        conversationId: 'conversation.shared.follow-up',
        appSessionId: 'app-session.sidebar.shared-follow-up',
        appId: 'chess.internal',
        toolCallId: 'tool-call.chess.make-move.follow-up',
        status: 'succeeded',
        resultSummary: 'Move played: c5. White to move.',
        result: {
          appSessionId: 'app-session.sidebar.shared-follow-up',
          requestedMove: 'c5',
          appliedMove: 'c5',
          fen: 'rnbqkbnr/pp1ppppp/8/2p5/3P4/8/PPP1PPPP/RNBQKBNR w KQkq c6 0 2',
          turn: 'white',
          moveCount: 2,
          lastMove: 'c5',
          legalMoveCount: 28,
          candidateMoves: ['e4', 'c3', 'Nc3', 'Nf3', 'a3', 'a4'],
          summary: 'Move played: c5. White to move.',
          explanation: 'It claims central space and challenges White in the center.',
          moveExecutionAvailable: true,
        },
        completedAt: '2026-04-04T06:41:05.000Z',
        followUpContext: {
          summary: 'Use the updated live chess board to recommend the best next move from this position.',
        },
      },
    })

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.shared.follow-up',
      userId: 'user.shared.follow-up',
      userRequest: 'play c5',
      requestMessageId: 'message.shared.follow-up',
      previousMessages: [createMessage('user', "let's play chess")],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    const toolPart = result.message.contentParts.find((part) => part.type === 'tool-call')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.toolName : null).toBe('chess.make-move')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.args : null).toMatchObject({
      move: 'c5',
      expectedFen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
    })
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.result : null).toMatchObject({
      requestedMove: 'c5',
      appliedMove: 'c5',
      turn: 'white',
      lastMove: 'c5',
    })
    expect(mockEnqueueSidebarAppRuntimeCommand).toHaveBeenCalledTimes(1)
    expect(mockEnqueueSidebarAppRuntimeCommand.mock.calls[0]?.[0]).toMatchObject({
      arguments: {
        move: 'c5',
        expectedFen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
      },
    })
  })

  it('refreshes the live chess state once and retries when a follow-up move races with a board update', async () => {
    upsertSidebarAppRuntimeSnapshot({
      hostSessionId: 'conversation.shared.retry',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.shared-retry',
      conversationId: 'conversation.sidebar.chess-tutor',
      expectedOrigin: 'http://localhost:1212',
      sourceUrl: 'http://localhost:1212/embedded-apps/chess?chatbridge_panel=1',
      authState: 'connected',
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      status: 'active',
      summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1. White to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      updatedAt: '2026-04-04T06:42:00.000Z',
    })

    initializeChessSession({
      conversationId: 'conversation.shared.retry',
      appSessionId: 'app-session.sidebar.shared-retry',
      status: 'active',
    })

    mockEnqueueSidebarAppRuntimeCommand.mockImplementationOnce(async (command) => {
      const incomingCommand = command as {
        hostSessionId: string
        runtimeAppId: string
        appSessionId: string
        toolCallId: string
        toolName: string
        arguments: { move: string; expectedFen: string }
        createdAt: string
      }

      applyChessSessionMove({
        conversationId: 'conversation.shared.retry',
        appSessionId: 'app-session.sidebar.shared-retry',
        requestedMove: 'd4',
      })

      return {
        ok: false,
        command: incomingCommand,
        error: 'The chess board changed before the requested move could be applied.',
      }
    })

    mockEnqueueSidebarAppRuntimeCommand.mockImplementationOnce(async (command) => {
      const incomingCommand = command as {
        hostSessionId: string
        runtimeAppId: string
        appSessionId: string
        toolCallId: string
        toolName: string
        arguments: { move: string; expectedFen: string }
        createdAt: string
      }

      return {
        ok: true,
        command: incomingCommand,
        completion: {
          version: 'v1',
          conversationId: 'conversation.shared.retry',
          appSessionId: 'app-session.sidebar.shared-retry',
          appId: 'chess.internal',
          toolCallId: incomingCommand.toolCallId,
          status: 'succeeded',
          resultSummary: 'Move played: d5. White to move.',
          result: {
            appSessionId: 'app-session.sidebar.shared-retry',
            requestedMove: 'd5',
            appliedMove: 'd5',
            fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6 0 2',
            turn: 'white',
            moveCount: 2,
            lastMove: 'd5',
            legalMoveCount: 29,
            candidateMoves: ['e4', 'Nc3', 'Nf3', 'a3', 'a4', 'c3'],
            summary: 'Move played: d5. White to move.',
            explanation: 'It challenges White in the center immediately.',
            moveExecutionAvailable: true,
          },
          completedAt: '2026-04-04T06:42:05.000Z',
          followUpContext: {
            summary: 'Use the updated live chess board to recommend the best next move from this position.',
          },
        },
      }
    })

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.shared.retry',
      userId: 'user.shared.retry',
      userRequest: 'move one of the pieces now',
      requestMessageId: 'message.shared.retry',
      previousMessages: [createMessage('user', "let's play chess")],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    const toolPart = result.message.contentParts.find((part) => part.type === 'tool-call')
    const textPart = result.message.contentParts.find((part) => part.type === 'text')

    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.result : null).toMatchObject({
      requestedMove: 'd5',
      appliedMove: 'd5',
      turn: 'white',
    })
    expect(textPart && textPart.type === 'text' ? textPart.text : '').toContain('Move played: d5')
    expect(mockEnqueueSidebarAppRuntimeCommand).toHaveBeenCalledTimes(2)
    expect(mockEnqueueSidebarAppRuntimeCommand.mock.calls[0]?.[0]).toMatchObject({
      arguments: {
        move: 'd4',
        expectedFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
    })
    expect(mockEnqueueSidebarAppRuntimeCommand.mock.calls[1]?.[0]).toMatchObject({
      arguments: {
        move: 'd5',
        expectedFen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
      },
    })
  })

  it('does not fake a chess move from transcript-only state when the live sidebar board is unavailable', async () => {
    const priorAssistant = createMessage('assistant', 'Launching Chess Tutor in the right sidebar.')
    priorAssistant.contentParts = [
      {
        type: 'embedded-app',
        appId: 'chess.internal',
        appName: 'Chess Tutor',
        appSessionId: 'app-session.chess.transcript-only',
        sourceUrl: 'http://localhost:1212/embedded-apps/chess',
        title: 'Chess Tutor',
        summary: 'Current board FEN: rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2. White to move.',
        status: 'ready',
        bridge: {
          expectedOrigin: 'http://localhost:1212',
          conversationId: 'conversation.shared.2',
          appSessionId: 'app-session.chess.transcript-only',
          bootstrap: {
            launchReason: 'chat-tool',
            authState: 'connected',
            initialState: {
              fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
              turn: 'w',
              moveCount: 2,
              lastMove: 'e5',
            },
            availableTools: [exampleChessLaunchToolSchema, exampleChessGetBoardStateToolSchema, exampleChessMakeMoveToolSchema],
          },
        },
      },
    ]

    const moveResult = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.shared.2',
      userId: 'user.shared.2',
      userRequest: 'play d4',
      requestMessageId: 'message.shared.2.move',
      previousMessages: [createMessage('user', "let's play chess"), priorAssistant],
    })

    expect(moveResult.kind).toBe('clarify')
    if (moveResult.kind !== 'clarify') {
      return
    }

    const textPart = moveResult.message.contentParts.find((part) => part.type === 'text')
    expect(textPart && textPart.type === 'text' ? textPart.text : '').toContain('needs the live right-sidebar board')
    expect(mockEnqueueSidebarAppRuntimeCommand).not.toHaveBeenCalled()
  })

  it('does not fall back to generic tool execution when Chess is open but the live sidebar snapshot is reconnecting', async () => {
    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.reconnecting.1',
      userId: 'user.reconnecting.1',
      userRequest: 'play c5',
      requestMessageId: 'message.reconnecting.1',
      previousMessages: [createMessage('user', "let's play chess")],
    })

    expect(result.kind).toBe('clarify')
    if (result.kind !== 'clarify') {
      return
    }

    const textPart = result.message.contentParts.find((part) => part.type === 'text')
    expect(textPart && textPart.type === 'text' ? textPart.text : '').toContain('finish syncing')
    expect(mockEnqueueSidebarAppRuntimeCommand).not.toHaveBeenCalled()
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
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
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

    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.toolName : null).toBe('chess.make-move')
    expect(toolPart && toolPart.type === 'tool-call' ? toolPart.result : null).toMatchObject({
      requestedMove: 'd4',
      appliedMove: 'd4',
      turn: 'black',
    })
    expect(textPart && textPart.type === 'text' ? textPart.text : '').toContain('Move played: d4')
  })

  it('returns a chess clarification for invalid natural-language coordinate moves instead of misparsing them', async () => {
    upsertSidebarAppRuntimeSnapshot({
      hostSessionId: 'conversation.sidebar.10',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess.10',
      conversationId: 'conversation.sidebar.chess-tutor',
      expectedOrigin: 'http://localhost:1212',
      sourceUrl: 'http://localhost:1212/embedded-apps/chess?chatbridge_panel=1',
      authState: 'connected',
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      status: 'active',
      summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1. Black to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
        turn: 'b',
        moveCount: 1,
        lastMove: 'd4',
      },
      updatedAt: '2026-04-04T23:55:00.000Z',
    })

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.sidebar.10',
      userId: 'user.10',
      userRequest: 'can you move the black piece from D4 to E5',
      requestMessageId: 'message.10',
      previousMessages: [createMessage('user', "let's play chess")],
    })

    expect(result.kind).toBe('clarify')
    if (result.kind !== 'clarify') {
      return
    }

    const textPart = result.message.contentParts.find((part) => part.type === 'text')
    expect(textPart && textPart.type === 'text' ? textPart.text : '').toContain('"d4e5" is not a legal move')
    expect(mockEnqueueSidebarAppRuntimeCommand).not.toHaveBeenCalled()
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
