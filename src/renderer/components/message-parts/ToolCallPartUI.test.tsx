/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { MessageToolCallPart } from '@shared/types'
import { ToolCallPartUI } from './ToolCallPartUI'

const { mockSubmitNewUserMessage } = vi.hoisted(() => ({
  mockSubmitNewUserMessage: vi.fn(),
}))

vi.mock('@/stores/sessionActions', () => ({
  submitNewUserMessage: (...args: unknown[]) => mockSubmitNewUserMessage(...args),
}))

vi.mock('@/stores/toastActions', () => ({
  add: vi.fn(),
}))

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    initReactI18next: {
      type: '3rdParty',
      init: () => undefined,
    },
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

function renderToolCall(jsx: ReactNode) {
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

describe('ToolCallPartUI chess coaching cards', () => {
  it('renders a coaching card for chess board recommendations and submits the play prompt when clicked', async () => {
    mockSubmitNewUserMessage.mockResolvedValue(undefined)

    const part: MessageToolCallPart = {
      type: 'tool-call',
      state: 'result',
      toolCallId: 'tool-call.chess.get-board-state.1',
      toolName: 'chess.get-board-state',
      args: {
        scope: 'current-position',
      },
      result: {
        appSessionId: 'app-session.chess.1',
        turn: 'white',
        phase: 'opening',
        lastMove: 'No moves yet',
        status: 'Position is stable',
        legalMoveCount: 20,
        candidateMoves: ['d4', 'e4', 'Nc3'],
        recommendedMove: 'd4',
        recommendationReason: 'claims the center and opens lines for rapid development',
        coachingTip: 'In the opening, White usually wants central space first.',
        alternativeMoves: ['e4', 'Nc3'],
        moveExecutionAvailable: true,
      },
    }

    renderToolCall(<ToolCallPartUI sessionId="session.chess.1" part={part} />)

    expect(screen.getByText('Chess Coach')).toBeTruthy()
    expect(screen.getByText('Recommended move')).toBeTruthy()
    expect(screen.getByText('d4')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play d4' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Play d4' }))

    await waitFor(() => {
      expect(mockSubmitNewUserMessage).toHaveBeenCalledTimes(1)
    })

    const [sessionId, params] = mockSubmitNewUserMessage.mock.calls[0]
    expect(sessionId).toBe('session.chess.1')
    expect(params.needGenerating).toBe(true)
    expect(params.newUserMsg.contentParts).toMatchObject([{ type: 'text', text: 'play d4' }])
  })

  it('renders a coaching card for played chess moves with guided next-step prompts', () => {
    const part: MessageToolCallPart = {
      type: 'tool-call',
      state: 'result',
      toolCallId: 'tool-call.chess.make-move.1',
      toolName: 'chess.make-move',
      args: {
        move: 'Nf6',
      },
      result: {
        appliedMove: 'Nf6',
        turn: 'white',
        summary: 'Move played: Nf6. White to move.',
        explanation: 'develops a knight toward the center while keeping options flexible',
        strategicTheme: 'develop pieces before starting direct attacks',
        coachingTip: 'Bring knights out before launching flank pawns.',
        alternativeMoves: ['e4', 'Nf3'],
      },
    }

    renderToolCall(<ToolCallPartUI sessionId="session.chess.2" part={part} />)

    expect(screen.getByText('Move played')).toBeTruthy()
    expect(screen.getByText('Nf6')).toBeTruthy()
    expect(screen.getByText(/Why it works:/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Best reply for White' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Why Nf6?' })).toBeTruthy()
  })
})
