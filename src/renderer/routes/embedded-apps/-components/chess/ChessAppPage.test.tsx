/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChessAppPage } from './ChessAppPage'

const sendCompletion = vi.fn()
const sendError = vi.fn()
const sendState = vi.fn()
const runtimeContext = {
  conversationId: 'conversation.sidebar.chess',
  appSessionId: 'app-session.sidebar.chess',
}
const invocationMessage = {
  payload: {
    toolName: 'chess.launch-game',
    toolCallId: 'tool-call.sidebar.chess',
    arguments: {
      mode: 'practice',
    },
  },
}

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
    sendCompletion.mockReset()
    sendError.mockReset()
    sendState.mockReset()
  })

  it('renders a visible board with 64 clickable squares', () => {
    renderChess(<ChessAppPage />)

    expect(screen.getByTestId('chess-board-grid')).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(66)

    const e2Square = screen.getByTestId('chess-square-e2')
    expect(e2Square.getAttribute('aria-label')).toContain('White P')
    expect(within(e2Square).getByText('♙')).toBeTruthy()
  })

  it('lets the user make a simple opening move on the board', () => {
    renderChess(<ChessAppPage />)

    fireEvent.click(screen.getByTestId('chess-square-e2'))
    expect(screen.getByText('Selected E2. Choose a destination square.')).toBeTruthy()

    fireEvent.click(screen.getByTestId('chess-square-e4'))
    expect(screen.getByText('Played e4. Black to move.')).toBeTruthy()
  })
})
