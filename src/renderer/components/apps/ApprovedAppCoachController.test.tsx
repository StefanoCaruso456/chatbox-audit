/**
 * @vitest-environment jsdom
 */

import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildChessApprovedAppKickoffToolCallId,
  buildChessObservedBoardStateToolCallId,
} from '@/packages/tutormeai-apps/orchestrator'
import {
  publishApprovedAppOpenedEvent,
  publishApprovedAppStateObservedEvent,
  resetApprovedAppOpenedEvents,
} from '@/stores/approvedAppEventStore'
import { getRuntimeTraceSpans, resetRuntimeTraceStore } from '@/stores/runtimeTraceStore'
import ApprovedAppCoachController from './ApprovedAppCoachController'

const { mockInsertMessage, mockScrollToBottom } = vi.hoisted(() => ({
  mockInsertMessage: vi.fn(),
  mockScrollToBottom: vi.fn(),
}))

vi.mock('@/stores/session/messages', () => ({
  insertMessage: (...args: unknown[]) => mockInsertMessage(...args),
}))

vi.mock('@/stores/scrollActions', () => ({
  scrollToBottom: (...args: unknown[]) => mockScrollToBottom(...args),
}))

describe('ApprovedAppCoachController', () => {
  beforeEach(() => {
    resetApprovedAppOpenedEvents()
    resetRuntimeTraceStore()
    mockInsertMessage.mockReset()
    mockInsertMessage.mockResolvedValue(undefined)
    mockScrollToBottom.mockReset()
  })

  it('inserts a chess kickoff coach message when Chess Tutor is manually opened', async () => {
    render(
      <ApprovedAppCoachController
        sessionId="session.test"
        session={
          {
            id: 'session.test',
            messages: [],
            threads: [],
            type: 'chat',
          } as never
        }
      />
    )

    publishApprovedAppOpenedEvent({
      eventId: 'open.chess.1',
      sessionId: 'session.test',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess-tutor',
      conversationId: 'conversation.sidebar.chess-tutor',
      summary: 'Chess Tutor is open in the right sidebar.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
        lastMove: 'No moves yet',
      },
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      openedAt: '2026-04-05T03:00:00.000Z',
    })

    await waitFor(() => {
      expect(mockInsertMessage).toHaveBeenCalledTimes(1)
    })

    expect(mockInsertMessage.mock.calls[0]?.[0]).toBe('session.test')
    const kickoffMessage = mockInsertMessage.mock.calls[0]?.[1]
    expect(kickoffMessage?.contentParts?.find((part: { type: string }) => part.type === 'tool-call')).toMatchObject({
      toolName: 'chess.get-board-state',
      toolCallId: buildChessApprovedAppKickoffToolCallId('app-session.sidebar.chess-tutor'),
    })
    expect(kickoffMessage?.contentParts?.find((part: { type: string }) => part.type === 'text')?.text).toContain(
      'Ready to play some chess?'
    )
    expect(mockScrollToBottom).toHaveBeenCalledWith('smooth')
    expect(
      getRuntimeTraceSpans().some(
        (span) =>
          span.kind === 'coach-message' &&
          span.state?.source === 'approved-app.opened' &&
          span.agentReturn?.toolCallId === buildChessApprovedAppKickoffToolCallId('app-session.sidebar.chess-tutor')
      )
    ).toBe(true)
  })

  it('waits for real Chess.com board state before inserting a kickoff coach message', async () => {
    render(
      <ApprovedAppCoachController
        sessionId="session.test"
        session={
          {
            id: 'session.test',
            messages: [],
            threads: [],
            type: 'chat',
          } as never
        }
      />
    )

    publishApprovedAppOpenedEvent({
      eventId: 'open.chess-com.1',
      sessionId: 'session.test',
      approvedAppId: 'chess-com',
      runtimeAppId: 'chess.com.workspace',
      appSessionId: 'app-session.sidebar.chess-com',
      conversationId: 'conversation.sidebar.chess-com',
      summary: 'Chess.com is open in the right sidebar.',
      latestStateDigest: {
        embedUrl: 'https://www.chess.com/emboard?id=10477955&_height=640',
      },
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      openedAt: '2026-04-05T03:00:05.000Z',
    })

    await Promise.resolve()
    expect(mockInsertMessage).not.toHaveBeenCalled()
  })

  it('does not insert a duplicate kickoff when the session already has one for that open event', async () => {
    render(
      <ApprovedAppCoachController
        sessionId="session.test"
        session={
          {
            id: 'session.test',
            messages: [
              {
                id: 'message.kickoff',
                role: 'assistant',
                contentParts: [
                  {
                    type: 'tool-call',
                    state: 'result',
                    toolCallId: buildChessApprovedAppKickoffToolCallId('app-session.sidebar.chess-tutor'),
                    toolName: 'chess.get-board-state',
                    args: {
                      scope: 'current-position',
                    },
                    result: {},
                  },
                ],
              },
            ],
            threads: [],
            type: 'chat',
          } as never
        }
      />
    )

    publishApprovedAppOpenedEvent({
      eventId: 'open.chess.2',
      sessionId: 'session.test',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess-tutor',
      conversationId: 'conversation.sidebar.chess-tutor',
      summary: 'Chess Tutor is open in the right sidebar.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      openedAt: '2026-04-05T03:01:00.000Z',
    })

    await Promise.resolve()
    expect(mockInsertMessage).not.toHaveBeenCalled()
  })

  it('inserts a proactive board-state message when Chess.com finishes loading a real diagram position', async () => {
    render(
      <ApprovedAppCoachController
        sessionId="session.test"
        session={
          {
            id: 'session.test',
            messages: [],
            threads: [],
            type: 'chat',
          } as never
        }
      />
    )

    publishApprovedAppStateObservedEvent({
      eventId: 'state.chess-com.observe.1',
      sessionId: 'session.test',
      approvedAppId: 'chess-com',
      runtimeAppId: 'chess.com.workspace',
      appSessionId: 'app-session.sidebar.chess-com',
      conversationId: 'conversation.sidebar.chess-com',
      summary: 'Chess.com board FEN: rnbqkbnr/pp1ppppp/2p5/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2. White to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pp1ppppp/2p5/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
        turn: 'w',
        moveCount: 2,
        lastMove: 'c6',
        lastUpdateSource: 'diagram-load',
      },
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      observedAt: '2026-04-05T03:03:05.000Z',
    })

    await waitFor(() => {
      expect(mockInsertMessage).toHaveBeenCalledTimes(1)
    })

    const observedMessage = mockInsertMessage.mock.calls[0]?.[1]
    expect(observedMessage?.contentParts?.find((part: { type: string }) => part.type === 'tool-call')).toMatchObject({
      toolName: 'chess.get-board-state',
      toolCallId: buildChessObservedBoardStateToolCallId('app-session.sidebar.chess-com', 2),
    })
    expect(observedMessage?.contentParts?.find((part: { type: string }) => part.type === 'text')?.text).toContain(
      'I saw c6 on the board.'
    )
  })

  it('does not insert a manual-open kickoff when the session already has an active chess runtime message', async () => {
    render(
      <ApprovedAppCoachController
        sessionId="session.test"
        session={
          {
            id: 'session.test',
            messages: [
              {
                id: 'message.runtime',
                role: 'assistant',
                contentParts: [
                  {
                    type: 'embedded-app',
                    appId: 'chess.internal',
                    appName: 'Chess Tutor',
                    appSessionId: 'app-session.active',
                    sourceUrl: 'http://localhost:3000/embedded-apps/chess',
                    status: 'ready',
                    bridge: {
                      conversationId: 'session.test',
                      expectedOrigin: 'http://localhost:3000',
                      appSessionId: 'app-session.active',
                    },
                  },
                ],
              },
            ],
            threads: [],
            type: 'chat',
          } as never
        }
      />
    )

    publishApprovedAppOpenedEvent({
      eventId: 'open.chess.3',
      sessionId: 'session.test',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess-tutor',
      conversationId: 'conversation.sidebar.chess-tutor',
      summary: 'Chess Tutor is open in the right sidebar.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      openedAt: '2026-04-05T03:02:00.000Z',
    })

    await Promise.resolve()
    expect(mockInsertMessage).not.toHaveBeenCalled()
  })

  it('does not insert duplicate kickoff prompts when the same chess app session re-publishes open events', async () => {
    render(
      <ApprovedAppCoachController
        sessionId="session.test"
        session={
          {
            id: 'session.test',
            messages: [],
            threads: [],
            type: 'chat',
          } as never
        }
      />
    )

    publishApprovedAppOpenedEvent({
      eventId: 'open.chess.dup.1',
      sessionId: 'session.test',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess-tutor',
      conversationId: 'conversation.sidebar.chess-tutor',
      summary: 'Chess Tutor is open in the right sidebar.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      openedAt: '2026-04-05T03:03:00.000Z',
    })
    publishApprovedAppOpenedEvent({
      eventId: 'open.chess.dup.2',
      sessionId: 'session.test',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess-tutor',
      conversationId: 'conversation.sidebar.chess-tutor',
      summary: 'Chess Tutor is open in the right sidebar.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      openedAt: '2026-04-05T03:03:01.000Z',
    })

    await waitFor(() => {
      expect(mockInsertMessage).toHaveBeenCalledTimes(1)
    })
  })

  it('inserts a proactive coach message after a manual board move changes the live chess session', async () => {
    render(
      <ApprovedAppCoachController
        sessionId="session.test"
        session={
          {
            id: 'session.test',
            messages: [],
            threads: [],
            type: 'chat',
          } as never
        }
      />
    )

    publishApprovedAppOpenedEvent({
      eventId: 'open.chess.observe.1',
      sessionId: 'session.test',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess-tutor',
      conversationId: 'conversation.sidebar.chess-tutor',
      summary: 'Chess Tutor is open in the right sidebar.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      openedAt: '2026-04-05T03:04:00.000Z',
    })

    await waitFor(() => {
      expect(mockInsertMessage).toHaveBeenCalledTimes(1)
    })

    publishApprovedAppStateObservedEvent({
      eventId: 'state.chess.observe.1',
      sessionId: 'session.test',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess-tutor',
      conversationId: 'conversation.sidebar.chess-tutor',
      summary: 'Played d4. Black to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
        turn: 'b',
        moveCount: 1,
        lastMove: 'd4',
        lastUpdateSource: 'manual-board-move',
      },
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      observedAt: '2026-04-05T03:04:05.000Z',
    })

    await waitFor(() => {
      expect(mockInsertMessage).toHaveBeenCalledTimes(2)
    })

    const observedMessage = mockInsertMessage.mock.calls[1]?.[1]
    expect(observedMessage?.contentParts?.find((part: { type: string }) => part.type === 'tool-call')).toMatchObject({
      toolName: 'chess.get-board-state',
      toolCallId: buildChessObservedBoardStateToolCallId('app-session.sidebar.chess-tutor', 1),
    })
    expect(observedMessage?.contentParts?.find((part: { type: string }) => part.type === 'text')?.text).toContain(
      'I saw d4 on the board.'
    )
    expect(
      getRuntimeTraceSpans().some(
        (span) =>
          span.kind === 'coach-message' &&
          span.state?.source === 'approved-app.state-observed' &&
          span.agentReturn?.toolCallId === buildChessObservedBoardStateToolCallId('app-session.sidebar.chess-tutor', 1)
      )
    ).toBe(true)
  })

  it('does not insert a proactive coach message for chat-executed tool moves', async () => {
    render(
      <ApprovedAppCoachController
        sessionId="session.test"
        session={
          {
            id: 'session.test',
            messages: [],
            threads: [],
            type: 'chat',
          } as never
        }
      />
    )

    publishApprovedAppOpenedEvent({
      eventId: 'open.chess.observe.2',
      sessionId: 'session.test',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess-tutor',
      conversationId: 'conversation.sidebar.chess-tutor',
      summary: 'Chess Tutor is open in the right sidebar.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      },
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      openedAt: '2026-04-05T03:05:00.000Z',
    })

    await waitFor(() => {
      expect(mockInsertMessage).toHaveBeenCalledTimes(1)
    })

    publishApprovedAppStateObservedEvent({
      eventId: 'state.chess.observe.2',
      sessionId: 'session.test',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appSessionId: 'app-session.sidebar.chess-tutor',
      conversationId: 'conversation.sidebar.chess-tutor',
      summary: 'Played d4. Black to move.',
      latestStateDigest: {
        fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
        turn: 'b',
        moveCount: 1,
        lastMove: 'd4',
        lastUpdateSource: 'tool-move',
      },
      availableToolNames: ['chess.launch-game', 'chess.get-board-state', 'chess.make-move'],
      observedAt: '2026-04-05T03:05:05.000Z',
    })

    await Promise.resolve()
    expect(mockInsertMessage).toHaveBeenCalledTimes(1)
  })
})
