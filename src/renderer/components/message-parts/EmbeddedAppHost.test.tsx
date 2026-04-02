/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import EmbeddedAppHost from './EmbeddedAppHost'
import { buildEmbeddedAppSandbox, getEmbeddedAppStatusCopy, normalizeEmbeddedAppSrc } from './embedded-app-host'

function renderHost(jsx: ReactNode) {
  return render(<MantineProvider>{jsx}</MantineProvider>)
}

function attachIframeWindow(iframe: HTMLElement) {
  const contentWindow = {
    postMessage: vi.fn(),
  } as unknown as Window

  Object.defineProperty(iframe, 'contentWindow', {
    value: contentWindow,
    configurable: true,
  })

  return contentWindow
}

function dispatchRuntimeMessage(iframe: HTMLElement, payload: object, origin = 'https://example.com') {
  const source = (iframe as HTMLIFrameElement).contentWindow as MessageEventSource
  window.dispatchEvent(
    new MessageEvent('message', {
      data: payload,
      origin,
      source,
    })
  )
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
  vi.useRealTimers()
})

describe('embedded app host helpers', () => {
  it('normalizes safe iframe urls and rejects unsafe values', () => {
    expect(normalizeEmbeddedAppSrc(' https://example.com/app ')).toBe('https://example.com/app')
    expect(normalizeEmbeddedAppSrc('javascript:alert(1)')).toBeNull()
    expect(normalizeEmbeddedAppSrc('')).toBeNull()
  })

  it('returns copy for each embedded app state and sanitizes sandbox attributes', () => {
    expect(getEmbeddedAppStatusCopy('loading').badge).toBe('Launching')
    expect(getEmbeddedAppStatusCopy('ready').title).toContain('active')
    expect(getEmbeddedAppStatusCopy('complete').badge).toBe('Completed')
    expect(getEmbeddedAppStatusCopy('error').description).toContain('could not render')
    expect(buildEmbeddedAppSandbox('allow-same-origin allow-same-origin allow-top-navigation')).toBe(
      'allow-scripts allow-forms allow-popups allow-same-origin'
    )
  })
})

