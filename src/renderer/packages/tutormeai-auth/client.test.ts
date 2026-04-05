import { describe, expect, it, vi } from 'vitest'
import {
  buildTutorMeAIPlatformGoogleStartUrl,
  fetchTutorMeAIPlatformProfile,
  isTutorMeAIPlatformCallbackMessage,
  refreshTutorMeAIPlatformSession,
  resolveTutorMeAIBackendOrigin,
} from './client'

describe('TutorMeAI auth client helpers', () => {
  it('prefers an explicit backend origin and otherwise falls back to the production Railway domain', () => {
    expect(
      resolveTutorMeAIBackendOrigin('https://chatbox-audit.vercel.app', {
        TUTORMEAI_BACKEND_ORIGIN: 'https://planner-backend.up.railway.app',
      })
    ).toBe('https://planner-backend.up.railway.app')

    expect(resolveTutorMeAIBackendOrigin('https://chatbox-audit.vercel.app', {})).toBe(
      'https://chatbox-audit-production.up.railway.app'
    )
  })

  it('builds the TutorMeAI platform Google start URL', () => {
    const url = new URL(
      buildTutorMeAIPlatformGoogleStartUrl({
        backendOrigin: 'https://chatbox-audit-production.up.railway.app',
        clientOrigin: 'https://chatbox-audit.vercel.app',
      })
    )

    expect(url.pathname).toBe('/api/auth/platform/google/start')
    expect(url.searchParams.get('clientOrigin')).toBe('https://chatbox-audit.vercel.app')
  })

  it('reads and refreshes TutorMeAI platform sessions from the Railway backend', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              accessToken: 'next-access-token',
              refreshToken: 'next-refresh-token',
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
                sessionExpiresAt: '2026-04-05T05:00:00.000Z',
                refreshExpiresAt: '2026-05-05T05:00:00.000Z',
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
      )

    const profile = await fetchTutorMeAIPlatformProfile({
      backendOrigin: 'https://chatbox-audit-production.up.railway.app',
      accessToken: 'access-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(profile.user.userId).toBe('user.google.demo')

    const refreshed = await refreshTutorMeAIPlatformSession({
      backendOrigin: 'https://chatbox-audit-production.up.railway.app',
      refreshToken: 'refresh-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(refreshed.accessToken).toBe('next-access-token')
    expect(refreshed.refreshToken).toBe('next-refresh-token')
  })

  it('recognizes platform callback messages only from the configured backend origin', () => {
    const matchingEvent = new MessageEvent('message', {
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

    const mismatchedEvent = new MessageEvent('message', {
      origin: 'https://chatbox-audit.vercel.app',
      data: {
        type: 'tutormeai.platform-auth.callback',
        ok: true,
      },
    })

    expect(isTutorMeAIPlatformCallbackMessage(matchingEvent, 'https://chatbox-audit-production.up.railway.app')).toBe(
      true
    )
    expect(isTutorMeAIPlatformCallbackMessage(mismatchedEvent, 'https://chatbox-audit-production.up.railway.app')).toBe(
      false
    )
  })
})
