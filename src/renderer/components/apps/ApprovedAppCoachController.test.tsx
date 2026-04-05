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
  resetApprovedAppOpenedEvents,
} from '@/stores/approvedAppEventStore'
import { applyChessSessionMove, initializeChessSession, resetChessSessions } from '@/stores/chessSessionStore'
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
    resetChessSessions()
    mockInsertMessage.mockReset()
    mockInsertMessage.mockResolvedValue(undefined)
    mockScrollToBottom.mockReset()
  })

  it('inserts a chess kickoff coach message when Chess Tutor is manually opened', async () => {
    render(
      <ApprovedAppCoachController
        sessionId="session.test"
        session={{
          id: 'session.test',
          messages: [],
          threads: [],
          type: 'chat',
        } as never}
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
  })

  it('does not insert a duplicate kickoff when the session already has one for that open event', async () => {
    render(
      <ApprovedAppCoachController
        sessionId="session.test"
        session={{
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
        } as never}
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

  it('does not insert a manual-open kickoff when the session already has an active chess runtime message', async () => {
    render(
      <ApprovedAppCoachController
        sessionId="session.test"
        session={{
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
        } as never}
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
        session={{
          id: 'session.test',
          messages: [],
          threads: [],
          type: 'chat',
        } as never}
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
    initializeChessSession({
      conversationId: 'conversation.sidebar.chess-tutor',
      appSessionId: 'app-session.sidebar.chess-tutor',
      status: 'waiting-user',
    })

    render(
      <ApprovedAppCoachController
        sessionId="session.test"
        session={{
          id: 'session.test',
          messages: [],
          threads: [],
          type: 'chat',
        } as never}
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

    applyChessSessionMove({
      conversationId: 'conversation.sidebar.chess-tutor',
      appSessionId: 'app-session.sidebar.chess-tutor',
      requestedMove: 'd2d4',
      source: 'manual-board-move',
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
  })

  it('does not insert a proactive coach message for chat-executed tool moves', async () => {
    initializeChessSession({
      conversationId: 'conversation.sidebar.chess-tutor',
      appSessionId: 'app-session.sidebar.chess-tutor',
      status: 'waiting-user',
    })

    render(
      <ApprovedAppCoachController
        sessionId="session.test"
        session={{
          id: 'session.test',
          messages: [],
          threads: [],
          type: 'chat',
        } as never}
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

    applyChessSessionMove({
      conversationId: 'conversation.sidebar.chess-tutor',
      appSessionId: 'app-session.sidebar.chess-tutor',
      requestedMove: 'd2d4',
      source: 'tool-move',
    })

    await Promise.resolve()
    expect(mockInsertMessage).toHaveBeenCalledTimes(1)
  })
})
