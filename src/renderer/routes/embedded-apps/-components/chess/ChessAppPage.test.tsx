/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ChessAppPage } from './ChessAppPage'

vi.mock('../useEmbeddedAppBridge', () => ({
  useEmbeddedAppBridge: () => ({
    runtimeContext: null,
    invocationMessage: null,
    sendCompletion: vi.fn(),
    sendError: vi.fn(),
    sendState: vi.fn(),
  }),
}))

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
  it('renders a visible 8x8 board with piece glyphs', () => {
    render(
      <MantineProvider>
        <ChessAppPage />
      </MantineProvider>
    )

    expect(screen.getByTestId('chess-board-grid')).toBeTruthy()
    expect(screen.getByTestId('chess-square-a8').textContent).toContain('♜')
    expect(screen.getByTestId('chess-square-e1').textContent).toContain('♔')
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(64)
  })
})
