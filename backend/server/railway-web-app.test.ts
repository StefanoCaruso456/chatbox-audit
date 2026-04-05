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
