/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import type { CompletionSignal } from '@shared/contracts/v1'
import { createMessage } from '@shared/types'
import type { Message, MessageEmbeddedAppPart } from '@shared/types/session'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import EmbeddedAppHost from '@/components/message-parts/EmbeddedAppHost'
import { deriveConversationAppContext, routeTutorMeAiAppRequest } from '@/packages/tutormeai-apps/orchestrator'
import { ChessAppPage } from '@/routes/embedded-apps/-components/chess/ChessAppPage'
import { FlashcardsAppPage } from '@/routes/embedded-apps/-components/flashcards/FlashcardsAppPage'
import { PlannerAppPage } from '@/routes/embedded-apps/-components/planner/PlannerAppPage'
import { settingsStore } from '@/stores/settingsStore'

const localOrigin = 'http://localhost:1212'
const originalParentDescriptor = Object.getOwnPropertyDescriptor(window, 'parent')

function renderWithMantine(jsx: ReactNode) {
  return render(<MantineProvider>{jsx}</MantineProvider>)
}

function extractEmbeddedAppPart(message: Message): MessageEmbeddedAppPart {
  const part = message.contentParts.find((candidate) => candidate.type === 'embedded-app')
  if (!part || part.type !== 'embedded-app') {
    throw new Error('Expected an embedded app message part')
  }

  return part
}

function dispatchBridgeMessage(payload: object, origin: string, source: MessageEventSource) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: payload,
      origin,
      source,
    })
  )
}

function installEmbeddedBridge(iframe: HTMLElement) {
  const frameWindow = {
    postMessage: vi.fn((payload: object, origin: string) => {
      dispatchBridgeMessage(payload, origin, frameWindow as unknown as MessageEventSource)
    }),
  } as unknown as Window

  Object.defineProperty(iframe, 'contentWindow', {
    value: frameWindow,
    configurable: true,
  })

  const parentBridge = {
    postMessage: vi.fn((payload: object, origin: string) => {
      dispatchBridgeMessage(payload, origin, frameWindow as unknown as MessageEventSource)
    }),
  }

  Object.defineProperty(window, 'parent', {
    value: parentBridge,
    configurable: true,
  })

  return {
    frameWindow,
    parentBridge,
  }
}

function buildCompletedLaunchMessage(message: Message, signal: CompletionSignal): Message {
  return {
    ...message,
    contentParts: message.contentParts.map((part) => {
      if (part.type !== 'embedded-app') {
        return part
      }

      return {
        ...part,
        status: 'ready',
        summary: signal.followUpContext.userVisibleSummary ?? signal.resultSummary,
        errorMessage: signal.status === 'failed' || signal.status === 'timed-out' ? signal.resultSummary : undefined,
        bridge: part.bridge
          ? {
              ...part.bridge,
              pendingInvocation: undefined,
              completion: {
                status: signal.status,
                resultSummary: signal.resultSummary,
                result: signal.result,
                errorMessage:
                  signal.status === 'failed' || signal.status === 'timed-out' ? signal.resultSummary : undefined,
              },
            }
          : part.bridge,
      }
    }),
  }
}

