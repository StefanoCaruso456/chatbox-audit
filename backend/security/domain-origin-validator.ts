import { normalizeOrigin, OriginSchema } from '@shared/contracts/v1/shared'

export type DomainOriginValidationField = 'entryUrl' | 'targetOrigin' | 'allowedOrigins' | 'declaredOrigins' | 'declaredDomains'

export type DomainOriginValidationCode =
  | 'invalid-request'
  | 'empty-origin-set'
  | 'unsafe-wildcard-usage'
  | 'invalid-origin'
  | 'origin-not-https'
  | 'entry-origin-mismatch'
  | 'target-origin-not-allowed'
  | 'declared-origin-mismatch'
  | 'declared-domain-mismatch'

export interface DomainOriginValidationIssue {
  field: DomainOriginValidationField
  code: DomainOriginValidationCode
  message: string
  expected?: string
  actual?: string
}

export interface DomainOriginValidationInput {
  appId?: string
  appVersionId?: string
  entryUrl: string
  targetOrigin: string
  allowedOrigins: string[]
  declaredOrigins?: string[]
  declaredDomains?: string[]
}

export interface DomainOriginValidationReport {
  ok: boolean
  appId?: string
  appVersionId?: string
  entryUrl: string
  targetOrigin: string
  entryOrigin: string | null
  normalizedAllowedOrigins: string[]
  normalizedDeclaredOrigins: string[]
  normalizedDeclaredDomains: string[]
  issues: DomainOriginValidationIssue[]
}

interface NormalizedOriginSetResult {
  values: string[]
  issues: DomainOriginValidationIssue[]
}

export function validateDomainOriginSubmission(input: DomainOriginValidationInput): DomainOriginValidationReport {
  const issues: DomainOriginValidationIssue[] = []
  const entryUrl = normalizeText(input.entryUrl)
  const targetOrigin = normalizeText(input.targetOrigin)

  if (!entryUrl) {
    issues.push(issue('entryUrl', 'invalid-request', 'entryUrl is required.'))
  }

  if (!targetOrigin) {
    issues.push(issue('targetOrigin', 'invalid-request', 'targetOrigin is required.'))
  }

  const allowedOrigins = normalizeOriginSet(input.allowedOrigins, 'allowedOrigins')
  issues.push(...allowedOrigins.issues)

  const declaredOrigins = normalizeOptionalOriginSet(input.declaredOrigins, 'declaredOrigins')
  issues.push(...declaredOrigins.issues)

  const declaredDomains = normalizeDeclaredDomains(input.declaredDomains)
  issues.push(...declaredDomains.issues)

  const entryOrigin = parseEntryOrigin(entryUrl, issues)
  const normalizedTargetOrigin = parseExactOrigin(targetOrigin, 'targetOrigin', issues)

  if (entryOrigin && normalizedTargetOrigin && entryOrigin !== normalizedTargetOrigin) {
    issues.push(
      issue(
        'entryUrl',
        'entry-origin-mismatch',
        'entryUrl origin must match targetOrigin exactly.',
        normalizedTargetOrigin,
        entryOrigin
      )
    )
  }

  if (normalizedTargetOrigin && !allowedOrigins.values.includes(normalizedTargetOrigin)) {
    issues.push(
      issue(
        'targetOrigin',
        'target-origin-not-allowed',
        'targetOrigin must be present in allowedOrigins.',
        allowedOrigins.values.join(', '),
        normalizedTargetOrigin
      )
    )
  }

  if (declaredOrigins.values.length > 0 && !sameSet(declaredOrigins.values, allowedOrigins.values)) {
    issues.push(
      issue(
        'declaredOrigins',
        'declared-origin-mismatch',
        'declaredOrigins must match allowedOrigins exactly.',
        allowedOrigins.values.join(', '),
        declaredOrigins.values.join(', ')
      )
    )
  }

  if (declaredDomains.values.length > 0) {
    const derivedOrigins = declaredDomains.values.map((domain) => `https://${domain}`)
    if (!sameSet(derivedOrigins, allowedOrigins.values)) {
      issues.push(
        issue(
          'declaredDomains',
          'declared-domain-mismatch',
          'declaredDomains must resolve to the same HTTPS origins as allowedOrigins.',
          allowedOrigins.values.join(', '),
          derivedOrigins.join(', ')
        )
      )
    }
  }

  if (declaredOrigins.values.length === 0 && declaredDomains.values.length === 0 && allowedOrigins.values.length > 0) {
    issues.push(
      issue(
        'declaredOrigins',
        'declared-origin-mismatch',
        'Submission must declare origins or domains that explain the allowedOrigins set.',
        allowedOrigins.values.join(', ')
      )
    )
  }

  return {
    ok: issues.length === 0,
    appId: input.appId?.trim() || undefined,
    appVersionId: input.appVersionId?.trim() || undefined,
    entryUrl,
    targetOrigin,
    entryOrigin,
    normalizedAllowedOrigins: allowedOrigins.values,
    normalizedDeclaredOrigins: declaredOrigins.values,
    normalizedDeclaredDomains: declaredDomains.values,
    issues,
  }
}

