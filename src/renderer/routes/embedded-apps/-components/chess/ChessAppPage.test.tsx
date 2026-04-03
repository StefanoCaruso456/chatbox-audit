/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
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

  it('lets the user make a simple opening move on the board', () => {
    renderChess(<ChessAppPage />)

    fireEvent.click(screen.getByTestId('chess-square-e2'))
    expect(screen.getByText('Selected E2. Choose a destination square.')).toBeTruthy()

    fireEvent.click(screen.getByTestId('chess-square-e4'))
    expect(screen.getByText('Played e4. Black to move.')).toBeTruthy()
  })
})
