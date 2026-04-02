/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import EmbeddedAppHost from './EmbeddedAppHost'
import { getEmbeddedAppStatusCopy, normalizeEmbeddedAppSrc } from './embedded-app-host'

function renderHost(jsx: ReactNode) {
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

describe('embedded app host helpers', () => {
  it('normalizes safe iframe urls and rejects unsafe values', () => {
    expect(normalizeEmbeddedAppSrc(' https://example.com/app ')).toBe('https://example.com/app')
    expect(normalizeEmbeddedAppSrc('javascript:alert(1)')).toBeNull()
    expect(normalizeEmbeddedAppSrc('')).toBeNull()
  })

  it('returns copy for each embedded app state', () => {
    expect(getEmbeddedAppStatusCopy('loading').badge).toBe('Launching')
    expect(getEmbeddedAppStatusCopy('ready').title).toContain('active')
    expect(getEmbeddedAppStatusCopy('error').description).toContain('could not render')
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

  it('hides the loading overlay after the iframe loads', () => {
    renderHost(
      <EmbeddedAppHost
        appId="weather.public"
        appName="Weather Dashboard"
        src="https://example.com/weather"
        state="ready"
      />
    )

    const iframe = screen.getByTestId('embedded-app-host-iframe')
    fireEvent.load(iframe)

    expect(screen.queryByTestId('embedded-app-host-overlay')).toBeNull()
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
