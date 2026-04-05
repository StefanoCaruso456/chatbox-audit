import type { AppManifest } from '@shared/contracts/v1'
import { normalizeOrigin, OriginSchema } from '@shared/contracts/v1/shared'
import { failureResult } from '../errors'
import type { AppRegistryRecord } from '../registry/types'
import type {
  AppIframeEmbeddingPolicy,
  AppSecurityCspPolicy,
  AppSecurityHeaders,
  AppSecurityResult,
  BuildIframeEmbeddingPolicyInput,
  BuildPlatformCspPolicyInput,
} from './types'

function uniqueOrigins(origins: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const origin of origins) {
    if (!seen.has(origin)) {
      seen.add(origin)
      normalized.push(origin)
    }
  }

  return normalized
}

function isWildcardOrigin(origin: string): boolean {
  return origin.includes('*')
}

function normalizeOriginList(
  origins: string[]
): AppSecurityResult<string[]> {
  if (!origins.length) {
    return failureResult('security', 'empty-origin-set', 'At least one approved origin is required.')
  }

  const normalized: string[] = []
  for (const origin of origins) {
    if (isWildcardOrigin(origin)) {
      return failureResult(
        'security',
        'unsafe-wildcard-usage',
        `Wildcard origin "${origin}" is not allowed.`
      )
    }

    const parsed = OriginSchema.safeParse(origin.trim())
    if (!parsed.success) {
      return failureResult('security', 'invalid-csp-policy', `Origin "${origin}" is not a valid origin.`)
    }

    normalized.push(normalizeOrigin(parsed.data))
  }

  return { ok: true, value: uniqueOrigins(normalized) }
}

function buildDirectiveValue(sources: string[]): string[] {
  return uniqueOrigins(sources)
}

function toCspHeaderValue(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}

export function buildAppIframeEmbeddingPolicy(
  input: BuildIframeEmbeddingPolicyInput
): AppSecurityResult<AppIframeEmbeddingPolicy> {
  const normalizedOrigins = normalizeOriginList(input.allowedOrigins)
  if (!normalizedOrigins.ok) {
    return normalizedOrigins
  }

  const normalizedEntryOrigin = normalizeOrigin(input.entryUrl)
  const normalizedTargetOrigin = normalizeOrigin(input.targetOrigin)

  if (normalizedEntryOrigin !== normalizedTargetOrigin) {
    return failureResult(
      'security',
      'origin-not-allowed',
      'entryUrl origin must match the approved targetOrigin.'
    )
  }

  if (!normalizedOrigins.value.includes(normalizedTargetOrigin)) {
    return failureResult(
      'security',
      'origin-not-allowed',
      'targetOrigin must be present in the approved origin allowlist.'
    )
  }

  const sandboxTokens = ['allow-scripts']
  if (input.sandbox.allowForms) {
    sandboxTokens.push('allow-forms')
  }
  if (input.sandbox.allowPopups) {
    sandboxTokens.push('allow-popups')
  }
  if (input.sandbox.allowSameOrigin) {
    sandboxTokens.push('allow-same-origin')
  }

  const csp = buildAppCspPolicy({
    clientOrigin: normalizedTargetOrigin,
    backendOrigin: normalizedTargetOrigin,
    approvedAppOrigins: normalizedOrigins.value,
  })
  if (!csp.ok) {
    return csp
  }

  return {
    ok: true,
    value: {
      appId: input.appId,
      appVersionId: input.appVersionId,
      entryUrl: normalizedEntryOrigin,
      targetOrigin: normalizedTargetOrigin,
      allowedOrigins: normalizedOrigins.value,
      sandboxAttribute: sandboxTokens.join(' '),
      loadingStrategy: input.loadingStrategy,
      csp: csp.value,
    },
  }
}

export function buildAppCspPolicy(
  input: BuildPlatformCspPolicyInput
): AppSecurityResult<AppSecurityCspPolicy> {
  const clientOrigin = normalizeOriginList([input.clientOrigin])
  if (!clientOrigin.ok) {
    return clientOrigin
  }

  const backendOrigin = normalizeOriginList([input.backendOrigin])
  if (!backendOrigin.ok) {
    return backendOrigin
  }

  const approvedAppOrigins = normalizeOriginList(input.approvedAppOrigins)
  if (!approvedAppOrigins.ok) {
    return approvedAppOrigins
  }

  const extraConnectOrigins = input.extraConnectOrigins ? normalizeOriginList(input.extraConnectOrigins) : { ok: true as const, value: [] as string[] }
  if (!extraConnectOrigins.ok) {
    return extraConnectOrigins
  }

  const styleSrc = ["'self'"]
  if (input.allowInlineStyles) {
    styleSrc.push("'unsafe-inline'")
  }

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'connect-src': buildDirectiveValue([
      "'self'",
      clientOrigin.value[0],
      backendOrigin.value[0],
      ...approvedAppOrigins.value,
      ...extraConnectOrigins.value,
    ]),
    'frame-src': buildDirectiveValue([...approvedAppOrigins.value]),
    'img-src': buildDirectiveValue(["'self'", 'data:', ...approvedAppOrigins.value]),
    'script-src': ["'self'"],
    'style-src': styleSrc,
    'form-action': ["'self'"],
  }

  const headerValue = toCspHeaderValue(directives)

  return {
    ok: true,
    value: {
      directives,
      headerValue,
      headers: {
        'content-security-policy': headerValue,
      },
    },
  }
}

export function buildAppSecurityHeaders(
  input: BuildPlatformCspPolicyInput
): AppSecurityResult<AppSecurityHeaders> {
  const csp = buildAppCspPolicy(input)
  if (!csp.ok) {
    return csp
  }

  return {
    ok: true,
    value: {
      csp: csp.value,
      headers: {
        ...csp.value.headers,
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'permissions-policy': 'camera=(), microphone=(self), geolocation=(), payment=()',
      },
    },
  }
}

export function buildAppLaunchOriginPolicy(app: AppRegistryRecord) {
  return buildAppIframeEmbeddingPolicy({
    appId: app.appId,
    appVersionId: app.currentVersionId,
    entryUrl: app.currentVersion.manifest.uiEmbedConfig.entryUrl,
    targetOrigin: app.currentVersion.manifest.uiEmbedConfig.targetOrigin,
    allowedOrigins: app.currentVersion.manifest.allowedOrigins,
    sandbox: app.currentVersion.manifest.uiEmbedConfig.sandbox,
    loadingStrategy: app.currentVersion.manifest.uiEmbedConfig.loadingStrategy,
  })
}

export function buildAppManifestLaunchPolicy(manifest: AppManifest) {
  return buildAppIframeEmbeddingPolicy({
    appId: manifest.appId,
    appVersionId: manifest.appVersion,
    entryUrl: manifest.uiEmbedConfig.entryUrl,
    targetOrigin: manifest.uiEmbedConfig.targetOrigin,
    allowedOrigins: manifest.allowedOrigins,
    sandbox: manifest.uiEmbedConfig.sandbox,
    loadingStrategy: manifest.uiEmbedConfig.loadingStrategy,
  })
}
