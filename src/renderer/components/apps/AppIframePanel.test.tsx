/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { uiStore } from '@/stores/uiStore'
import AppIframePanel from './AppIframePanel'

vi.mock('@/components/message-parts/EmbeddedAppHost', () => ({
  default: ({ title }: { title: string }) => <div data-testid="embedded-app-host">{title}</div>,
}))

vi.mock('@/hooks/useScreenChange', () => ({
  useScreenDownToMD: () => false,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      typeof options?.name === 'string' ? key.replace('{{name}}', options.name) : key,
  }),
}))

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
})
