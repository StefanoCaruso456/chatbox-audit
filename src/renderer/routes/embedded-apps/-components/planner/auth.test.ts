import { describe, expect, it, vi } from 'vitest'
import {
  buildPlannerAuthUserId,
  buildPlannerOAuthStartUrl,
  derivePlannerOAuthAuthState,
  fetchPlannerOAuthConnection,
  isPlannerOAuthCallbackMessage,
  resolvePlannerBackendOrigin,
} from './auth'

describe('planner auth helpers', () => {
  it('derives a stable identifier from the TutorMeAI profile', () => {
    expect(
      buildPlannerAuthUserId({
        email: 'Stefano.Caruso456@gmail.com',
      })
    ).toBe('user.stefano.caruso456.gmail.com')
  })

  it('prefers an explicit backend origin and otherwise falls back to the production Railway domain', () => {
    expect(
      resolvePlannerBackendOrigin('https://chatbox-audit.vercel.app', {
        TUTORMEAI_BACKEND_ORIGIN: 'https://planner-backend.up.railway.app',
      })
    ).toBe('https://planner-backend.up.railway.app')

    expect(resolvePlannerBackendOrigin('https://chatbox-audit.vercel.app', {})).toBe(
      'https://chatbox-audit-production.up.railway.app'
    )
  })

  it('builds the Railway OAuth start URL for the planner app', () => {
    const url = new URL(
      buildPlannerOAuthStartUrl({
        backendOrigin: 'https://planner-backend.up.railway.app',
        clientOrigin: 'https://chatbox-audit.vercel.app',
        userId: 'user.student.demo',
      })
    )

    expect(url.origin).toBe('https://planner-backend.up.railway.app')
    expect(url.pathname).toBe('/api/auth/oauth/google/start')
    expect(url.searchParams.get('userId')).toBe('user.student.demo')
    expect(url.searchParams.get('appId')).toBe('planner.oauth')
    expect(url.searchParams.get('clientOrigin')).toBe('https://chatbox-audit.vercel.app')
  })

  it('reads the sanitized OAuth connection state from the Railway backend', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            connection: {
              oauthConnectionId: 'oauth-connection.1',
              userId: 'user.student.demo',
              appId: 'planner.oauth',
              provider: 'google',
              status: 'connected',
              requestedScopes: ['openid', 'email', 'profile'],
              externalAccountId: 'google-user-123',
              scopes: ['openid', 'email', 'profile'],
              tokenType: 'Bearer',
              accessTokenExpiresAt: '2026-04-05T04:00:00.000Z',
              refreshTokenExpiresAt: null,
              lastRefreshedAt: '2026-04-05T03:00:00.000Z',
              connectedAt: '2026-04-05T03:00:00.000Z',
              disconnectedAt: null,
              createdAt: '2026-04-05T03:00:00.000Z',
              updatedAt: '2026-04-05T03:00:00.000Z',
              hasAccessToken: true,
              hasRefreshToken: true,
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

    const connection = await fetchPlannerOAuthConnection({
      backendOrigin: 'https://planner-backend.up.railway.app',
      userId: 'user.student.demo',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(connection?.status).toBe('connected')
    expect(derivePlannerOAuthAuthState(connection)).toBe('connected')
  })

  it('recognizes callback messages only from the configured backend origin', () => {
    const matchingEvent = new MessageEvent('message', {
      origin: 'https://planner-backend.up.railway.app',
      data: {
        type: 'tutormeai.oauth.callback',
        ok: true,
        appId: 'planner.oauth',
        provider: 'google',
        userId: 'user.student.demo',
        status: 'connected',
      },
    })

    const mismatchedEvent = new MessageEvent('message', {
      origin: 'https://chatbox-audit.vercel.app',
      data: {
        type: 'tutormeai.oauth.callback',
        ok: true,
      },
    })

    expect(isPlannerOAuthCallbackMessage(matchingEvent, 'https://planner-backend.up.railway.app')).toBe(true)
    expect(isPlannerOAuthCallbackMessage(mismatchedEvent, 'https://planner-backend.up.railway.app')).toBe(false)
  })
})