export function validateManifestOriginConsistency(
  manifest: {
    appId: string
    appVersion: string
    allowedOrigins: string[]
    uiEmbedConfig: {
      entryUrl: string
      targetOrigin: string
    }
  },
  declaredDomains?: string[],
  declaredOrigins?: string[]
): DomainOriginValidationReport {
  return validateDomainOriginSubmission({
    appId: manifest.appId,
    appVersionId: manifest.appVersion,
    entryUrl: manifest.uiEmbedConfig.entryUrl,
    targetOrigin: manifest.uiEmbedConfig.targetOrigin,
    allowedOrigins: manifest.allowedOrigins,
    declaredDomains,
    declaredOrigins,
  })
}

function normalizeText(value: string | undefined | null): string {
  return value?.trim() ?? ''
}

function issue(
  field: DomainOriginValidationField,
  code: DomainOriginValidationCode,
  message: string,
  expected?: string,
  actual?: string
): DomainOriginValidationIssue {
  return {
    field,
    code,
    message,
    expected,
    actual,
  }
}

function parseEntryOrigin(entryUrl: string, issues: DomainOriginValidationIssue[]): string | null {
  if (!entryUrl) {
    return null
  }

  if (entryUrl.startsWith('http://')) {
    issues.push(issue('entryUrl', 'origin-not-https', 'entryUrl must use HTTPS.', 'https:', 'http:'))
  }

  if (containsWildcard(entryUrl)) {
    issues.push(issue('entryUrl', 'unsafe-wildcard-usage', 'entryUrl cannot contain wildcard characters.'))
  }

  try {
    const parsed = new URL(entryUrl)
    if (parsed.protocol !== 'https:') {
      issues.push(issue('entryUrl', 'origin-not-https', 'entryUrl must use HTTPS.', 'https:', parsed.protocol))
      return null
    }

    return parsed.origin
  } catch {
    issues.push(issue('entryUrl', 'invalid-origin', 'entryUrl must be a valid HTTPS URL.'))
    return null
  }
}

function parseExactOrigin(origin: string, field: DomainOriginValidationField, issues: DomainOriginValidationIssue[]): string | null {
  if (!origin) {
    return null
  }

  if (origin.startsWith('http://')) {
    issues.push(issue(field, 'origin-not-https', `${field} must use HTTPS.`, 'https:', 'http:'))
  }

  if (containsWildcard(origin)) {
    issues.push(issue(field, 'unsafe-wildcard-usage', `${field} cannot contain wildcard characters.`))
  }

  const parsed = OriginSchema.safeParse(origin)
  if (!parsed.success) {
    issues.push(issue(field, 'invalid-origin', `${field} must be a valid origin without path, query, or hash.`))
    return null
  }

  const normalized = normalizeOrigin(parsed.data)
  if (!normalized.startsWith('https://')) {
    issues.push(issue(field, 'origin-not-https', `${field} must use HTTPS.`, 'https://', normalized))
    return null
  }

  return normalized
}

function normalizeOriginSet(values: string[] | undefined, field: DomainOriginValidationField): NormalizedOriginSetResult {
  if (!values || values.length === 0) {
    return {
      values: [],
      issues: [issue(field, 'empty-origin-set', `${field} must contain at least one value.`)],
    }
  }

  const issues: DomainOriginValidationIssue[] = []
  const normalized: string[] = []

  for (const value of values) {
    const exactOrigin = parseExactOrigin(normalizeText(value), field, issues)
    if (exactOrigin) {
      normalized.push(exactOrigin)
    }
  }

  return {
    values: unique(normalized),
    issues,
  }
}

function normalizeOptionalOriginSet(values: string[] | undefined, field: DomainOriginValidationField): NormalizedOriginSetResult {
  if (!values || values.length === 0) {
    return {
      values: [],
      issues: [],
    }
  }

  return normalizeOriginSet(values, field)
}

function normalizeDeclaredDomains(values: string[] | undefined): NormalizedOriginSetResult {
  if (!values || values.length === 0) {
    return {
      values: [],
      issues: [],
    }
  }

  const issues: DomainOriginValidationIssue[] = []
  const normalized: string[] = []

  for (const raw of values) {
    const domain = normalizeText(raw)
    if (!domain) {
      issues.push(issue('declaredDomains', 'invalid-origin', 'declaredDomains must not contain empty values.'))
      continue
    }

    if (containsWildcard(domain)) {
      issues.push(issue('declaredDomains', 'unsafe-wildcard-usage', 'declaredDomains cannot contain wildcard characters.'))
      continue
    }

    if (domain.includes('://')) {
      issues.push(issue('declaredDomains', 'invalid-origin', 'declaredDomains must be hostnames only, without a scheme or path.'))
      continue
    }

    try {
      const parsed = new URL(`https://${domain}`)
      if (parsed.protocol !== 'https:' || parsed.host !== parsed.hostname) {
        issues.push(
          issue(
            'declaredDomains',
            'invalid-origin',
            'declaredDomains must be exact hostnames without ports, paths, queries, or hashes.'
          )
        )
        continue
      }

      normalized.push(parsed.hostname.toLowerCase())
    } catch {
      issues.push(issue('declaredDomains', 'invalid-origin', `declaredDomains value "${domain}" is not a valid hostname.`))
    }
  }

  return {
    values: unique(normalized),
    issues,
  }
}

function containsWildcard(value: string): boolean {
  return value.includes('*')
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}
