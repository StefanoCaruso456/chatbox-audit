import { exampleAuthenticatedPlannerManifest } from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { buildAppCspPolicy, buildAppManifestLaunchPolicy, buildAppSecurityHeaders } from './policy'

describe('security policy helpers', () => {
  it('builds a strict iframe policy from an app manifest', () => {
    const result = buildAppManifestLaunchPolicy(exampleAuthenticatedPlannerManifest)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.targetOrigin).toBe('https://planner.chatbridge.dev')
    expect(result.value.allowedOrigins).toEqual(['https://planner.chatbridge.dev'])
    expect(result.value.sandboxAttribute).toContain('allow-scripts')
    expect(result.value.csp.headerValue).toContain('frame-src https://planner.chatbridge.dev')
  })

  it('rejects wildcard origins in CSP inputs', () => {
    const result = buildAppCspPolicy({
      clientOrigin: 'https://chatbridge.app',
      backendOrigin: 'https://api.chatbridge.app',
      approvedAppOrigins: ['https://*.planner.dev'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.domain).toBe('security')
    expect(result.code).toBe('unsafe-wildcard-usage')
  })

  it('adds deterministic security headers for the platform shell', () => {
    const result = buildAppSecurityHeaders({
      clientOrigin: 'https://chatbridge.app',
      backendOrigin: 'https://api.chatbridge.app',
      approvedAppOrigins: ['https://planner.chatbridge.dev'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.headers['content-security-policy']).toContain('connect-src')
    expect(result.value.headers['x-content-type-options']).toBe('nosniff')
    expect(result.value.headers['referrer-policy']).toBe('no-referrer')
    expect(result.value.headers['permissions-policy']).toContain('camera=()')
  })
})
