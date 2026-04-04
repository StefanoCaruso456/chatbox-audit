/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FlashcardsAppPage } from './FlashcardsAppPage'

const sendCompletion = vi.fn()
const sendState = vi.fn()
const runtimeContext = {
  conversationId: 'conversation.sidebar.flashcards',
  appSessionId: 'app-session.sidebar.flashcards',
}
const invocationMessage = {
  payload: {
    toolName: 'flashcards.start-session',
    toolCallId: 'tool-call.sidebar.flashcards',
    arguments: {
      topic: 'fractions',
    },
  },
}

vi.mock('../useEmbeddedAppBridge', () => ({
  useEmbeddedAppBridge: () => ({
    runtimeContext,
    invocationMessage,
    sendCompletion,
    sendState,
  }),
}))

function renderFlashcards(jsx: ReactNode) {
  return render(<MantineProvider>{jsx}</MantineProvider>)
}

describe('FlashcardsAppPage', () => {
  beforeEach(() => {
    sendCompletion.mockReset()
    sendState.mockReset()
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

  it('renders the flashcards deck with a dark runtime surface', () => {
    renderFlashcards(<FlashcardsAppPage />)

    expect(screen.getByTestId('flashcards-app-root').getAttribute('style')).toContain('linear-gradient')
    expect(screen.getByText('Flashcards Coach')).toBeTruthy()
    expect(screen.getByText('Current deck')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeTruthy()
  })

  it('reveals answers and can send the study summary back to chat', () => {
    renderFlashcards(<FlashcardsAppPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }))
    expect(screen.getByText('Reviewed')).toBeTruthy()
    expect(screen.getByText(/fractions is the core idea/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Send study summary to chat' }))
    expect(sendCompletion).toHaveBeenCalledTimes(1)
  })
})
