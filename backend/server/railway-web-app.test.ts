import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { createRailwayWebApp } from './railway-web-app'

async function createStaticRoot() {
  const directory = await mkdtemp(join(tmpdir(), 'chatbox-railway-web-'))
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Chatbox</title>')
  return directory
}

describe('createRailwayWebApp', () => {
  it('completes platform Google sign-in, validates the session, refreshes it, and logs out', async () => {
    const staticRootDir = await createStaticRoot()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(
          JSON.stringify({
            access_token: 'platform-access-token',
            refresh_token: 'platform-refresh-token',
            expires_in: 3600,
            scope: 'openid email profile',
            token_type: 'Bearer',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          }
        )
      }

      if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
        return new Response(
          JSON.stringify({
            sub: 'google-user-456',
            email: 'stefano@example.com',
            email_verified: true,
            name: 'Stefano Caruso',
            picture: 'https://example.com/avatar.png',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          }
        )
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const app = createRailwayWebApp({
      staticRootDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {
        GOOGLE_OAUTH_CLIENT_ID: 'client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
        GOOGLE_OAUTH_REDIRECT_URI: 'https://chatbox-audit-production.up.railway.app/api/auth/platform/google/callback',
        TUTORMEAI_AUTH_TOKEN_SECRET: 'test-auth-secret',
      },
    })

    const startResponse = await app.handleRequest(
      new Request(
        'https://chatbox-audit-production.up.railway.app/api/auth/platform/google/start?clientOrigin=https://chatbox-audit.vercel.app'
      )
    )

    expect(startResponse.status).toBe(302)
    expect(startResponse.headers.get('set-cookie')).toContain('tutormeai_platform_google=')

    const authorizationUrl = new URL(startResponse.headers.get('location') ?? '')
    const state = authorizationUrl.searchParams.get('state')
    expect(state).toBeTruthy()

    const callbackResponse = await app.handleRequest(
      new Request(
        `https://chatbox-audit-production.up.railway.app/api/auth/platform/google/callback?state=${encodeURIComponent(state ?? '')}&code=platform-code`,
        {
          headers: {
            cookie: startResponse.headers.get('set-cookie') ?? '',
            'user-agent': 'Vitest',
            'x-forwarded-for': '203.0.113.10',
          },
        }
      )
    )

    expect(callbackResponse.status).toBe(200)
    const callbackHtml = await callbackResponse.text()
    expect(callbackHtml).toContain('TutorMeAI Signed In')
    expect(callbackHtml).toContain('tutormeai.platform-auth.callback')

    const callbackPayload = extractPayloadFromCallbackHtml(callbackHtml)
    expect(callbackPayload.ok).toBe(true)
    if (!callbackPayload.ok) {
      return
    }

    const meResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/auth/me', {
        headers: {
          authorization: `Bearer ${callbackPayload.accessToken}`,
          origin: 'https://chatbox-audit.vercel.app',
        },
      })
    )

    expect(meResponse.status).toBe(200)
    const meBody = (await meResponse.json()) as {
      ok: true
      data: {
        user: {
          userId: string
          email: string | null
        }
      }
    }
    expect(meBody.data.user.userId).toBe('user.google.google.user.456')
    expect(meBody.data.user.email).toBe('stefano@example.com')

    const refreshResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/auth/platform/refresh', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://chatbox-audit.vercel.app',
        },
        body: JSON.stringify({
          refreshToken: callbackPayload.refreshToken,
        }),
      })
    )

    expect(refreshResponse.status).toBe(200)
    const refreshBody = (await refreshResponse.json()) as {
      ok: true
      data: {
        accessToken: string
        refreshToken: string
      }
    }
    expect(refreshBody.data.accessToken).not.toBe(callbackPayload.accessToken)
    expect(refreshBody.data.refreshToken).not.toBe(callbackPayload.refreshToken)

    const logoutResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/auth/platform/logout', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${refreshBody.data.accessToken}`,
          'content-type': 'application/json',
          origin: 'https://chatbox-audit.vercel.app',
        },
        body: JSON.stringify({
          refreshToken: refreshBody.data.refreshToken,
        }),
      })
    )

    expect(logoutResponse.status).toBe(200)

    const afterLogoutResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/auth/me', {
        headers: {
          authorization: `Bearer ${refreshBody.data.accessToken}`,
          origin: 'https://chatbox-audit.vercel.app',
        },
      })
    )

    expect(afterLogoutResponse.status).toBe(401)
  })

  it('starts Google OAuth and exposes a sanitized connection lookup with CORS', async () => {
    const staticRootDir = await createStaticRoot()
    const app = createRailwayWebApp({
      staticRootDir,
      env: {
        GOOGLE_OAUTH_CLIENT_ID: 'client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
        GOOGLE_OAUTH_REDIRECT_URI: 'https://chatbox-audit-production.up.railway.app/api/auth/oauth/callback',
      },
    })

    const startResponse = await app.handleRequest(
      new Request(
        'https://chatbox-audit-production.up.railway.app/api/auth/oauth/google/start?userId=user.student.demo&appId=planner.oauth&clientOrigin=https://chatbox-audit.vercel.app'
      )
    )

    expect(startResponse.status).toBe(302)
    const authorizationUrl = new URL(startResponse.headers.get('location') ?? '')
    expect(authorizationUrl.origin).toBe('https://accounts.google.com')
    const state = authorizationUrl.searchParams.get('state')
    expect(state).toBeTruthy()

    const lookupResponse = await app.handleRequest(
      new Request(
        'https://chatbox-audit-production.up.railway.app/api/auth/oauth?userId=user.student.demo&appId=planner.oauth&provider=google',
        {
          headers: {
            origin: 'https://chatbox-audit.vercel.app',
          },
        }
      )
    )

    expect(lookupResponse.headers.get('access-control-allow-origin')).toBe('https://chatbox-audit.vercel.app')
    const lookupBody = (await lookupResponse.json()) as {
      ok: true
      data: {
        connection: {
          status: string
          hasAccessToken: boolean
          accessTokenCiphertext?: string
        }
      }
    }
    expect(lookupBody.data.connection.status).toBe('pending')
    expect('accessTokenCiphertext' in lookupBody.data.connection).toBe(false)
  })

  it('completes the callback, posts a success payload, and stores a connected status', async () => {
    const staticRootDir = await createStaticRoot()
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          scope: 'openid email profile',
          token_type: 'Bearer',
          id_token: 'header.eyJzdWIiOiJnb29nbGUtdXNlci0xMjMifQ.signature',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    })

    const app = createRailwayWebApp({
      staticRootDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {
        GOOGLE_OAUTH_CLIENT_ID: 'client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
        GOOGLE_OAUTH_REDIRECT_URI: 'https://chatbox-audit-production.up.railway.app/api/auth/oauth/callback',
      },
    })

    const startResponse = await app.handleRequest(
      new Request(
        'https://chatbox-audit-production.up.railway.app/api/auth/oauth/google/start?userId=user.student.demo&appId=planner.oauth&clientOrigin=https://chatbox-audit.vercel.app'
      )
    )

    const authorizationUrl = new URL(startResponse.headers.get('location') ?? '')
    const state = authorizationUrl.searchParams.get('state')
    expect(state).toBeTruthy()

    const callbackResponse = await app.handleRequest(
      new Request(
        `https://chatbox-audit-production.up.railway.app/api/auth/oauth/callback?state=${encodeURIComponent(state ?? '')}&code=planner-code`
      )
    )

    expect(callbackResponse.status).toBe(200)
    const callbackHtml = await callbackResponse.text()
    expect(callbackHtml).toContain('TutorMeAI Planner Connected')
    expect(callbackHtml).toContain('tutormeai.oauth.callback')
    expect(callbackHtml).toContain('https://chatbox-audit.vercel.app')

    const lookupResponse = await app.handleRequest(
      new Request(
        'https://chatbox-audit-production.up.railway.app/api/auth/oauth?userId=user.student.demo&appId=planner.oauth&provider=google',
        {
          headers: {
            origin: 'https://chatbox-audit.vercel.app',
          },
        }
      )
    )

    const lookupBody = (await lookupResponse.json()) as {
      ok: true
      data: {
        connection: {
          status: string
          hasAccessToken: boolean
          hasRefreshToken: boolean
          externalAccountId: string | null
        }
      }
    }

    expect(lookupBody.data.connection.status).toBe('connected')
    expect(lookupBody.data.connection.hasAccessToken).toBe(true)
    expect(lookupBody.data.connection.hasRefreshToken).toBe(true)
    expect(lookupBody.data.connection.externalAccountId).toBe('google-user-123')
  })
})

function extractPayloadFromCallbackHtml(html: string) {
  const payloadMatch = html.match(/const payload = (.*?);\n/s)
  if (!payloadMatch?.[1]) {
    throw new Error('Expected callback HTML to include an inline payload.')
  }

  return JSON.parse(payloadMatch[1]) as
    | {
        type: 'tutormeai.platform-auth.callback'
        ok: true
        accessToken: string
        refreshToken: string
      }
    | {
        type: 'tutormeai.platform-auth.callback'
        ok: false
        code: string
        message: string
      }
}
