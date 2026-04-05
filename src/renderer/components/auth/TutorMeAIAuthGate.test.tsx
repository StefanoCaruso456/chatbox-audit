/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  if (!globalThis.ResizeObserver) {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
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

  it('requires onboarding after sign-in and unlocks the app after the profile is completed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()

        if (url.endsWith('/api/auth/me')) {
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                user: {
                  userId: 'user.google.demo',
                  email: 'student@example.com',
                  username: null,
                  displayName: 'Student Demo',
                  role: null,
                  pictureUrl: null,
                  onboardingCompletedAt: null,
                  students: [],
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
        }

        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              user: {
                userId: 'user.google.demo',
                email: 'student@example.com',
                username: 'student.demo',
                displayName: 'Student Demo',
                role: 'student',
                pictureUrl: null,
                onboardingCompletedAt: '2026-04-05T04:05:00.000Z',
                students: [],
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
            username: null,
            displayName: 'Student Demo',
            role: null,
            pictureUrl: null,
            onboardingCompletedAt: null,
            students: [],
          },
        },
      })
    )

    await waitFor(() => {
      expect(screen.getByText(/complete your tutormeai profile/i)).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Student Demo' },
    })
    fireEvent.change(screen.getByLabelText(/^username$/i), {
      target: { value: 'student.demo' },
    })
    fireEvent.click(screen.getByRole('button', { name: /continue to tutormeai/i }))

    await waitFor(() => {
      expect(screen.getByText('Authenticated content')).toBeTruthy()
    })
  })

  it('does not crash when an older cached TutorMeAI user is missing the students field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              user: {
                userId: 'teacher.user',
                email: 'teacher@example.com',
                username: 'teacher.demo',
                displayName: 'Teacher Demo',
                role: 'teacher',
                pictureUrl: null,
                onboardingCompletedAt: '2026-04-05T04:05:00.000Z',
                students: [],
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
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        userId: 'teacher.user',
        email: 'teacher@example.com',
        username: 'teacher.demo',
        displayName: 'Teacher Demo',
        role: 'teacher',
        pictureUrl: null,
        onboardingCompletedAt: '2026-04-05T04:05:00.000Z',
      } as never,
      status: 'authenticated',
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
      expect(screen.getByText(/complete your tutormeai profile/i)).toBeTruthy()
    })
  })
})
