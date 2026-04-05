/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetChessSessions } from '@/stores/chessSessionStore'
import { ChessAppPage } from './ChessAppPage'

const sendCompletion = vi.fn()
const sendError = vi.fn()
const sendState = vi.fn()
let runtimeContext: { conversationId: string; appSessionId: string } | null = null
let invocationMessage: {
  payload: {
    toolName: string
    toolCallId: string
    arguments: Record<string, string>
  }
} | null = null

vi.mock('../useEmbeddedAppBridge', () => ({
  useEmbeddedAppBridge: () => ({
    runtimeContext,
    invocationMessage,
    sendCompletion,
    sendError,
    sendState,
  }),
}))

function renderChess(jsx: ReactNode) {
  return render(<MantineProvider>{jsx}</MantineProvider>)
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

describe('ChessAppPage', () => {
  beforeEach(() => {
    resetChessSessions()
    runtimeContext = {
      conversationId: 'conversation.sidebar.chess',
      appSessionId: 'app-session.sidebar.chess',
    }
    invocationMessage = {
      payload: {
        toolName: 'chess.launch-game',
        toolCallId: 'tool-call.sidebar.chess',
        arguments: {
          mode: 'practice',
        },
      },
    }
    sendCompletion.mockReset()
    sendError.mockReset()
    sendState.mockReset()
  })

  it('renders a visible 8x8 board with piece glyphs', () => {
    renderChess(<ChessAppPage />)

    expect(screen.getByTestId('chess-board-grid')).toBeTruthy()
    expect(screen.getByTestId('chess-square-a8').textContent).toContain('♜')
    expect(screen.getByTestId('chess-square-e1').textContent).toContain('♚')
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(64)
  })

  it('keeps the sidebar Chess UI board-first and delegates analysis to chat', () => {
    renderChess(<ChessAppPage />)

    expect(screen.getByText('Live board only')).toBeTruthy()
    expect(screen.getByText(/Ask the chat to analyze this position/i)).toBeTruthy()
    expect(screen.queryByText('Board analysis')).toBeNull()
    expect(screen.queryByText('Move tools')).toBeNull()
    expect(screen.queryByText('Quick actions')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply move' })).toBeNull()
  })

  it('lets the user make a simple opening move on the board', () => {
    renderChess(<ChessAppPage />)

    fireEvent.click(screen.getByTestId('chess-square-e2'))
    expect(screen.getByText('Selected E2. Choose a destination square.')).toBeTruthy()

    fireEvent.click(screen.getByTestId('chess-square-e4'))
    expect(screen.getByText('Played e4. Black to move.')).toBeTruthy()
  })

  it('publishes updated board state after a manual board move', () => {
    renderChess(<ChessAppPage />)

    fireEvent.click(screen.getByTestId('chess-square-e2'))
    fireEvent.click(screen.getByTestId('chess-square-e4'))

    expect(screen.getByText('Played e4. Black to move.')).toBeTruthy()
    expect(
      sendState.mock.calls.some(
        ([payload]) => payload.status === 'active' && payload.state?.lastMove === 'e4' && payload.state?.turn === 'b'
      )
    ).toBe(true)
  })

  it('reuses the live session when chess.launch-game replays for the same app session', async () => {
    const view = renderChess(<ChessAppPage />)

    fireEvent.click(screen.getByTestId('chess-square-e2'))
    fireEvent.click(screen.getByTestId('chess-square-e4'))

    expect(screen.getByText('Played e4. Black to move.')).toBeTruthy()
    expect(screen.getByTestId('chess-piece-e4').textContent).toContain('♟')

    invocationMessage = {
      payload: {
        toolName: 'chess.launch-game',
        toolCallId: 'tool-call.sidebar.chess.replay',
        arguments: {
          mode: 'practice',
        },
      },
    }

    view.rerender(
      <MantineProvider>
        <ChessAppPage />
      </MantineProvider>
    )

    await waitFor(() => expect(screen.getByTestId('chess-piece-e4').textContent).toContain('♟'))

    expect(screen.getByTestId('chess-piece-e2').textContent).toBe('')
    expect(
      sendState.mock.calls.some(
        ([payload]) => payload.status === 'active' && payload.state?.lastMove === 'e4' && payload.state?.turn === 'b'
      )
    ).toBe(true)
  })

  it('applies chess.make-move invocations from the sidebar host and completes with updated board state', async () => {
    invocationMessage = {
      payload: {
        toolName: 'chess.make-move',
        toolCallId: 'tool-call.sidebar.chess.move',
        arguments: {
          move: 'd4',
          expectedFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        },
      },
    }

    renderChess(<ChessAppPage />)

    await waitFor(() =>
      expect(sendCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCallId: 'tool-call.sidebar.chess.move',
          status: 'succeeded',
          result: expect.objectContaining({
            requestedMove: 'd4',
            appliedMove: 'd4',
            turn: 'black',
            moveExecutionAvailable: true,
          }),
        })
      )
    )

    expect(screen.getByText('Played d4. Black to move.')).toBeTruthy()
  })

  it('waits for runtime bootstrap before marking a chess.make-move invocation as handled', async () => {
    runtimeContext = null
    invocationMessage = {
      payload: {
        toolName: 'chess.make-move',
        toolCallId: 'tool-call.sidebar.chess.wait-for-bootstrap',
        arguments: {
          move: 'd4',
          expectedFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        },
      },
    }

    const view = renderChess(<ChessAppPage />)

    expect(sendCompletion).not.toHaveBeenCalled()
    expect(screen.getByText('The chess runtime is not connected yet.')).toBeTruthy()

    runtimeContext = {
      conversationId: 'conversation.sidebar.chess',
      appSessionId: 'app-session.sidebar.chess',
    }

    view.rerender(
      <MantineProvider>
        <ChessAppPage />
      </MantineProvider>
    )

    await waitFor(() =>
      expect(sendCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCallId: 'tool-call.sidebar.chess.wait-for-bootstrap',
          status: 'succeeded',
        })
      )
    )

    expect(screen.getByText('Played d4. Black to move.')).toBeTruthy()
  })

  it('publishes the visible board state to the sidebar parent even without runtime bootstrap', async () => {
    runtimeContext = null
    invocationMessage = null

    const originalParent = window.parent
    const postMessage = vi.fn()
    Object.defineProperty(window, 'parent', {
      value: { postMessage },
      configurable: true,
    })

    try {
      renderChess(<ChessAppPage />)

      await waitFor(() =>
        expect(postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            source: 'chatbridge-sidebar-app',
            type: 'sidebar-state',
            appId: 'chess.internal',
            payload: expect.objectContaining({
              status: 'active',
              summary: expect.stringContaining('Current board FEN'),
              state: expect.objectContaining({
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                turn: 'w',
                moveCount: 0,
              }),
            }),
          }),
          window.location.origin
        )
      )
    } finally {
      Object.defineProperty(window, 'parent', {
        value: originalParent,
        configurable: true,
      })
    }
  })

  it('shows legal destinations for the selected piece in the board helper', () => {
    renderChess(<ChessAppPage />)

    fireEvent.click(screen.getByTestId('chess-square-g1'))

    const legalDestinations = screen.getByText(/Legal destinations:/)
    expect(screen.getByText('Selected G1. Choose a destination square.')).toBeTruthy()
    expect(legalDestinations.textContent).toContain('F3')
    expect(legalDestinations.textContent).toContain('H3')
  })

  it('renders white pieces lighter than black pieces for sidebar readability', () => {
    renderChess(<ChessAppPage />)

    const lightSquareCoordinate = screen.getByTestId('chess-coordinate-b8')
    const darkSquareCoordinate = screen.getByTestId('chess-coordinate-a8')
    const whitePiece = screen.getByTestId('chess-piece-b1')
    const blackPiece = screen.getByTestId('chess-piece-b8')
    const whitePieceSquare = screen.getByTestId('chess-square-b1')
    const blackPieceSquare = screen.getByTestId('chess-square-b8')
    const lightCoordinateStyle = lightSquareCoordinate.getAttribute('style') ?? ''
    const darkCoordinateStyle = darkSquareCoordinate.getAttribute('style') ?? ''
    const whitePieceStyle = whitePiece.getAttribute('style') ?? ''
    const blackPieceStyle = blackPiece.getAttribute('style') ?? ''
    const whitePieceSquareStyle = whitePieceSquare.getAttribute('style') ?? ''
    const blackPieceSquareStyle = blackPieceSquare.getAttribute('style') ?? ''

    expect(lightCoordinateStyle).toContain('background: rgba(15, 23, 42, 0.96)')
    expect(lightCoordinateStyle).toContain('color: rgb(248, 250, 252)')
    expect(darkCoordinateStyle).toContain('background: rgba(15, 23, 42, 0.96)')
    expect(darkCoordinateStyle).toContain('color: rgb(248, 250, 252)')
    expect(darkCoordinateStyle).toContain('box-shadow: 0 2px 6px rgba(2,6,23,0.32)')
    expect(whitePieceStyle).toContain('0.8px rgba(15, 23, 42, 0.58)')
    expect(blackPieceStyle).toContain('text-shadow: 0 1px 0 rgba(248,250,252,0.18), 0 2px 4px rgba(15,23,42,0.2)')
    expect(whitePieceSquareStyle).toContain('color: rgb(248, 250, 252)')
    expect(blackPieceSquareStyle).toContain('color: rgb(15, 23, 42)')
  })
})
