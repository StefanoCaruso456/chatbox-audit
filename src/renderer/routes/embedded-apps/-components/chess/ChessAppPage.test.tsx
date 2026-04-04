/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChessAppPage } from './ChessAppPage'

const sendCompletion = vi.fn()
const sendError = vi.fn()
const sendState = vi.fn()
let runtimeContext: { conversationId: string; appSessionId: string } | null = null
let invocationMessage:
  | {
      payload: {
        toolName: string
        toolCallId: string
        arguments: {
          mode: 'practice' | 'analysis'
        }
      }
    }
  | null = null

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
    expect(screen.getByTestId('chess-square-e1').textContent).toContain('♔')
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(64)
  })

  it('shows board analysis and move tools in the sidebar UI', () => {
    renderChess(<ChessAppPage />)

    expect(screen.getByText('Board analysis')).toBeTruthy()
    expect(screen.getByText('Move tools')).toBeTruthy()
    expect(screen.getByText('Quick actions')).toBeTruthy()
    expect(screen.getByText('Opening')).toBeTruthy()
    expect(screen.getByText('Material is even.')).toBeTruthy()
    expect(screen.getByText('Legal moves: 20')).toBeTruthy()
    expect(screen.getByLabelText('Move notation')).toBeTruthy()
    expect(screen.getByText('Candidate moves')).toBeTruthy()
    expect(screen.queryByText('Practice or analyze a live chess board without leaving the chat.')).toBeNull()
  })

  it('lets the user make a simple opening move on the board', () => {
    renderChess(<ChessAppPage />)

    fireEvent.click(screen.getByTestId('chess-square-e2'))
    expect(screen.getByText('Selected E2. Choose a destination square.')).toBeTruthy()

    fireEvent.click(screen.getByTestId('chess-square-e4'))
    expect(screen.getByText('Played e4. Black to move.')).toBeTruthy()
  })

  it('supports typed move input and updates the live analysis snapshot', () => {
    renderChess(<ChessAppPage />)

    fireEvent.change(screen.getByLabelText('Move notation'), { target: { value: 'e2e4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply move' }))

    expect(screen.getByText('Played e4. Black to move.')).toBeTruthy()
    expect(screen.getByText('Last move: e4')).toBeTruthy()
    expect(screen.getByText('Legal moves: 20')).toBeTruthy()
    expect(
      sendState.mock.calls.some(
        ([payload]) =>
          payload.status === 'active' &&
          payload.state?.lastMove === 'e4' &&
          payload.state?.turn === 'b'
      )
    ).toBe(true)
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

  it('lets the user undo and reset the board from the move tools panel', () => {
    renderChess(<ChessAppPage />)

    fireEvent.change(screen.getByLabelText('Move notation'), { target: { value: 'e2e4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply move' }))
    expect(screen.getByText('Last move: e4')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Undo move' }))
    expect(screen.getByText('Undid the last move. Review the new position.')).toBeTruthy()
    expect(screen.getByText('Last move: No moves yet')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Move notation'), { target: { value: 'd2d4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply move' }))
    expect(screen.getByText('Last move: d4')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Reset board' }))
    expect(screen.getByText('Board reset to the starting position.')).toBeTruthy()
    expect(screen.getByText('Last move: No moves yet')).toBeTruthy()
    expect(screen.getByText('Recent moves: No moves yet')).toBeTruthy()
  })
})
