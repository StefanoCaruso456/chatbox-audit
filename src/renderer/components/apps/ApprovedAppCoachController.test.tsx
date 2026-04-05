/**
 * @vitest-environment jsdom
 */

import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildChessApprovedAppKickoffToolCallId,
} from '@/packages/tutormeai-apps/orchestrator'
import {
  publishApprovedAppOpenedEvent,
  resetApprovedAppOpenedEvents,
} from '@/stores/approvedAppEventStore'
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
      toolCallId: buildChessApprovedAppKickoffToolCallId('open.chess.1'),
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
                  toolCallId: buildChessApprovedAppKickoffToolCallId('open.chess.2'),
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
})
