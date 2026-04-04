/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FlashcardsAppPage } from './FlashcardsAppPage'

const sendCompletion = vi.fn()
const sendState = vi.fn()
const defaultRuntimeContext = {
  conversationId: 'conversation.sidebar.flashcards',
  appSessionId: 'app-session.sidebar.flashcards',
}
const defaultInvocationMessage = {
  payload: {
    toolName: 'flashcards.start-session',
    toolCallId: 'tool-call.sidebar.flashcards',
    arguments: {
      topic: 'fractions',
    },
  },
}
const bridgeState: {
  runtimeContext: Record<string, unknown> | null
  invocationMessage: typeof defaultInvocationMessage | null
} = {
  runtimeContext: defaultRuntimeContext,
  invocationMessage: defaultInvocationMessage,
}

vi.mock('../useEmbeddedAppBridge', () => ({
  useEmbeddedAppBridge: () => ({
    runtimeContext: bridgeState.runtimeContext,
    invocationMessage: bridgeState.invocationMessage,
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
    bridgeState.runtimeContext = defaultRuntimeContext
    bridgeState.invocationMessage = defaultInvocationMessage
    window.history.replaceState({}, '', 'http://localhost:3000/embedded-apps/flashcards')
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

  afterEach(() => {
    window.history.replaceState({}, '', 'http://localhost:3000/embedded-apps/flashcards')
  })

  it('renders the flashcards deck with a dark runtime surface', () => {
    renderFlashcards(<FlashcardsAppPage />)

    expect(screen.getByTestId('flashcards-app-root').getAttribute('style')).toContain('linear-gradient')
    expect(screen.getByText('Flashcards Coach')).toBeTruthy()
    expect(screen.getByText('Current deck')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Finish session' })).toBeTruthy()
  })

  it('rebuilds the deck from bootstrap tool arguments when invoke is missing', () => {
    bridgeState.runtimeContext = {
      ...defaultRuntimeContext,
      initialState: {
        toolArguments: {
          topic: 'fractions',
        },
      },
    }
    bridgeState.invocationMessage = null

    renderFlashcards(<FlashcardsAppPage />)

    expect(screen.queryByText('Waiting for the host to send a study topic.')).toBeNull()
    expect(screen.getByText('Current deck')).toBeTruthy()
    expect(screen.getByText('fractions')).toBeTruthy()
    expect(screen.getByText('What is the clearest definition of fractions?')).toBeTruthy()
    expect(sendState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        state: expect.objectContaining({
          topic: 'fractions',
          currentCard: 1,
          currentPrompt: 'What is the clearest definition of fractions?',
          currentAnswer:
            'fractions is the core idea the student should be able to explain in one or two clear sentences.',
          answerRevealed: false,
          reviewedCount: 0,
        }),
      })
    )
  })

  it('rebuilds the deck from bootstrap state when invoke is missing', () => {
    bridgeState.runtimeContext = {
      ...defaultRuntimeContext,
      initialState: {
        topic: 'fractions',
        currentCard: 2,
        reviewedCardIds: ['fractions-1'],
      },
    }
    bridgeState.invocationMessage = null

    renderFlashcards(<FlashcardsAppPage />)

    expect(screen.queryByText('Waiting for the host to send a study topic.')).toBeNull()
    expect(screen.getByText('Current deck')).toBeTruthy()
    expect(screen.getByText('fractions')).toBeTruthy()
    expect(screen.getByText('Reviewed 1 of 5 cards')).toBeTruthy()
    expect(screen.getByText('Give one classroom-ready example of fractions.')).toBeTruthy()
    expect(sendState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        state: expect.objectContaining({
          topic: 'fractions',
          currentCard: 2,
          reviewedCardIds: ['fractions-1'],
          reviewedCount: 1,
        }),
      })
    )
  })

  it('rebuilds the deck from the direct iframe launch topic when runtime messages are absent', () => {
    bridgeState.runtimeContext = null
    bridgeState.invocationMessage = null
    window.history.replaceState({}, '', 'http://localhost:3000/embedded-apps/flashcards?topic=fractions')

    renderFlashcards(<FlashcardsAppPage />)

    expect(screen.queryByText('Waiting for the host to send a study topic.')).toBeNull()
    expect(screen.getByText('Current deck')).toBeTruthy()
    expect(screen.getByText('fractions')).toBeTruthy()
    expect(screen.getByText('What is the clearest definition of fractions?')).toBeTruthy()
  })

  it('keeps the live card state synced when the user navigates through the deck', () => {
    renderFlashcards(<FlashcardsAppPage />)

    sendState.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))

    expect(screen.getByText('Give one classroom-ready example of fractions.')).toBeTruthy()
    expect(sendState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        state: expect.objectContaining({
          currentCard: 2,
          currentPrompt: 'Give one classroom-ready example of fractions.',
          answerRevealed: false,
          canMovePrevious: true,
          canMoveNext: true,
        }),
      })
    )
  })

  it('reveals answers and finishes the study session with a completion summary', () => {
    renderFlashcards(<FlashcardsAppPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }))
    expect(screen.getByRole('button', { name: 'Hide answer' })).toBeTruthy()
    expect(screen.getByText(/fractions is the core idea/i)).toBeTruthy()
    expect(sendState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          answerRevealed: true,
          reviewedCardIds: ['fractions-1'],
          reviewedCount: 1,
        }),
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Finish session' }))
    expect(sendCompletion).toHaveBeenCalledTimes(1)
  })
})
