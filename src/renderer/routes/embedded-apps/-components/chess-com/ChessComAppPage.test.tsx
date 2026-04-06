/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChessComAppPage } from './ChessComAppPage'

const testConfig = vi.hoisted(() => ({
  backendOrigin: 'https://backend.example.com',
  defaultEmbedUrl: 'https://www.chess.com/emboard?id=10477955&_height=640',
}))

const bridgeMocks = vi.hoisted(() => ({
  bridgeState: {
    runtimeContext: {
      conversationId: 'conversation.sidebar.chess-com',
      appSessionId: 'app-session.sidebar.chess-com',
      initialState: {
        embedUrl: testConfig.defaultEmbedUrl,
      },
    },
    invocationMessage: null as {
      payload: {
        toolName: string
        toolCallId: string
        arguments: Record<string, string>
      }
    } | null,
  },
  postSidebarDirectIframeStateMessage: vi.fn(),
  sendCompletion: vi.fn(),
  sendError: vi.fn(),
  sendState: vi.fn(),
}))

const INITIAL_PGN = `[Event "Example"]
[Site "?"]
[Date "????.??.??"]
[Round "?"]
[White "White"]
[Black "Black"]
[Result "*"]
[FEN "8/8/4k3/7p/5r2/5K2/8/8 w - - 0 91"]
[SetUp "1"]

*`

vi.mock('../useEmbeddedAppBridge', () => ({
  useEmbeddedAppBridge: () => ({
    runtimeContext: bridgeMocks.bridgeState.runtimeContext,
    invocationMessage: bridgeMocks.bridgeState.invocationMessage,
    sendCompletion: bridgeMocks.sendCompletion,
    sendError: bridgeMocks.sendError,
    sendState: bridgeMocks.sendState,
  }),
}))

vi.mock('@/components/apps/sidebarDirectIframeState', () => ({
  postSidebarDirectIframeStateMessage: bridgeMocks.postSidebarDirectIframeStateMessage,
}))

vi.mock('@/data/approvedApps', () => ({
  getApprovedAppById: () => ({
    id: 'chess-com',
    name: 'Chess.com',
    integrationConfig: {
      defaultLaunchUrl: testConfig.defaultEmbedUrl,
      launchUrlLabel: 'Chess.com emboard URL',
      launchUrlPlaceholder: testConfig.defaultEmbedUrl,
    },
  }),
}))

vi.mock('@/lib/approvedAppLaunchConfig', () => ({
  getLaunchUrlValidationMessage: () => null,
  getPreviewReferrerPolicy: () => 'strict-origin-when-cross-origin',
  normalizeLaunchUrl: (_app: unknown, value: string) => value,
}))

vi.mock('@/lib/approvedAppLaunchOverrides', () => ({
  getApprovedAppLaunchOverride: () => '',
  persistApprovedAppLaunchOverride: vi.fn(),
}))

vi.mock('@/packages/tutormeai-auth/client', () => ({
  resolveTutorMeAIBackendOrigin: () => testConfig.backendOrigin,
}))

function renderChessCom(jsx: ReactNode) {
  return render(<MantineProvider>{jsx}</MantineProvider>)
}

describe('ChessComAppPage', () => {
  beforeEach(() => {
    bridgeMocks.sendCompletion.mockReset()
    bridgeMocks.sendError.mockReset()
    bridgeMocks.sendState.mockReset()
    bridgeMocks.postSidebarDirectIframeStateMessage.mockReset()
    bridgeMocks.bridgeState.runtimeContext = {
      conversationId: 'conversation.sidebar.chess-com',
      appSessionId: 'app-session.sidebar.chess-com',
      initialState: {
        embedUrl: testConfig.defaultEmbedUrl,
      },
    }
    bridgeMocks.bridgeState.invocationMessage = null

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              id: 10477955,
              type: 'chessGame',
              boardOptions: {
                coordinates: 'inside',
                flipBoard: false,
                colorScheme: 'bases',
                pieceStyle: 'neo_wood',
              },
              setup: [
                {
                  pgn: INITIAL_PGN,
                  nodeLimits: {
                    focusNode: 0,
                    beginNode: 0,
                    endNode: 0,
                  },
                  tags: {
                    white: 'White',
                    black: 'Black',
                  },
                  variant: 'Chess',
                },
              ],
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      )
    )

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
    window.history.replaceState({}, '', 'http://localhost:3000/embedded-apps/chess-com')
  })

  it('keeps the raw Chess.com iframe mounted while a synced replay loads after a move', async () => {
    const view = renderChessCom(<ChessComAppPage />)

    await waitFor(() =>
      expect(
        screen.getByText('Chess.com is ready. Ask for the best move, a board scan, or a line explanation.')
      ).toBeTruthy()
    )

    const viewer = screen.getByTestId('chess-com-official-viewer')
    const rawIframeBeforeMove = viewer.querySelector(
      'iframe[title="Chess.com diagram 10477955"]'
    ) as HTMLIFrameElement | null

    expect(rawIframeBeforeMove).toBeTruthy()
    expect(rawIframeBeforeMove?.src).toBe(testConfig.defaultEmbedUrl)

    bridgeMocks.bridgeState.invocationMessage = {
      payload: {
        toolName: 'chess.make-move',
        toolCallId: 'tool-call.sidebar.chess-com.move',
        arguments: {
          move: 'Kxf4',
        },
      },
    }

    view.rerender(
      <MantineProvider>
        <ChessComAppPage />
      </MantineProvider>
    )

    await waitFor(() =>
      expect(bridgeMocks.sendCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCallId: 'tool-call.sidebar.chess-com.move',
          status: 'succeeded',
          result: expect.objectContaining({
            requestedMove: 'Kxf4',
            appliedMove: 'Kxf4',
            turn: 'black',
          }),
        })
      )
    )

    expect(screen.getByText(/Played Kxf4 on the Chess\.com board/i)).toBeTruthy()

    const rawIframeAfterMove = viewer.querySelector(
      'iframe[title="Chess.com diagram 10477955"]'
    ) as HTMLIFrameElement | null
    const patchedIframe = viewer.querySelector(
      'iframe[title="Chess.com diagram 10477955 synced replay"]'
    ) as HTMLIFrameElement | null

    expect(rawIframeAfterMove).toBe(rawIframeBeforeMove)
    expect(rawIframeAfterMove?.src).toBe(testConfig.defaultEmbedUrl)
    expect(patchedIframe).toBeTruthy()
    expect(patchedIframe?.src).toContain(`${testConfig.backendOrigin}/api/chess-com/viewer/10477955`)
    expect(patchedIframe?.className).toContain('opacity-0')
  })
})
