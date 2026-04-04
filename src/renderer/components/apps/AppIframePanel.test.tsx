/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { getDefaultStore } from 'jotai'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentSessionIdAtom } from '@/stores/atoms'
import { getSidebarAppRuntimeSnapshot, resetSidebarAppRuntimeSnapshots } from '@/stores/sidebarAppRuntimeStore'
import { uiStore } from '@/stores/uiStore'
import AppIframePanel from './AppIframePanel'

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

vi.mock('@/stores/chatStore', () => ({
  useSession: () => ({
    session: null,
  }),
}))

vi.mock('@/lib/build-freshness', () => ({
  probeForNewerBuild: () => mockProbeForNewerBuild(),
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

function attachSameOriginIframeWindow(
  iframe: HTMLElement,
  options?: {
    postMessage?: ReturnType<typeof vi.fn>
  }
) {
  const postMessage = options?.postMessage ?? vi.fn()
  const contentWindow = {
    postMessage,
    location: {
      href: 'http://localhost:3000/embedded-apps/chess?chatbridge_panel=1',
    },
  }

  Object.defineProperty(iframe, 'contentWindow', {
    value: contentWindow,
    configurable: true,
  })

  Object.defineProperty(iframe, 'contentDocument', {
    value: {
      body: {
        children: [document.createElement('div')],
        childElementCount: 1,
        textContent: 'Chess Tutor',
      },
    },
    configurable: true,
  })

  return { postMessage }
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
  mockProbeForNewerBuild.mockResolvedValue(false)
  getDefaultStore().set(currentSessionIdAtom, 'session.test')
  resetSidebarAppRuntimeSnapshots()
  uiStore.setState({
    approvedAppsModalOpen: false,
    activeApprovedAppId: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
  resetSidebarAppRuntimeSnapshots()
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

  it('opens Chess Tutor as a governed direct iframe in the sidebar', () => {
    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    renderPanel(<AppIframePanel />)

    const iframe = screen.getByTitle('Chess Tutor app panel') as HTMLIFrameElement
    expect(iframe.getAttribute('src')).toMatch(
      /^http:\/\/localhost:3000\/embedded-apps\/chess\?chatbridge_panel=1&chatbridge_launch=.+$/
    )
    expect(screen.queryByTestId('embedded-app-host')).toBeNull()
  })

  it('sends the runtime bootstrap and invoke messages into the Chess sidebar iframe', () => {
    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    renderPanel(<AppIframePanel />)

    const iframe = screen.getByTitle('Chess Tutor app panel')
    const { postMessage } = attachSameOriginIframeWindow(iframe)

    fireEvent.load(iframe)

    expect(postMessage).toHaveBeenCalledTimes(2)
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      source: 'host',
      type: 'host.bootstrap',
      appId: 'chess.internal',
    })
    expect(postMessage.mock.calls[1]?.[0]).toMatchObject({
      source: 'host',
      type: 'host.invoke',
      appId: 'chess.internal',
    })
  })

  it('publishes live Chess sidebar state so chat can read the visible board', () => {
    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    renderPanel(<AppIframePanel />)

    const iframe = screen.getByTitle('Chess Tutor app panel')
    const { postMessage } = attachSameOriginIframeWindow(iframe)

    fireEvent.load(iframe)

    const bootstrapMessage = postMessage.mock.calls[0]?.[0]
    expect(bootstrapMessage).toMatchObject({
      source: 'host',
      type: 'host.bootstrap',
      appId: 'chess.internal',
    })

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: (iframe as HTMLIFrameElement).contentWindow,
          origin: 'http://localhost:3000',
          data: {
            version: 'v1',
            source: 'app',
            type: 'app.state',
            messageId: 'app.state.1',
            conversationId: bootstrapMessage.conversationId,
            appSessionId: bootstrapMessage.appSessionId,
            appId: 'chess.internal',
            sequence: 3,
            sentAt: new Date().toISOString(),
            security: bootstrapMessage.security,
            payload: {
              status: 'active',
              summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1. White to move.',
              state: {
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                turn: 'w',
                moveCount: 0,
              },
            },
          },
        })
      )
    })

    expect(getSidebarAppRuntimeSnapshot('session.test', 'chess.internal')).toMatchObject({
      approvedAppId: 'chess-tutor',
      appSessionId: bootstrapMessage.appSessionId,
      status: 'active',
    })
  })

  it('seeds the Chess sidebar snapshot with the starting FEN before iframe messages arrive', () => {
    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    renderPanel(<AppIframePanel />)

    expect(getSidebarAppRuntimeSnapshot('session.test', 'chess.internal')).toMatchObject({
      approvedAppId: 'chess-tutor',
      status: 'pending',
      latestStateDigest: expect.objectContaining({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moveCount: 0,
      }),
    })
  })

  it('accepts same-origin sidebar-state messages even when the embedded runtime handshake has not completed yet', () => {
    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    renderPanel(<AppIframePanel />)

    const iframe = screen.getByTitle('Chess Tutor app panel')
    attachSameOriginIframeWindow(iframe)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: (iframe as HTMLIFrameElement).contentWindow,
          origin: 'http://localhost:3000',
          data: {
            source: 'chatbridge-sidebar-app',
            type: 'sidebar-state',
            appId: 'chess.internal',
            payload: {
              status: 'active',
              summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1. White to move.',
              state: {
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                turn: 'w',
                moveCount: 0,
              },
            },
          },
        })
      )
    })

    expect(getSidebarAppRuntimeSnapshot('session.test', 'chess.internal')).toMatchObject({
      approvedAppId: 'chess-tutor',
      status: 'active',
      latestStateDigest: expect.objectContaining({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      }),
    })
  })

  it('opens Flashcards Coach as a governed direct iframe in the sidebar', () => {
    uiStore.setState({ activeApprovedAppId: 'flashcards-coach' })

    renderPanel(<AppIframePanel />)

    const iframe = screen.getByTitle('Flashcards Coach app panel') as HTMLIFrameElement
    expect(iframe.getAttribute('src')).toMatch(
      /^http:\/\/localhost:3000\/embedded-apps\/flashcards\?chatbridge_panel=1&chatbridge_launch=.+&topic=fractions$/
    )
    expect(screen.queryByTestId('embedded-app-host')).toBeNull()
  })
})
