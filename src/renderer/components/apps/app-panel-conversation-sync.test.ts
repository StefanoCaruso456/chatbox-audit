/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getApprovedAppById } from '@/data/approvedApps'

const { mockGetSession, mockModifyMessage } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockModifyMessage: vi.fn(),
}))

vi.mock('@/stores/chatStore', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
}))

vi.mock('@/stores/session/messages', () => ({
  modifyMessage: (...args: unknown[]) => mockModifyMessage(...args),
  insertMessageAfter: vi.fn(),
}))

import { buildConversationEmbeddedAppRuntime, selectLatestApprovedAppConversationPart } from './app-panel-conversation-sync'

describe('app-panel conversation sync', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockModifyMessage.mockReset()
  })

  it('selects the latest active runtime part for the approved app', () => {
    const app = getApprovedAppById('chess-tutor')
    if (!app) {
      throw new Error('Missing chess-tutor fixture')
    }

    const ref = selectLatestApprovedAppConversationPart(
      {
        id: 'session.1',
        messages: [
          {
            id: 'message.completed',
            timestamp: Date.parse('2026-04-03T20:00:00.000Z'),
            role: 'assistant',
            contentParts: [
              {
                type: 'embedded-app',
                appId: 'chess.internal',
                appName: 'Chess Tutor',
                appSessionId: 'app-session.old',
                sourceUrl: 'http://localhost:3000/embedded-apps/chess',
                status: 'ready',
                bridge: {
                  expectedOrigin: 'http://localhost:3000',
                  conversationId: 'conversation.1',
                  appSessionId: 'app-session.old',
                  completion: {
                    status: 'succeeded',
                    resultSummary: 'Old game finished.',
                    result: {},
                  },
                },
              },
            ],
          },
          {
            id: 'message.active',
            timestamp: Date.parse('2026-04-03T20:05:00.000Z'),
            role: 'assistant',
            contentParts: [
              {
                type: 'embedded-app',
                appId: 'chess.internal',
                appName: 'Chess Tutor',
                appSessionId: 'app-session.active',
                sourceUrl: 'http://localhost:3000/embedded-apps/chess',
                summary: 'White to move.',
                status: 'ready',
                bridge: {
                  expectedOrigin: 'http://localhost:3000',
                  conversationId: 'conversation.1',
                  appSessionId: 'app-session.active',
                  pendingInvocation: {
                    toolCallId: 'tool-call.1',
                    toolName: 'chess.launch-game',
                  },
                },
              },
            ],
          },
        ],
        threads: [],
      } as never,
      app
    )

    expect(ref?.messageId).toBe('message.active')
    expect(ref?.part.appSessionId).toBe('app-session.active')
  })

  it('clears a stale pending launch invocation after the runtime reports ready state', async () => {
    const app = getApprovedAppById('chess-tutor')
    if (!app) {
      throw new Error('Missing chess-tutor fixture')
    }

    const session = {
      id: 'session.2',
      messages: [
        {
          id: 'message.active',
          timestamp: Date.parse('2026-04-04T20:05:00.000Z'),
          role: 'assistant',
          contentParts: [
            {
              type: 'embedded-app',
              appId: 'chess.internal',
              appName: 'Chess Tutor',
              appSessionId: 'app-session.active',
              sourceUrl: 'http://localhost:3000/embedded-apps/chess',
              summary: 'Opening position.',
              status: 'loading',
              bridge: {
                expectedOrigin: 'http://localhost:3000',
                conversationId: 'conversation.2',
                appSessionId: 'app-session.active',
                pendingInvocation: {
                  toolCallId: 'tool-call.launch',
                  toolName: 'chess.launch-game',
                },
                bootstrap: {
                  launchReason: 'chat-tool',
                  authState: 'connected',
                  initialState: {
                    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                  },
                  availableTools: [],
                },
              },
            },
          ],
        },
      ],
      threads: [],
    } as never

    mockGetSession.mockResolvedValue(session)
    mockModifyMessage.mockResolvedValue(undefined)

    const ref = selectLatestApprovedAppConversationPart(session, app)
    if (!ref) {
      throw new Error('Expected active chess runtime ref')
    }

    const runtime = buildConversationEmbeddedAppRuntime('session.2', ref, 'http://localhost:3000/embedded-apps/chess')
    if (!runtime?.onStateUpdate) {
      throw new Error('Expected runtime state handler')
    }

    runtime.onStateUpdate({
      payload: {
        status: 'active',
        summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1. Black to move.',
        state: {
          fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
          turn: 'b',
          moveCount: 1,
          lastMove: 'e4',
        },
      },
    } as never)

    await Promise.resolve()
    await Promise.resolve()

    expect(mockModifyMessage).toHaveBeenCalled()
    const updatedMessage = mockModifyMessage.mock.calls.at(-1)?.[1]
    const updatedPart = updatedMessage?.contentParts?.[0]

    expect(updatedPart?.status).toBe('ready')
    expect(updatedPart?.bridge?.pendingInvocation).toBeUndefined()
    expect(updatedPart?.bridge?.bootstrap?.initialState).toMatchObject({
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      turn: 'b',
      moveCount: 1,
      lastMove: 'e4',
    })
  })

  it('keeps the live runtime session and clears the failed invocation after a recoverable app error', async () => {
    const app = getApprovedAppById('chess-tutor')
    if (!app) {
      throw new Error('Missing chess-tutor fixture')
    }

    const session = {
      id: 'session.3',
      messages: [
        {
          id: 'message.active',
          timestamp: Date.parse('2026-04-04T20:10:00.000Z'),
          role: 'assistant',
          contentParts: [
            {
              type: 'embedded-app',
              appId: 'chess.internal',
              appName: 'Chess Tutor',
              appSessionId: 'app-session.active',
              sourceUrl: 'http://localhost:3000/embedded-apps/chess',
              summary: 'Played d4. Black to move.',
              status: 'loading',
              bridge: {
                expectedOrigin: 'http://localhost:3000',
                conversationId: 'conversation.3',
                appSessionId: 'app-session.active',
                pendingInvocation: {
                  toolCallId: 'tool-call.move',
                  toolName: 'chess.make-move',
                },
                bootstrap: {
                  launchReason: 'chat-tool',
                  authState: 'connected',
                  initialState: {
                    fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
                    turn: 'b',
                    moveCount: 1,
                    lastMove: 'd4',
                  },
                  availableTools: [],
                },
              },
            },
          ],
        },
      ],
      threads: [],
    } as never

    mockGetSession.mockResolvedValue(session)
    mockModifyMessage.mockResolvedValue(undefined)

    const ref = selectLatestApprovedAppConversationPart(session, app)
    if (!ref) {
      throw new Error('Expected active chess runtime ref')
    }

    const runtime = buildConversationEmbeddedAppRuntime('session.3', ref, 'http://localhost:3000/embedded-apps/chess')
    if (!runtime?.onRuntimeError) {
      throw new Error('Expected runtime error handler')
    }

    runtime.onRuntimeError({
      payload: {
        code: 'chess.stale-board-state',
        message: 'The chess board changed before the requested move could be applied.',
        recoverable: true,
        details: {
          toolCallId: 'tool-call.move',
        },
      },
    } as never)

    await Promise.resolve()
    await Promise.resolve()

    expect(mockModifyMessage).toHaveBeenCalledTimes(1)
    const updatedMessage = mockModifyMessage.mock.calls[0]?.[1]
    const updatedPart = updatedMessage?.contentParts?.[0]

    expect(updatedPart?.status).toBe('ready')
    expect(updatedPart?.summary).toBe('Played d4. Black to move.')
    expect(updatedPart?.errorMessage).toBe('The chess board changed before the requested move could be applied.')
    expect(updatedPart?.bridge?.pendingInvocation).toBeUndefined()
    expect(updatedPart?.bridge?.bootstrap?.initialState).toMatchObject({
      fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
      turn: 'b',
      moveCount: 1,
      lastMove: 'd4',
    })
  })
})
