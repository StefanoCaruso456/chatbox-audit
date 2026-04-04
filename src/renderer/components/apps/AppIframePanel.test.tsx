/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
  uiStore.setState({
    approvedAppsModalOpen: false,
    activeApprovedAppId: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
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

  it('keeps Flashcards Coach on the embedded host runtime path', () => {
    uiStore.setState({ activeApprovedAppId: 'flashcards-coach' })

    renderPanel(<AppIframePanel />)

    const host = screen.getByTestId('embedded-app-host')
    expect(host.getAttribute('data-subtitle')).toBe('TutorMeAI sidebar runtime')
    expect(host.getAttribute('data-description')).toContain('governed TutorMeAI sidebar runtime')
    expect(host.getAttribute('data-src')).toMatch(
      /^http:\/\/localhost:3000\/embedded-apps\/flashcards\?chatbridge_panel=1&chatbridge_launch=.+$/
    )
    expect(host.getAttribute('data-runtime')).toContain('"conversationId":"conversation.sidebar.flashcards-coach"')
    expect(host.getAttribute('data-runtime')).toContain('"expectedOrigin":"http://localhost:3000"')
  })
})
