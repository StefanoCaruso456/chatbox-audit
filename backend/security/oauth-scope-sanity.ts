import type { AppManifest } from '@shared/contracts/v1'
import type { OAuthProviderConfig } from '../auth/types'

export type OAuthScopeSanityIssueCode =
  | 'not-applicable'
  | 'provider-mismatch'
  | 'missing-scope'
  | 'excessive-scope'
  | 'wildcard-scope'
  | 'mismatched-scope'

export type OAuthScopeSanitySeverity = 'info' | 'warn' | 'error'

export interface OAuthScopeSanityIssue {
  code: OAuthScopeSanityIssueCode
  severity: OAuthScopeSanitySeverity
  message: string
  scope?: string
  recommendation?: string
}

export interface OAuthScopeSanityRequest {
  manifest: AppManifest
  provider: OAuthProviderConfig
  requestedScopes?: string[]
}

export interface OAuthScopeSanityReport {
  applicable: boolean
  passed: boolean
  appId: string
  appVersion: string
  authProvider: string | null
  manifestScopes: string[]
  providerDefaultScopes: string[]
  requestedScopes: string[]
  effectiveRequestedScopes: string[]
  missingScopes: string[]
  excessiveScopes: string[]
  wildcardScopes: string[]
  mismatchedScopes: string[]
  issues: OAuthScopeSanityIssue[]
}

export function reviewOAuthScopeSanity(request: OAuthScopeSanityRequest): OAuthScopeSanityReport {
  const authConfig = request.manifest.authType === 'oauth2' ? request.manifest.authConfig : undefined
  const manifestScopes = uniqueScopes(authConfig?.scopes ?? [])
  const providerDefaultScopes = uniqueScopes(request.provider.defaultScopes ?? [])
  const requestedScopes = uniqueScopes(request.requestedScopes ?? [])
  const effectiveRequestedScopes = uniqueScopes([...providerDefaultScopes, ...requestedScopes])

  if (!authConfig) {
    return {
      applicable: false,
      passed: true,
      appId: request.manifest.appId,
      appVersion: request.manifest.appVersion,
      authProvider: null,
      manifestScopes: [],
      providerDefaultScopes,
      requestedScopes,
      effectiveRequestedScopes,
      missingScopes: [],
      excessiveScopes: [],
      wildcardScopes: [],
      mismatchedScopes: [],
      issues: [
        {
          code: 'not-applicable',
          severity: 'info',
          message: `App "${request.manifest.appId}" does not use OAuth2, so scope review is not applicable.`,
        },
      ],
    }
  }

  const issues: OAuthScopeSanityIssue[] = []
  const wildcardScopes = new Set<string>()
  const mismatchedScopes = new Set<string>()

  if (authConfig.provider.trim() !== request.provider.provider.trim()) {
    issues.push({
      code: 'provider-mismatch',
      severity: 'error',
      message: `Manifest provider "${authConfig.provider}" does not match configured provider "${request.provider.provider}".`,
      recommendation: 'Align the manifest OAuth provider with the configured provider before approval.',
    })
  }

  const normalizedManifestScopes = manifestScopes.map(normalizeScope)
  const normalizedRequestedScopes = effectiveRequestedScopes.map(normalizeScope)
  const normalizedRequestedScopeSet = new Set(normalizedRequestedScopes)

  for (const scope of [...providerDefaultScopes, ...requestedScopes]) {
    if (isWildcardScope(scope)) {
      wildcardScopes.add(normalizeScope(scope))
      issues.push({
        code: 'wildcard-scope',
        severity: 'error',
        scope,
        message: `Scope "${scope}" uses wildcard syntax and should be rejected or narrowed.`,
        recommendation: 'Replace wildcard scopes with explicit least-privilege scopes.',
      })
    }

    if (isMismatchedScope(scope)) {
      mismatchedScopes.add(normalizeScope(scope))
      issues.push({
        code: 'mismatched-scope',
        severity: 'warn',
        scope,
        message: `Scope "${scope}" is not in canonical scope form.`,
        recommendation: 'Use canonical lowercase scope strings without extra formatting or aliases.',
      })
    }
  }

  const missingScopes = normalizedManifestScopes.filter((scope) => !normalizedRequestedScopeSet.has(scope))
  for (const scope of missingScopes) {
    issues.push({
      code: 'missing-scope',
      severity: 'error',
      scope,
      message: `Manifest scope "${scope}" is not included in the requested OAuth scope set.`,
      recommendation: 'Request every manifest-declared OAuth scope before approval.',
    })
  }

  const excessiveScopes = normalizedRequestedScopes.filter((scope) => !normalizedManifestScopes.includes(scope))
  for (const scope of excessiveScopes) {
    issues.push({
      code: 'excessive-scope',
      severity: 'error',
      scope,
      message: `Requested scope "${scope}" is not declared by the manifest.`,
      recommendation: 'Remove undeclared scopes or update the manifest and reviewer notes to justify the expansion.',
    })
  }

  return {
    applicable: true,
    passed: issues.length === 0,
    appId: request.manifest.appId,
    appVersion: request.manifest.appVersion,
    authProvider: authConfig.provider,
    manifestScopes,
    providerDefaultScopes,
    requestedScopes,
    effectiveRequestedScopes,
    missingScopes,
    excessiveScopes,
    wildcardScopes: [...wildcardScopes],
    mismatchedScopes: [...mismatchedScopes],
    issues,
  }
}

function uniqueScopes(scopes: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const scope of scopes) {
    const normalized = normalizeScope(scope)
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function normalizeScope(scope: string): string {
  return scope.trim().replace(/\s+/g, ' ')
}

function isWildcardScope(scope: string): boolean {
  const normalized = normalizeScope(scope)
  return normalized.includes('*') || normalized.toLowerCase() === 'all' || normalized.toLowerCase() === 'all-scopes'
}

function isMismatchedScope(scope: string): boolean {
  const normalized = normalizeScope(scope)
  return normalized !== normalized.toLowerCase() || scope !== normalized
}
