import { exampleAuthenticatedPlannerManifest, exampleInternalChessManifest } from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { reviewOAuthScopeSanity } from './oauth-scope-sanity'

function createProvider(overrides: Partial<Parameters<typeof reviewOAuthScopeSanity>[0]['provider']> = {}) {
  return {
    provider: 'planner-cloud',
    authorizationUrl: 'https://accounts.planner-cloud.dev/oauth/authorize',
    tokenUrl: 'https://accounts.planner-cloud.dev/oauth/token',
    clientId: 'planner-client-id',
    redirectUri: 'https://chatbridge.dev/oauth/callback',
    defaultScopes: ['assignments.read', 'assignments.write'],
    pkce: true,
    ...overrides,
  }
}

describe('reviewOAuthScopeSanity', () => {
  it('passes when the manifest scopes match the configured provider scopes', () => {
    const report = reviewOAuthScopeSanity({
      manifest: exampleAuthenticatedPlannerManifest,
      provider: createProvider(),
      requestedScopes: [],
    })

    expect(report.applicable).toBe(true)
    expect(report.passed).toBe(true)
    expect(report.issues).toHaveLength(0)
    expect(report.missingScopes).toHaveLength(0)
    expect(report.excessiveScopes).toHaveLength(0)
  })

  it('marks non-oauth apps as not applicable', () => {
    const report = reviewOAuthScopeSanity({
      manifest: exampleInternalChessManifest,
      provider: createProvider(),
      requestedScopes: ['assignments.read'],
    })

    expect(report.applicable).toBe(false)
    expect(report.passed).toBe(true)
    expect(report.issues).toEqual([
      {
        code: 'not-applicable',
        severity: 'info',
        message: `App "${exampleInternalChessManifest.appId}" does not use OAuth2, so scope review is not applicable.`,
      },
    ])
  })

  it('flags missing scopes when the requested set omits manifest scopes', () => {
    const report = reviewOAuthScopeSanity({
      manifest: exampleAuthenticatedPlannerManifest,
      provider: createProvider({
        defaultScopes: ['assignments.read'],
      }),
      requestedScopes: [],
    })

    expect(report.passed).toBe(false)
    expect(report.missingScopes).toEqual(['assignments.write'])
    expect(report.issues.some((issue) => issue.code === 'missing-scope')).toBe(true)
  })

  it('flags excessive scopes when requested scopes exceed the manifest', () => {
    const report = reviewOAuthScopeSanity({
      manifest: exampleAuthenticatedPlannerManifest,
      provider: createProvider({
        defaultScopes: ['assignments.read'],
      }),
      requestedScopes: ['assignments.write', 'calendar.read'],
    })

    expect(report.passed).toBe(false)
    expect(report.excessiveScopes).toContain('calendar.read')
    expect(report.issues.some((issue) => issue.code === 'excessive-scope')).toBe(true)
  })

  it('flags wildcard and mismatched scope strings', () => {
    const report = reviewOAuthScopeSanity({
      manifest: exampleAuthenticatedPlannerManifest,
      provider: createProvider({
        provider: 'planner-cloud-staging',
        defaultScopes: ['Assignments.Read', 'planner.*'],
      }),
      requestedScopes: ['assignments.write', 'planner.*'],
    })

    expect(report.passed).toBe(false)
    expect(report.issues.some((issue) => issue.code === 'provider-mismatch')).toBe(true)
    expect(report.issues.some((issue) => issue.code === 'wildcard-scope')).toBe(true)
    expect(report.issues.some((issue) => issue.code === 'mismatched-scope')).toBe(true)
  })
})
