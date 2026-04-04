/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChessAppPage } from './ChessAppPage'

const sendCompletion = vi.fn()
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
    sendState.mockReset()
  })

  it('renders a visible 8x8 board with piece glyphs', () => {
    renderChess(<ChessAppPage />)

    expect(screen.getByTestId('chess-board-grid')).toBeTruthy()
    expect(screen.getByTestId('chess-square-a8').textContent).toContain('♜')
    expect(screen.getByTestId('chess-square-e1').textContent).toContain('♔')
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

  it('shows legal destinations for the selected piece in the board helper', () => {
    renderChess(<ChessAppPage />)

    fireEvent.click(screen.getByTestId('chess-square-g1'))

    const legalDestinations = screen.getByText(/Legal destinations:/)
    expect(screen.getByText('Selected G1. Choose a destination square.')).toBeTruthy()
    expect(legalDestinations.textContent).toContain('F3')
    expect(legalDestinations.textContent).toContain('H3')
  })
})