describe('EmbeddedAppHost', () => {
  it('renders a loading shell with an iframe and status overlay', () => {
    renderHost(
      <EmbeddedAppHost
        appId="chess.internal"
        appName="Chess Tutor"
        src="https://example.com/chess"
        loadingLabel="Preparing chess board"
      />
    )

    expect(screen.getByTestId('embedded-app-host')).toBeTruthy()
    expect(screen.getByTestId('embedded-app-host-iframe')).toBeTruthy()
    expect(screen.getByTestId('embedded-app-host-overlay').textContent).toContain('Preparing chess board')
  })

  it('posts bootstrap and invoke messages to the iframe once it loads', async () => {
    renderHost(
      <EmbeddedAppHost
        appId="weather.public"
        appName="Weather Dashboard"
        src="https://example.com/weather"
        runtime={{
          expectedOrigin: 'https://example.com',
          conversationId: 'conversation.1',
          appSessionId: 'app-session.weather.1',
          handshakeToken: 'nonce-weather-1',
          heartbeatTimeoutMs: 5_000,
          bootstrap: {
            launchReason: 'chat-tool',
            authState: 'connected',
            grantedPermissions: ['session:write', 'tool:invoke'],
          },
          pendingInvocation: {
            toolCallId: 'tool-call.weather.1',
            toolName: 'weather.lookup-current',
            arguments: {
              location: 'Chicago, IL',
            },
            timeoutMs: 10_000,
          },
        }}
      />
    )

    const iframe = screen.getByTestId('embedded-app-host-iframe')
    const contentWindow = attachIframeWindow(iframe)

    fireEvent.load(iframe)

    await waitFor(() => {
      expect(contentWindow.postMessage).toHaveBeenCalledTimes(2)
    })

    const [bootstrapMessage, bootstrapOrigin] = vi.mocked(contentWindow.postMessage).mock.calls[0]
    expect(bootstrapOrigin).toBe('https://example.com')
    expect(bootstrapMessage.type).toBe('host.bootstrap')

    const [invokeMessage, invokeOrigin] = vi.mocked(contentWindow.postMessage).mock.calls[1]
    expect(invokeOrigin).toBe('https://example.com')
    expect(invokeMessage.type).toBe('host.invoke')
  })

  it('updates the visible summary when the embedded app sends a state message', async () => {
    const onStateUpdate = vi.fn()

    renderHost(
      <EmbeddedAppHost
        appId="weather.public"
        appName="Weather Dashboard"
        src="https://example.com/weather"
        runtime={{
          expectedOrigin: 'https://example.com',
          conversationId: 'conversation.1',
          appSessionId: 'app-session.weather.1',
          handshakeToken: 'nonce-weather-1',
          onStateUpdate,
        }}
      />
    )

    const iframe = screen.getByTestId('embedded-app-host-iframe')
    attachIframeWindow(iframe)
    fireEvent.load(iframe)

    dispatchRuntimeMessage(iframe, {
      version: 'v1',
      messageId: 'msg.runtime.weather.1',
      conversationId: 'conversation.1',
      appSessionId: 'app-session.weather.1',
      appId: 'weather.public',
      sequence: 1,
      sentAt: '2026-04-01T12:00:00.000Z',
      security: {
        handshakeToken: 'nonce-weather-1',
        expectedOrigin: 'https://example.com',
      },
      source: 'app',
      type: 'app.state',
      payload: {
        status: 'active',
        summary: 'Forecast loaded for Chicago.',
        state: {
          location: 'Chicago, IL',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Forecast loaded for Chicago.')).toBeTruthy()
    })

    expect(onStateUpdate).toHaveBeenCalledTimes(1)
  })

  it('marks the app as completed when it receives a completion signal', async () => {
    const onCompletion = vi.fn()

    renderHost(
      <EmbeddedAppHost
        appId="weather.public"
        appName="Weather Dashboard"
        src="https://example.com/weather"
        runtime={{
          expectedOrigin: 'https://example.com',
          conversationId: 'conversation.1',
          appSessionId: 'app-session.weather.1',
          handshakeToken: 'nonce-weather-1',
          onCompletion,
        }}
      />
    )

    const iframe = screen.getByTestId('embedded-app-host-iframe')
    attachIframeWindow(iframe)
    fireEvent.load(iframe)

    dispatchRuntimeMessage(iframe, {
      version: 'v1',
      messageId: 'msg.runtime.weather.2',
      conversationId: 'conversation.1',
      appSessionId: 'app-session.weather.1',
      appId: 'weather.public',
      sequence: 2,
      sentAt: '2026-04-01T12:01:00.000Z',
      security: {
        handshakeToken: 'nonce-weather-1',
        expectedOrigin: 'https://example.com',
      },
      source: 'app',
      type: 'app.complete',
      payload: {
        version: 'v1',
        conversationId: 'conversation.1',
        appSessionId: 'app-session.weather.1',
        appId: 'weather.public',
        status: 'succeeded',
        resultSummary: 'Forecast ready for discussion.',
        completedAt: '2026-04-01T12:01:05.000Z',
        followUpContext: {
          summary: 'Use the forecast to answer weather planning questions.',
          userVisibleSummary: 'Forecast ready for discussion.',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeTruthy()
      expect(screen.getByText('Forecast ready for discussion.')).toBeTruthy()
    })

    expect(onCompletion).toHaveBeenCalledTimes(1)
  })

  it('shows a recoverable timeout error when heartbeat messages stop arriving', () => {
    vi.useFakeTimers()
    const onHeartbeatTimeout = vi.fn()

    renderHost(
      <EmbeddedAppHost
        appId="chess.internal"
        appName="Chess Tutor"
        src="https://example.com/chess"
        runtime={{
          expectedOrigin: 'https://example.com',
          conversationId: 'conversation.2',
          appSessionId: 'app-session.chess.2',
          handshakeToken: 'nonce-chess-2',
          heartbeatTimeoutMs: 1_000,
          bootstrap: {
            launchReason: 'chat-tool',
          },
          onHeartbeatTimeout,
        }}
      />
    )

    const iframe = screen.getByTestId('embedded-app-host-iframe')
    attachIframeWindow(iframe)
    fireEvent.load(iframe)

    act(() => {
      vi.advanceTimersByTime(1_100)
    })

    expect(screen.getByText(/stopped responding/i)).toBeTruthy()
    expect(onHeartbeatTimeout).toHaveBeenCalledTimes(1)
  })

  it('switches to a compact recovery panel when the user continues in chat after a failure', async () => {
    const onContinueInChat = vi.fn()

    renderHost(
      <EmbeddedAppHost
        appId="chess.internal"
        appName="Chess Tutor"
        src="https://example.com/chess"
        runtime={{
          expectedOrigin: 'https://example.com',
          conversationId: 'conversation.3',
          appSessionId: 'app-session.chess.3',
          handshakeToken: 'nonce-chess-3',
          bootstrap: {
            launchReason: 'chat-tool',
          },
        }}
        onContinueInChat={onContinueInChat}
      />
    )

    const iframe = screen.getByTestId('embedded-app-host-iframe')
    attachIframeWindow(iframe)
    fireEvent.load(iframe)

    dispatchRuntimeMessage(iframe, {
      version: 'v1',
      messageId: 'msg.runtime.chess.3',
      conversationId: 'conversation.3',
      appSessionId: 'app-session.chess.3',
      appId: 'chess.internal',
      sequence: 3,
      sentAt: '2026-04-01T12:03:00.000Z',
      security: {
        handshakeToken: 'nonce-chess-3',
        expectedOrigin: 'https://example.com',
      },
      source: 'app',
      type: 'app.error',
      payload: {
        code: 'app.runtime-error',
        message: 'The chess app crashed while loading the board.',
        recoverable: true,
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue in chat' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Continue in chat' }))

    await waitFor(() => {
      expect(screen.getByTestId('embedded-app-host-recovery')).toBeTruthy()
      expect(screen.getByText('App session ended')).toBeTruthy()
      expect(screen.getByText(/keep chatting/i)).toBeTruthy()
    })

    expect(onContinueInChat).toHaveBeenCalledTimes(1)
  })

  it('replays the iframe handshake after a retry request', async () => {
    const onRetry = vi.fn()

    renderHost(
      <EmbeddedAppHost
        appId="weather.public"
        appName="Weather Dashboard"
        src="https://example.com/weather"
        runtime={{
          expectedOrigin: 'https://example.com',
          conversationId: 'conversation.4',
          appSessionId: 'app-session.weather.4',
          handshakeToken: 'nonce-weather-4',
          bootstrap: {
            launchReason: 'chat-tool',
            authState: 'connected',
            grantedPermissions: ['session:write', 'tool:invoke'],
          },
          pendingInvocation: {
            toolCallId: 'tool-call.weather.4',
            toolName: 'weather.lookup-current',
            arguments: {
              location: 'Chicago, IL',
            },
            timeoutMs: 10_000,
          },
        }}
        onRetry={onRetry}
      />
    )

    const iframe = screen.getByTestId('embedded-app-host-iframe')
    const contentWindow = attachIframeWindow(iframe)

    fireEvent.load(iframe)

    await waitFor(() => {
      expect(contentWindow.postMessage).toHaveBeenCalledTimes(2)
    })

    dispatchRuntimeMessage(iframe, {
      version: 'v1',
      messageId: 'msg.runtime.weather.fail',
      conversationId: 'conversation.4',
      appSessionId: 'app-session.weather.4',
      appId: 'weather.public',
      sequence: 3,
      sentAt: '2026-04-01T12:04:00.000Z',
      security: {
        handshakeToken: 'nonce-weather-4',
        expectedOrigin: 'https://example.com',
      },
      source: 'app',
      type: 'app.error',
      payload: {
        code: 'app.runtime-error',
        message: 'The forecast widget failed to initialize.',
        recoverable: true,
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry embedded app' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Retry app' }))

    expect(onRetry).toHaveBeenCalledTimes(1)

    const retriedIframe = screen.getByTestId('embedded-app-host-iframe')
    const retriedWindow = attachIframeWindow(retriedIframe)
    fireEvent.load(retriedIframe)

    await waitFor(() => {
      expect(retriedWindow.postMessage).toHaveBeenCalledTimes(2)
    })
  })

  it('shows a blocked state when the iframe src is invalid', () => {
    renderHost(
      <EmbeddedAppHost
        appId="spotify.auth"
        appName="Spotify Playlist Creator"
        src="javascript:alert(1)"
        errorTitle="Blocked by sandbox"
        errorMessage="The host refused to embed the app."
        onRetry={vi.fn()}
      />
    )

    expect(screen.getByText('Blocked by sandbox')).toBeTruthy()
    expect(screen.getByText('The host refused to embed the app.')).toBeTruthy()
    expect(screen.queryByTestId('embedded-app-host-iframe')).toBeNull()
  })
})
