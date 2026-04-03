import { describe, expect, it } from 'vitest'
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

function createOAuthAdapter(): OAuthProviderAdapter {
  return {
    async exchangeAuthorizationCode() {
      return {
        ok: true,
        value: {
          accessToken: 'access-token-1',
          refreshToken: 'refresh-token-1',
          expiresAt: '2026-04-01T14:00:00.000Z',
          refreshExpiresAt: '2026-04-08T12:00:00.000Z',
          scopes: ['assignments.read', 'assignments.write'],
          tokenType: 'Bearer',
          externalAccountId: 'acct_123',
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
          refreshExpiresAt: '2026-04-09T12:00:00.000Z',
          scopes: ['assignments.read', 'assignments.write'],
          tokenType: 'Bearer',
        },
      }
    },
  }
}

describe('PlatformAuthService', () => {
  it('issues, validates, refreshes, and revokes platform sessions', async () => {
    const repository = new InMemoryAuthRepository()
    const service = new PlatformAuthService(repository, {
      now: () => '2026-04-01T12:00:00.000Z',
    })

    const issued = await service.issuePlatformSession({
      userId: 'student.user',
      userAgent: 'Vitest',
      ipAddress: '127.0.0.1',
    })

    expect(issued.ok).toBe(true)
    if (!issued.ok) {
      return
    }

    expect(issued.value.session.provider).toBe('tutormeai-platform')
    expect(issued.value.session.sessionTokenHash).not.toBe(issued.value.sessionToken)

    const validated = await service.validatePlatformSession({
      sessionToken: issued.value.sessionToken,
    })

    expect(validated.ok).toBe(true)
    if (!validated.ok) {
      return
    }

    expect(validated.value.lastUsedAt).toBe('2026-04-01T12:00:00.000Z')

    const refreshed = await service.refreshPlatformSession({
      refreshToken: issued.value.refreshToken,
    })

    expect(refreshed.ok).toBe(true)
    if (!refreshed.ok) {
      return
    }

    expect(refreshed.value.session.tokenVersion).toBe(2)
    expect(refreshed.value.session.lastRefreshedAt).toBe('2026-04-01T12:00:00.000Z')
    expect(refreshed.value.sessionToken).not.toBe(issued.value.sessionToken)

    const revoked = await service.revokePlatformSession({
      platformSessionId: refreshed.value.session.platformSessionId,
      reason: 'user-logout',
    })

    expect(revoked.ok).toBe(true)
    if (!revoked.ok) {
      return
    }

    expect(revoked.value.status).toBe('revoked')
    expect(revoked.value.metadata.revocationReason).toBe('user-logout')
  })
})

describe('OAuthAuthService', () => {
  it('starts, completes, refreshes, and revokes OAuth connections', async () => {
    const repository = new InMemoryAuthRepository()
    const service = new OAuthAuthService(repository, {
      now: () => '2026-04-01T12:00:00.000Z',
      tokenCipher: identityTokenCipher(),
    })

    const started = await service.startOAuthConnection({
      userId: 'teacher.user',
      appId: 'planner.oauth',
      provider: plannerProvider,
    })

    expect(started.ok).toBe(true)
    if (!started.ok) {
      return
    }

    expect(started.value.connection.status).toBe('pending')
    expect(started.value.authorizationUrl).toContain('code_challenge=')

    const completed = await service.completeOAuthConnection({
      state: started.value.state,
      authorizationCode: 'planner-code',
      provider: plannerProvider,
      adapter: createOAuthAdapter(),
    })

    expect(completed.ok).toBe(true)
    if (!completed.ok) {
      return
    }

    expect(completed.value.connection.status).toBe('connected')
    expect(completed.value.connection.accessTokenCiphertext).toBe('access-token-1')

    const refreshed = await service.refreshOAuthConnection({
      oauthConnectionId: completed.value.connection.oauthConnectionId,
      provider: plannerProvider,
      adapter: createOAuthAdapter(),
    })

    expect(refreshed.ok).toBe(true)
    if (!refreshed.ok) {
      return
    }

    expect(refreshed.value.connection.accessTokenCiphertext).toBe('access-token-2')
    expect(refreshed.value.connection.refreshTokenCiphertext).toBe('refresh-token-2')

    const revoked = await service.revokeOAuthConnection({
      oauthConnectionId: refreshed.value.connection.oauthConnectionId,
      reason: 'teacher-disconnected',
    })

    expect(revoked.ok).toBe(true)
    if (!revoked.ok) {
      return
    }

    expect(revoked.value.status).toBe('revoked')
    expect(revoked.value.metadata.revocationReason).toBe('teacher-disconnected')
  })

  it('expires pending OAuth connections when the authorization state window closes', async () => {
    const repository = new InMemoryAuthRepository()
    const service = new OAuthAuthService(repository, {
      now: () => '2026-04-01T12:00:00.000Z',
      stateTtlMs: 1,
    })

    const started = await service.startOAuthConnection({
      userId: 'teacher.user',
      appId: 'planner.oauth',
      provider: plannerProvider,
    })

    expect(started.ok).toBe(true)
    if (!started.ok) {
      return
    }

    const expiredService = new OAuthAuthService(repository, {
      now: () => '2026-04-01T12:05:00.000Z',
    })

    const completed = await expiredService.completeOAuthConnection({
      state: started.value.state,
      authorizationCode: 'planner-code',
      provider: plannerProvider,
      adapter: createOAuthAdapter(),
    })

    expect(completed.ok).toBe(false)
    if (completed.ok) {
      return
    }

    expect(completed.code).toBe('oauth-connection-expired')
  })
})

describe('PlatformUserProfileService', () => {
  it('stores a platform profile and derives reviewer permissions from the saved role', async () => {
    const repository = new InMemoryAuthRepository()
    const service = new PlatformUserProfileService(repository, {
      now: () => '2026-04-01T12:00:00.000Z',
    })

    const upserted = await service.upsertUserProfile({
      userId: 'admin.user',
      displayName: 'Admin User',
      email: 'Admin@TutorMe.ai',
      role: 'school_admin',
    })

    expect(upserted.ok).toBe(true)
    if (!upserted.ok) {
      return
    }

    expect(upserted.value.email).toBe('admin@tutorme.ai')

    const permissions = await service.getUserPermissions('admin.user')
    expect(permissions.ok).toBe(true)
    if (!permissions.ok) {
      return
    }

    expect(permissions.value.role).toBe('school_admin')
    expect(permissions.value.permissions.canViewReviewQueue).toBe(true)
    expect(permissions.value.permissions.canApproveApp).toBe(true)
    expect(permissions.value.permissions.canManageSafetySettings).toBe(false)
  })

  it('rejects profile updates that would collide on email with another stored user', async () => {
    const repository = new InMemoryAuthRepository()
    const service = new PlatformUserProfileService(repository, {
      now: () => '2026-04-01T12:00:00.000Z',
    })

    await service.upsertUserProfile({
      userId: 'teacher.user',
      displayName: 'Teacher User',
      email: 'teacher@school.edu',
      role: 'teacher',
    })

    const conflicting = await service.upsertUserProfile({
      userId: 'district.user',
      displayName: 'District User',
      email: 'teacher@school.edu',
      role: 'district_admin',
    })

    expect(conflicting.ok).toBe(false)
    if (conflicting.ok) {
      return
    }

    expect(conflicting.code).toBe('profile-email-conflict')
  })
})
