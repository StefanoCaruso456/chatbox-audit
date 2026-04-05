/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TutorMeAIAuthGate } from './TutorMeAIAuthGate'
import { tutorMeAIAuthStore } from '@/stores/tutorMeAIAuthStore'

describe('TutorMeAIAuthGate', () => {
  if (!window.matchMedia) {
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
  }

  afterEach(() => {
    localStorage.clear()
    tutorMeAIAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      status: 'required',
      error: null,
      hasHydrated: true,
    })
    vi.restoreAllMocks()
  })

  it('shows a Google sign-in gate when no TutorMeAI session is present', async () => {
    tutorMeAIAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      status: 'required',
      error: null,
      hasHydrated: true,
    })

    render(
      <MantineProvider>
        <TutorMeAIAuthGate>
          <div>Authenticated content</div>
        </TutorMeAIAuthGate>
      </MantineProvider>
    )

    expect(screen.getByRole('button', { name: /continue with google/i })).toBeTruthy()
  })

  it('unlocks the app after a successful platform auth callback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              user: {
                userId: 'user.google.demo',
                email: 'student@example.com',
                displayName: 'Student Demo',
                pictureUrl: null,
              },
              session: {
                platformSessionId: 'platform-session.demo',
                provider: 'google',
                status: 'active',
                sessionExpiresAt: '2026-04-05T04:00:00.000Z',
                refreshExpiresAt: '2026-05-05T04:00:00.000Z',
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
      })
    )

    tutorMeAIAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      status: 'required',
      error: null,
      hasHydrated: true,
    })

    render(
      <MantineProvider>
        <TutorMeAIAuthGate>
          <div>Authenticated content</div>
        </TutorMeAIAuthGate>
      </MantineProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /continue with google/i })).toBeTruthy()
    })

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://chatbox-audit-production.up.railway.app',
        data: {
          type: 'tutormeai.platform-auth.callback',
          ok: true,
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          user: {
            userId: 'user.google.demo',
            email: 'student@example.com',
            displayName: 'Student Demo',
            pictureUrl: null,
          },
        },
      })
    )

    await waitFor(() => {
      expect(screen.getByText('Authenticated content')).toBeTruthy()
    })
  })
})
