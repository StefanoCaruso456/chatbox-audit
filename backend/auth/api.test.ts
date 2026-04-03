import { describe, expect, it } from 'vitest'
import { createAuthApi } from './api'
import { InMemoryAuthRepository } from './repository'
import { identityTokenCipher, OAuthAuthService, PlatformAuthService, PlatformUserProfileService } from './service'
import type { OAuthProviderAdapter, OAuthProviderConfig } from './types'

const plannerProvider: OAuthProviderConfig = {
  provider: 'planner-cloud',
  authorizationUrl: 'https://accounts.planner-cloud.dev/oauth/authorize',
  tokenUrl: 'https://accounts.planner-cloud.dev/oauth/token',
  clientId: 'planner-client-id',
  redirectUri: 'https://api.chatbridge.app/oauth/planner/callback',
  defaultScopes: ['assignments.read', 'assignments.write'],
  pkce: true,
}

const adapter: OAuthProviderAdapter = {
  async exchangeAuthorizationCode() {
    return {
      ok: true,
      value: {
        accessToken: 'access-token-1',
        refreshToken: 'refresh-token-1',
        expiresAt: '2026-04-01T14:00:00.000Z',
        refreshExpiresAt: '2026-04-08T12:00:00.000Z',
        scopes: ['assignments.read'],
      },
    }
  },
  async refreshTokens() {
    return {
      ok: true,
      value: {
        accessToken: 'access-token-2',
        refreshToken: 'refresh-token-2',
        expiresAt: '2026-04-01T15:00:00.000Z',
      },
    }
  },
}

function createFixture() {
  const repository = new InMemoryAuthRepository()
  const platformAuth = new PlatformAuthService(repository, {
    now: () => '2026-04-01T12:00:00.000Z',
  })
  const platformProfiles = new PlatformUserProfileService(repository, {
    now: () => '2026-04-01T12:00:00.000Z',
  })
  const oauthAuth = new OAuthAuthService(repository, {
    now: () => '2026-04-01T12:00:00.000Z',
    tokenCipher: identityTokenCipher(),
  })

  return {
    api: createAuthApi(platformAuth, oauthAuth, platformProfiles, {
      oauthAdapters: {
        [plannerProvider.provider]: adapter,
      },
    }),
    profileService: platformProfiles,
  }
}

function createProfileFixture() {
  const repository = new InMemoryAuthRepository()
  const platformAuth = new PlatformAuthService(repository, {
    now: () => '2026-04-01T12:00:00.000Z',
  })
  const platformProfiles = new PlatformUserProfileService(repository, {
    now: () => '2026-04-01T12:00:00.000Z',
  })
  const oauthAuth = new OAuthAuthService(repository, {
    now: () => '2026-04-01T12:00:00.000Z',
    tokenCipher: identityTokenCipher(),
  })

  return {
    api: createAuthApi(platformAuth, oauthAuth, platformProfiles, {
      oauthAdapters: {
        [plannerProvider.provider]: adapter,
      },
    }),
    profileService: platformProfiles,
  }
}

async function readJson(response: Response) {
  return response.json()
}

describe('AuthApi', () => {
  it('issues and validates platform sessions through the API surface', async () => {
    const { api } = createFixture()

    const issuedResponse = await api.issuePlatformSession(
      new Request('https://railway.local/api/auth/platform/sessions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'student.user',
        }),
      })
    )

    const issuedBody = await readJson(issuedResponse)
    expect(issuedResponse.status).toBe(201)
    expect(issuedBody.ok).toBe(true)

    const validateResponse = await api.validatePlatformSession(
      new Request('https://railway.local/api/auth/platform/sessions/validate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sessionToken: issuedBody.data.sessionToken,
        }),
      })
    )

    const validateBody = await readJson(validateResponse)
    expect(validateResponse.status).toBe(200)
    expect(validateBody.ok).toBe(true)
    expect(validateBody.data.userId).toBe('student.user')
  })

  it('starts and completes OAuth connections through configured provider adapters', async () => {
    const { api } = createFixture()

    const startResponse = await api.startOAuthConnection(
      new Request('https://railway.local/api/auth/oauth/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'teacher.user',
          appId: 'planner.oauth',
          provider: plannerProvider,
        }),
      })
    )

    const startBody = await readJson(startResponse)
    expect(startResponse.status).toBe(201)
    expect(startBody.ok).toBe(true)

    const callbackResponse = await api.completeOAuthConnection(
      new Request('https://railway.local/api/auth/oauth/callback', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          state: startBody.data.state,
          authorizationCode: 'planner-code',
          provider: plannerProvider,
        }),
      })
    )

    const callbackBody = await readJson(callbackResponse)
    expect(callbackResponse.status).toBe(200)
    expect(callbackBody.ok).toBe(true)
    expect(callbackBody.data.connection.status).toBe('connected')
  })

  it('returns a readable error when an OAuth adapter is not configured', async () => {
    const repository = new InMemoryAuthRepository()
    const api = createAuthApi(
      new PlatformAuthService(repository),
      new OAuthAuthService(repository),
      new PlatformUserProfileService(repository),
      {
        oauthAdapters: {},
      }
    )

    const response = await api.completeOAuthConnection(
      new Request('https://railway.local/api/auth/oauth/callback', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          state: 'missing',
          authorizationCode: 'planner-code',
          provider: plannerProvider,
        }),
      })
    )

    const body = await readJson(response)
    expect(response.status).toBe(501)
    expect(body).toEqual({
      ok: false,
      error: {
        domain: 'oauth',
        code: 'oauth-provider-adapter-missing',
        message: 'No OAuth adapter is configured for provider "planner-cloud".',
        retryable: false,
      },
    })
  })

  it('stores a platform profile and exposes the derived role permissions through the API surface', async () => {
    const { api } = createProfileFixture()

    const upsertResponse = await api.upsertPlatformUserProfile(
      new Request('https://railway.local/api/auth/platform/users/school.admin/profile', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          displayName: 'School Admin',
          email: 'admin@school.edu',
          role: 'school_admin',
        }),
      }),
      { userId: 'school.admin' }
    )

    const upsertBody = await readJson(upsertResponse)
    expect(upsertResponse.status).toBe(200)
    expect(upsertBody.ok).toBe(true)
    expect(upsertBody.data.role).toBe('school_admin')

    const permissionsResponse = await api.getPlatformUserPermissions(
      new Request('https://railway.local/api/auth/platform/users/school.admin/permissions'),
      { userId: 'school.admin' }
    )

    const permissionsBody = await readJson(permissionsResponse)
    expect(permissionsResponse.status).toBe(200)
    expect(permissionsBody.ok).toBe(true)
    expect(permissionsBody.data.permissions.canApproveApp).toBe(true)
    expect(permissionsBody.data.permissions.canBlockApp).toBe(true)
  })
})
