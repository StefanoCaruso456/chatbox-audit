/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ReviewHarnessConfig } from '../-lib/review-harness'
import { ReviewHarnessPage } from './ReviewHarnessPage'

function renderHarness(jsx: ReactNode) {
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

function dispatchRuntimeMessage(iframe: HTMLElement, payload: object, origin = 'https://staging.example.com') {
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

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  })

  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  })
})

const config: ReviewHarnessConfig = {
  appId: 'flashcards.public',
  appName: 'Flashcards Coach',
  entryUrl: 'https://staging.example.com/flashcards',
  targetOrigin: 'https://staging.example.com',
  allowedOrigins: ['https://staging.example.com'],
  conversationId: 'conversation.review.1',
  appSessionId: 'review.flashcards.public',
  authState: 'not-required',
  handshakeToken: 'review.flashcards.public.review.flashcards.public',
  runtimeWarnings: [],
}

describe('ReviewHarnessPage', () => {
  it('collects accepted iframe traffic and flags rejected traffic for reviewers', async () => {
    const sentAt = new Date().toISOString()

    renderHarness(<ReviewHarnessPage config={config} />)

    const iframe = screen.getByTestId('embedded-app-host-iframe')
    attachIframeWindow(iframe)
    fireEvent.load(iframe)

    dispatchRuntimeMessage(iframe, {
      version: 'v1',
      messageId: 'msg.review.accepted',
      conversationId: config.conversationId,
      appSessionId: config.appSessionId,
      appId: config.appId,
      sequence: 1,
      sentAt,
      security: {
        handshakeToken: config.handshakeToken,
        expectedOrigin: config.targetOrigin,
      },
      source: 'app',
      type: 'app.state',
      payload: {
        status: 'active',
        summary: 'Flashcards review session is ready.',
        state: {
          topic: 'fractions',
        },
      },
    })

    dispatchRuntimeMessage(
      iframe,
      {
        version: 'v1',
        messageId: 'msg.review.rejected',
        conversationId: config.conversationId,
        appSessionId: config.appSessionId,
        appId: config.appId,
        sequence: 2,
        sentAt,
        security: {
          handshakeToken: config.handshakeToken,
          expectedOrigin: config.targetOrigin,
        },
        source: 'app',
        type: 'app.state',
        payload: {
          status: 'active',
          summary: 'Unexpected mirror traffic.',
          state: {
            topic: 'fractions',
          },
        },
      },
      'https://malicious.example.com'
    )

    await waitFor(() => {
      expect(screen.getByText('Review iframe loaded')).toBeTruthy()
      expect(screen.getByText('Runtime state update')).toBeTruthy()
      expect(screen.getAllByText('Unexpected iframe origin').length).toBeGreaterThan(0)
      expect(screen.getByText(/Raw messages:/).parentElement?.textContent).toContain('2')
      expect(screen.getByText(/Open findings:/).parentElement?.textContent).toContain('1')
    })
  })
})
