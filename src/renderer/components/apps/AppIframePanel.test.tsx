/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { getDefaultStore } from 'jotai'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentSessionIdAtom } from '@/stores/atoms'
import { uiStore } from '@/stores/uiStore'
import AppIframePanel from './AppIframePanel'

const { mockUseSession } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
}))

const { mockProbeForNewerBuild } = vi.hoisted(() => ({
  mockProbeForNewerBuild: vi.fn(),
}))

vi.mock('@/components/message-parts/EmbeddedAppHost', () => ({
  default: ({
    title,
    description,
    subtitle,
    runtime,
    src,
  }: {
    title: string
    description?: string
    subtitle?: string
    runtime?: object
    src?: string
  }) => (
    <div
      data-testid="embedded-app-host"
      data-description={description}
      data-subtitle={subtitle}
      data-runtime={JSON.stringify(runtime)}
      data-src={src}
    >
      {title}
    </div>
  ),
}))

vi.mock('@/hooks/useScreenChange', () => ({
  useScreenDownToMD: () => false,
}))

vi.mock('@/lib/build-freshness', () => ({
  probeForNewerBuild: () => mockProbeForNewerBuild(),
}))

vi.mock('@/stores/chatStore', async () => {
  const actual = await vi.importActual<typeof import('@/stores/chatStore')>('@/stores/chatStore')
  return {
    ...actual,
    useSession: (sessionId: string | null) => mockUseSession(sessionId),
  }
})

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    initReactI18next: {
      type: '3rdParty',
      init: () => undefined,
    },
    useTranslation: () => ({
      t: (key: string, options?: Record<string, string>) =>
        typeof options?.name === 'string' ? key.replace('{{name}}', options.name) : key,
    }),
  }
})

const initialUiState = uiStore.getState()

function renderPanel(jsx: ReactNode) {
  return render(<MantineProvider>{jsx}</MantineProvider>)
}

