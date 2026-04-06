import { describe, expect, it, vi } from 'vitest'
import { createGoogleOAuthAdapter, createHashedTokenCipher, loadGoogleOAuthRuntimeConfig } from './google'

describe('loadGoogleOAuthRuntimeConfig', () => {
  it('returns null when required env vars are missing', () => {
    expect(loadGoogleOAuthRuntimeConfig({})).toBeNull()
  })

  it('builds a Google provider config from env vars', () => {
    const config = loadGoogleOAuthRuntimeConfig({
      GOOGLE_OAUTH_CLIENT_ID: 'client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://chatbox-audit-production.up.railway.app/api/auth/oauth/callback',
      GOOGLE_OAUTH_SCOPES: 'openid email profile https://www.googleapis.com/auth/classroom.courses.readonly',
    })

    expect(config).not.toBeNull()
    expect(config?.provider.provider).toBe('google')
    expect(config?.provider.authorizationUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(config?.provider.tokenUrl).toBe('https://oauth2.googleapis.com/token')
    expect(config?.provider.defaultScopes).toContain('https://www.googleapis.com/auth/classroom.courses.readonly')
    expect(config?.provider.extraAuthorizationParameters).toMatchObject({
      access_type: 'offline',
      prompt: 'consent select_account',
    })
  })
})

describe('createGoogleOAuthAdapter', () => {
  it('exchanges authorization codes against the Google token endpoint', async () => {
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

    const adapter = createGoogleOAuthAdapter({
      clientSecret: 'client-secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => Date.parse('2026-04-05T03:00:00.000Z'),
    })

    const result = await adapter.exchangeAuthorizationCode({
      provider: {
        provider: 'google',
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: 'client-id',
        redirectUri: 'https://chatbox-audit-production.up.railway.app/api/auth/oauth/callback',
        defaultScopes: ['openid', 'email', 'profile'],
      },
      authorizationCode: 'auth-code',
      redirectUri: 'https://chatbox-audit-production.up.railway.app/api/auth/oauth/callback',
      codeVerifier: 'code-verifier',
      state: 'state-token',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.value.accessToken).toBe('access-token')
    expect(result.value.refreshToken).toBe('refresh-token')
    expect(result.value.externalAccountId).toBe('google-user-123')
    expect(result.value.expiresAt).toBe('2026-04-05T04:00:00.000Z')
  })

  it('surfaces readable errors when Google rejects the token exchange', async () => {
    const adapter = createGoogleOAuthAdapter({
      clientSecret: 'client-secret',
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Bad Request',
          }),
          { status: 400 }
        )) as typeof fetch,
    })

    const result = await adapter.exchangeAuthorizationCode({
      provider: {
        provider: 'google',
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: 'client-id',
        redirectUri: 'https://chatbox-audit-production.up.railway.app/api/auth/oauth/callback',
        defaultScopes: ['openid', 'email', 'profile'],
      },
      authorizationCode: 'auth-code',
      redirectUri: 'https://chatbox-audit-production.up.railway.app/api/auth/oauth/callback',
      codeVerifier: 'code-verifier',
      state: 'state-token',
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.message).toContain('invalid_grant')
  })
})

describe('createHashedTokenCipher', () => {
  it('round-trips ciphertext without storing the raw secret', () => {
    const cipher = createHashedTokenCipher('super-secret')
    const sealed = cipher.seal('refresh-token-123')

    expect(sealed).not.toBe('refresh-token-123')
    expect(cipher.open(sealed)).toBe('refresh-token-123')
  })
})
