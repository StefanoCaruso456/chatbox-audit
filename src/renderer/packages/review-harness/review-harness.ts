import { normalizeOrigin } from '@shared/contracts/v1/shared'

export type ReviewHarnessSearch = {
  appId?: string
  appName?: string
  entryUrl: string
  targetOrigin?: string
  allowedOrigins?: string
  conversationId?: string
  appSessionId?: string
  authState?: 'not-required' | 'connected' | 'required' | 'expired'
  sandbox?: string
  reviewerNotes?: string
}

export type ReviewHarnessConfig = {
  appId: string
  appName: string
  entryUrl: string
  targetOrigin: string
  allowedOrigins: string[]
  conversationId: string
  appSessionId: string
  authState: 'not-required' | 'connected' | 'required' | 'expired'
  sandbox?: string
  reviewerNotes?: string
  handshakeToken: string
  runtimeWarnings: string[]
}

function parseAllowedOrigins(value: string | undefined, fallbackOrigin: string): string[] {
  const values = (value ?? fallbackOrigin)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (/^https?:\/\//i.test(item)) {
        return normalizeOrigin(item)
      }

      return normalizeOrigin(`https://${item}`)
    })

  return Array.from(new Set(values))
}

function deriveOrigin(entryUrl: string, targetOrigin?: string): string {
  if (targetOrigin?.trim()) {
    return normalizeOrigin(targetOrigin)
  }

  return new URL(entryUrl).origin
}

function buildSessionId(appId: string): string {
  return `review.${
    appId
      .replace(/[^a-z0-9]+/gi, '.')
      .replace(/(^\\.|\\.$)/g, '')
      .toLowerCase() || 'candidate'
  }`
}

export function buildReviewHarnessConfig(search: ReviewHarnessSearch): ReviewHarnessConfig {
  const entryUrl = new URL(search.entryUrl).toString()
  const targetOrigin = deriveOrigin(entryUrl, search.targetOrigin)
  const allowedOrigins = parseAllowedOrigins(search.allowedOrigins, targetOrigin)
  const appId = search.appId?.trim() || 'review.candidate'
  const appName = search.appName?.trim() || 'Review Candidate'
  const conversationId = search.conversationId?.trim() || 'review.conversation'
  const appSessionId = search.appSessionId?.trim() || buildSessionId(appId)
  const authState = search.authState ?? 'not-required'
  const runtimeWarnings: string[] = []

  if (!allowedOrigins.includes(targetOrigin)) {
    runtimeWarnings.push('Target origin is not present in the declared allowlist.')
  }

  if (new URL(entryUrl).origin !== targetOrigin) {
    runtimeWarnings.push('Entry URL origin does not match the expected target origin.')
  }

  return {
    appId,
    appName,
    entryUrl,
    targetOrigin,
    allowedOrigins,
    conversationId,
    appSessionId,
    authState,
    sandbox: search.sandbox?.trim() || undefined,
    reviewerNotes: search.reviewerNotes?.trim() || undefined,
    handshakeToken: `review.${appId}.${appSessionId}`,
    runtimeWarnings,
  }
}