function attachCrossOriginIframeWindow(iframe: HTMLElement) {
  const contentWindow = {}

  Object.defineProperty(contentWindow, 'location', {
    get() {
      throw new DOMException('Cross-origin frame', 'SecurityError')
    },
  })

  Object.defineProperty(iframe, 'contentWindow', {
    value: contentWindow,
    configurable: true,
  })
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

beforeEach(() => {
  mockUseSession.mockReturnValue({ session: undefined })
  mockProbeForNewerBuild.mockResolvedValue(false)
  getDefaultStore().set(currentSessionIdAtom, 'session.test')
  uiStore.setState({
    approvedAppsModalOpen: false,
    activeApprovedAppId: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
  getDefaultStore().set(currentSessionIdAtom, null)
  uiStore.setState(initialUiState)
})

describe('AppIframePanel', () => {
  it('shows a district launch fallback for apps that need a school-specific URL', () => {
    uiStore.setState({ activeApprovedAppId: 'canvas-student' })
    vi.useFakeTimers()

    renderPanel(<AppIframePanel />)

    act(() => {
      vi.advanceTimersByTime(8_000)
    })

    expect(screen.getByTestId('app-iframe-panel-fallback')).toBeTruthy()
    expect(screen.getByText('Canvas needs a school-specific embedded launch link')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open Canvas login' })).toBeNull()
  })

  it('probes for a newer build when a runtime app opens in the sidebar', () => {
    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    renderPanel(<AppIframePanel />)

    expect(mockProbeForNewerBuild).toHaveBeenCalledTimes(1)
  })

  it('clears the load timeout after a successful iframe load', () => {
    vi.useFakeTimers()
    uiStore.setState({ activeApprovedAppId: 'duolingo' })

    renderPanel(<AppIframePanel />)

    const iframe = screen.getByTitle('Duolingo app panel')
    attachCrossOriginIframeWindow(iframe)

    fireEvent.load(iframe)

    act(() => {
      vi.advanceTimersByTime(8_000)
    })

    expect(screen.queryByTestId('app-iframe-panel-fallback')).toBeNull()
    expect(screen.queryByText('Loading Duolingo...')).toBeNull()
  })

  it('loads approved library apps in the governed ChatBridge workspace surface', () => {
    uiStore.setState({ activeApprovedAppId: 'duolingo' })

    renderPanel(<AppIframePanel />)

    const iframe = screen.getByTitle('Duolingo app panel') as HTMLIFrameElement

    expect(iframe.getAttribute('src')).toMatch(
      /^http:\/\/localhost:3000\/embedded-apps\/catalog\/duolingo\?chatbridge_panel=1&chatbridge_launch=.+$/
    )
    expect(screen.queryByText('Governed browser-session workspace')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open in new tab' })).toBeNull()
  })

  it('keeps TutorMeAI runtime apps on the embedded host path', () => {
    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    renderPanel(<AppIframePanel />)

    expect(screen.getByTestId('embedded-app-host').textContent).toContain('Chess Tutor live session')
    expect(screen.queryByTitle('Chess Tutor app panel')).toBeNull()
  })

  it('binds the sidebar runtime to the active conversation app session when one exists', () => {
    mockUseSession.mockReturnValue({
      session: {
        id: 'session.1',
        messages: [
          {
            id: 'message.1',
            timestamp: Date.parse('2026-04-03T20:43:21.000Z'),
            role: 'assistant',
            contentParts: [
              {
                type: 'embedded-app',
                appId: 'chess.internal',
                appName: 'Chess Tutor',
                appSessionId: 'app-session.chess.real',
                sourceUrl: 'http://localhost:3000/embedded-apps/chess',
                title: 'Chess Tutor',
                summary: 'Current board FEN: real-session-board',
                status: 'ready',
                allowedOrigin: 'http://localhost:3000',
                bridge: {
                  expectedOrigin: 'http://localhost:3000',
                  conversationId: 'conversation.real',
                  appSessionId: 'app-session.chess.real',
                  handshakeToken: 'runtime.real',
                  bootstrap: {
                    launchReason: 'chat-tool',
                    authState: 'connected',
                    availableTools: [],
                  },
                  pendingInvocation: {
                    toolCallId: 'tool-call.real',
                    toolName: 'chess.launch-game',
                  },
                },
              },
            ],
          },
        ],
      },
    })
    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    renderPanel(<AppIframePanel />)

    const host = screen.getByTestId('embedded-app-host')
    expect(host.getAttribute('data-description')).toContain('real-session-board')
    expect(host.getAttribute('data-subtitle')).toBe('app-session.chess.real')
    expect(host.getAttribute('data-runtime')).toContain('"conversationId":"conversation.real"')
    expect(host.getAttribute('data-runtime')).not.toContain('conversation.sidebar.chess-tutor')
  })

  it('keeps runtime apps on the current canonical launch url instead of a stale conversation iframe url', () => {
    mockUseSession.mockReturnValue({
      session: {
        id: 'session.2',
        messages: [
          {
            id: 'message.2',
            timestamp: Date.parse('2026-04-03T21:33:21.000Z'),
            role: 'assistant',
            contentParts: [
              {
                type: 'embedded-app',
                appId: 'chess.internal',
                appName: 'Chess Tutor',
                appSessionId: 'app-session.chess.stale',
                sourceUrl: 'https://old-preview.example/embedded-apps/chess',
                title: 'Chess Tutor',
                summary: 'Current board FEN: stale-preview-board',
                status: 'ready',
                allowedOrigin: 'https://old-preview.example',
                bridge: {
                  expectedOrigin: 'https://old-preview.example',
                  conversationId: 'conversation.stale',
                  appSessionId: 'app-session.chess.stale',
                  handshakeToken: 'runtime.stale',
                  bootstrap: {
                    launchReason: 'chat-tool',
                    authState: 'connected',
                    availableTools: [],
                  },
                },
              },
            ],
          },
        ],
      },
    })
    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    renderPanel(<AppIframePanel />)

    const host = screen.getByTestId('embedded-app-host')
    expect(host.getAttribute('data-src')).toMatch(
      /^http:\/\/localhost:3000\/embedded-apps\/chess\?chatbridge_panel=1&chatbridge_launch=.+$/
    )
    expect(host.getAttribute('data-runtime')).toContain('"expectedOrigin":"http://localhost:3000"')
    expect(host.getAttribute('data-runtime')).not.toContain('old-preview.example')
  })

  it('relaunches runtime apps from a fresh sidebar runtime when the latest conversation part is blocked', () => {
    mockUseSession.mockReturnValue({
      session: {
        id: 'session.3',
        messages: [
          {
            id: 'message.3',
            timestamp: Date.parse('2026-04-03T22:17:35.000Z'),
            role: 'assistant',
            contentParts: [
              {
                type: 'embedded-app',
                appId: 'chess.internal',
                appName: 'Chess Tutor',
                appSessionId: 'app-session.chess.blocked',
                sourceUrl: 'http://localhost:3000/embedded-apps/chess',
                title: 'Chess Tutor',
                summary: 'Current board FEN: blocked-board',
                status: 'error',
                errorMessage: 'The embedded app stopped responding after 45 seconds.',
                allowedOrigin: 'http://localhost:3000',
                bridge: {
                  expectedOrigin: 'http://localhost:3000',
                  conversationId: 'conversation.blocked',
                  appSessionId: 'app-session.chess.blocked',
                  handshakeToken: 'runtime.blocked',
                  bootstrap: {
                    launchReason: 'chat-tool',
                    authState: 'connected',
                    availableTools: [],
                  },
                  pendingInvocation: {
                    toolCallId: 'tool-call.blocked',
                    toolName: 'chess.launch-game',
                  },
                },
              },
            ],
          },
        ],
      },
    })
    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    renderPanel(<AppIframePanel />)

    const host = screen.getByTestId('embedded-app-host')
    expect(host.getAttribute('data-subtitle')).toBe('TutorMeAI sidebar runtime')
    expect(host.getAttribute('data-description')).toContain('relaunching in a fresh sidebar runtime')
    expect(host.getAttribute('data-runtime')).toContain('"conversationId":"conversation.sidebar.chess-tutor"')
    expect(host.getAttribute('data-runtime')).not.toContain('"conversationId":"conversation.blocked"')
  })
})