function renderLifecycleHarness(input: {
  part: MessageEmbeddedAppPart
  page: ReactNode
  onCompletion?: (signal: CompletionSignal) => void
}) {
  const onCompletion = vi.fn(input.onCompletion)
  const onStateUpdate = vi.fn()

  renderWithMantine(
    <>
      <EmbeddedAppHost
        appId={input.part.appId}
        appName={input.part.appName}
        appSessionId={input.part.appSessionId}
        src={input.part.sourceUrl}
        title={input.part.title}
        description={input.part.summary}
        state={input.part.status === 'loading' ? 'loading' : input.part.status === 'error' ? 'error' : 'ready'}
        sandbox={input.part.sandbox}
        runtime={
          input.part.bridge
            ? {
                expectedOrigin: input.part.bridge.expectedOrigin,
                conversationId: input.part.bridge.conversationId,
                appSessionId: input.part.bridge.appSessionId ?? input.part.appSessionId,
                handshakeToken: input.part.bridge.handshakeToken,
                heartbeatTimeoutMs: input.part.bridge.heartbeatTimeoutMs,
                bootstrap: input.part.bridge.bootstrap,
                pendingInvocation: input.part.bridge.pendingInvocation,
                completion: input.part.bridge.completion
                  ? {
                      status: input.part.bridge.completion.status,
                      summary: input.part.bridge.completion.resultSummary,
                      resultPayload: input.part.bridge.completion.result,
                      errorMessage: input.part.bridge.completion.errorMessage,
                    }
                  : undefined,
                onStateUpdate,
                onCompletion,
              }
            : undefined
        }
      />
      {input.page}
    </>
  )

  const iframe = screen.getByTestId('embedded-app-host-iframe')
  const bridge = installEmbeddedBridge(iframe)
  fireEvent.load(iframe)

  return {
    iframe,
    onCompletion,
    onStateUpdate,
    ...bridge,
  }
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

afterEach(() => {
  if (originalParentDescriptor) {
    Object.defineProperty(window, 'parent', originalParentDescriptor)
  }
  vi.restoreAllMocks()
})

describe('TutorMeAI embedded app lifecycle integration', () => {
  it('completes the flashcards app lifecycle and produces follow-up context', async () => {
    const launch = await routeTutorMeAiAppRequest({
      origin: localOrigin,
      conversationId: 'conversation.flashcards',
      userId: 'user.flashcards',
      userRequest: 'start flashcards on fractions',
      requestMessageId: 'message.flashcards.request',
      previousMessages: [createMessage('user', 'hello')],
    })

    expect(launch.kind).toBe('invoke-tool')
    if (launch.kind !== 'invoke-tool') {
      return
    }

    const part = extractEmbeddedAppPart(launch.message)
    const { onCompletion } = renderLifecycleHarness({
      part,
      page: <FlashcardsAppPage />,
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reveal answer/i })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /reveal answer/i }))
    fireEvent.click(screen.getByRole('button', { name: /send study summary to chat/i }))

    await waitFor(() => {
      expect(onCompletion).toHaveBeenCalledTimes(1)
    })

    const completion = onCompletion.mock.calls[0]?.[0]
    expect(completion).toBeDefined()
    if (!completion) {
      return
    }
    expect(completion.appId).toBe('flashcards.public')
    expect(completion.resultSummary).toContain('fractions')
    expect(completion.followUpContext.summary).toContain('flashcard deck')
    expect(screen.getByText('Completed')).toBeTruthy()

    const followUpContext = deriveConversationAppContext(
      'conversation.flashcards',
      [createMessage('user', 'start flashcards on fractions'), buildCompletedLaunchMessage(launch.message, completion)],
      '2026-04-02T10:00:00.000Z',
      'Can we talk about the flashcards result?'
    )

    expect(followUpContext?.recentCompletions[0]?.appId).toBe('flashcards.public')
    expect(followUpContext?.recentCompletions[0]?.resultSummary).toBe(completion.resultSummary)
  })

  it('completes the planner auth-required lifecycle after the user connects', async () => {
    settingsStore.setState((state) => ({
      tutorMeAIProfile: {
        ...state.tutorMeAIProfile,
        name: 'stefano',
        email: 'stefanocaruso456@gmail.com',
      },
    }))

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              message: 'No OAuth connection matched the supplied selector.',
            },
          }),
          {
            status: 404,
            headers: {
              'content-type': 'application/json',
            },
          }
        )
      )
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              connection: {
                oauthConnectionId: 'oauth-connection.1',
                userId: 'user.stefanocaruso456.gmail.com',
                appId: 'planner.oauth',
                provider: 'google',
                status: 'connected',
                requestedScopes: ['openid', 'email', 'profile'],
                externalAccountId: 'google-user-123',
                scopes: ['openid', 'email', 'profile'],
                tokenType: 'Bearer',
                accessTokenExpiresAt: '2026-04-05T04:00:00.000Z',
                refreshTokenExpiresAt: null,
                lastRefreshedAt: '2026-04-05T03:00:00.000Z',
                connectedAt: '2026-04-05T03:00:00.000Z',
                disconnectedAt: null,
                createdAt: '2026-04-05T03:00:00.000Z',
                updatedAt: '2026-04-05T03:00:00.000Z',
                hasAccessToken: true,
                hasRefreshToken: true,
              },
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          }
        )
      )

    vi.stubGlobal('fetch', fetchMock)
    const popup = {
      closed: false,
      close: vi.fn(),
    } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(popup)

    const launch = await routeTutorMeAiAppRequest({
      origin: localOrigin,
      conversationId: 'conversation.planner',
      userId: 'user.planner',
      userRequest: 'open planner for overdue work',
      requestMessageId: 'message.planner.request',
      previousMessages: [createMessage('user', 'hello')],
    })

    expect(launch.kind).toBe('invoke-tool')
    if (launch.kind !== 'invoke-tool') {
      return
    }

    const part = extractEmbeddedAppPart(launch.message)
    expect(part.bridge?.bootstrap?.authState).toBe('required')

    const { onCompletion } = renderLifecycleHarness({
      part,
      page: <PlannerAppPage />,
    })

    await waitFor(() => {
      expect(screen.getByText(/requires a user-level oauth connection/i)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /connect account/i }))

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://chatbox-audit-production.up.railway.app',
        data: {
          type: 'tutormeai.oauth.callback',
          ok: true,
          appId: 'planner.oauth',
          provider: 'google',
          userId: 'user.stefanocaruso456.gmail.com',
          status: 'connected',
        },
      })
    )

    await waitFor(() => {
      expect(screen.getAllByText('Connected').length).toBeGreaterThan(0)
    })

    expect(fetchMock).toHaveBeenCalled()
    expect(window.open).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /send planner summary to chat/i }))

    await waitFor(() => {
      expect(onCompletion).toHaveBeenCalledTimes(1)
    })

    const completion = onCompletion.mock.calls[0]?.[0]
    expect(completion).toBeDefined()
    if (!completion) {
      return
    }
    expect(completion.appId).toBe('planner.oauth')
    expect(completion.resultSummary).toContain('overdue')
    expect(completion.followUpContext.userVisibleSummary).toContain('Planner connected')
    expect(screen.getByText('Completed')).toBeTruthy()
  })

  it('completes the chess lifecycle after a board interaction and share action', async () => {
    const launch = await routeTutorMeAiAppRequest({
      origin: localOrigin,
      conversationId: 'conversation.chess',
      userId: 'user.chess',
      userRequest: "let's play chess",
      requestMessageId: 'message.chess.request',
      previousMessages: [createMessage('user', 'hello')],
    })

    expect(launch.kind).toBe('invoke-tool')
    if (launch.kind !== 'invoke-tool') {
      return
    }

    const part = extractEmbeddedAppPart(launch.message)
    const { onCompletion } = renderLifecycleHarness({
      part,
      page: <ChessAppPage />,
    })

    await waitFor(() => {
      expect(screen.getByText(/practice board ready/i)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /e2/i }))
    fireEvent.click(screen.getByRole('button', { name: /e4/i }))

    await waitFor(() => {
      expect(screen.getByText(/played e4/i)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /send board summary to chat/i }))

    await waitFor(() => {
      expect(onCompletion).toHaveBeenCalledTimes(1)
    })

    const completion = onCompletion.mock.calls[0]?.[0]
    expect(completion).toBeDefined()
    if (!completion) {
      return
    }
    expect(completion.appId).toBe('chess.internal')
    expect(JSON.stringify(completion.result)).toContain('e4')
    expect(completion.followUpContext.summary).toContain('chess board state')
    expect(screen.getByText('Completed')).toBeTruthy()
  })
})
