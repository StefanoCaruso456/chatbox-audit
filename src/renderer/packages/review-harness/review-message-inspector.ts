import { type EmbeddedAppMessage, validateEmbeddedAppMessage } from '../../../shared/contracts/v1/runtime-messages'
import { normalizeOrigin, OriginSchema } from '../../../shared/contracts/v1/shared'

export type ReviewMessageDecision = 'accept' | 'flag' | 'reject'

export type ReviewMessageInspectionReason =
  | 'invalid-shape'
  | 'origin-mismatch'
  | 'envelope-mismatch'
  | 'unexpected-source-type'
  | 'accepted-traffic'

export interface ReviewMessageInspectionContext {
  expectedOrigin: string
  conversationId: string
  appSessionId: string
  appId: string
}

export interface ReviewMessageInspectionInput extends ReviewMessageInspectionContext {
  origin: string | null | undefined
  payload: unknown
}

export interface ReviewMessageInspectionResult {
  decision: ReviewMessageDecision
  reason: ReviewMessageInspectionReason
  summary: string
  details: string[]
  expectedOrigin: string | null
  actualOrigin: string | null
  message?: EmbeddedAppMessage
  source?: EmbeddedAppMessage['source']
  type?: EmbeddedAppMessage['type']
}

function normalizeReviewOrigin(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = OriginSchema.safeParse(trimmed)
  if (!parsed.success) {
    return null
  }

  return normalizeOrigin(trimmed)
}

function buildResult(
  decision: ReviewMessageDecision,
  reason: ReviewMessageInspectionReason,
  summary: string,
  details: string[],
  expectedOrigin: string | null,
  actualOrigin: string | null,
  message?: EmbeddedAppMessage
): ReviewMessageInspectionResult {
  return {
    decision,
    reason,
    summary,
    details,
    expectedOrigin,
    actualOrigin,
    message,
    source: message?.source,
    type: message?.type,
  }
}

function formatEnvelopeMismatchDetails(
  message: EmbeddedAppMessage,
  expected: ReviewMessageInspectionContext
): string[] {
  const details: string[] = []

  if (message.conversationId !== expected.conversationId) {
    details.push(
      `conversationId mismatch: expected "${expected.conversationId}" but received "${message.conversationId}".`
    )
  }

  if (message.appSessionId !== expected.appSessionId) {
    details.push(`appSessionId mismatch: expected "${expected.appSessionId}" but received "${message.appSessionId}".`)
  }

  if (message.appId !== expected.appId) {
    details.push(`appId mismatch: expected "${expected.appId}" but received "${message.appId}".`)
  }

  const expectedEnvelopeOrigin = normalizeReviewOrigin(expected.expectedOrigin)
  const messageEnvelopeOrigin = normalizeReviewOrigin(message.security.expectedOrigin)
  if (expectedEnvelopeOrigin !== messageEnvelopeOrigin) {
    details.push(
      `security.expectedOrigin mismatch: expected "${expectedEnvelopeOrigin ?? expected.expectedOrigin}" but received "${messageEnvelopeOrigin ?? message.security.expectedOrigin}".`
    )
  }

  return details
}

function isAcceptedAppTraffic(message: EmbeddedAppMessage): boolean {
  return message.source === 'app'
}

export function inspectReviewMessage(input: ReviewMessageInspectionInput): ReviewMessageInspectionResult {
  const expectedOrigin = normalizeReviewOrigin(input.expectedOrigin)
  const actualOrigin = normalizeReviewOrigin(input.origin)

  if (!expectedOrigin || !actualOrigin || expectedOrigin !== actualOrigin) {
    return buildResult(
      'reject',
      'origin-mismatch',
      'Rejected raw review iframe traffic because the browser origin did not match the expected sandbox origin.',
      [
        `expectedOrigin: ${expectedOrigin ?? input.expectedOrigin}`,
        `actualOrigin: ${actualOrigin ?? input.origin ?? 'missing'}`,
      ],
      expectedOrigin,
      actualOrigin
    )
  }

  const validation = validateEmbeddedAppMessage(input.payload)
  if (!validation.success) {
    return buildResult(
      'reject',
      'invalid-shape',
      'Rejected raw review iframe traffic because the payload did not match the shared runtime message contract.',
      validation.errors,
      expectedOrigin,
      actualOrigin
    )
  }

  const message = validation.data

  if (!isAcceptedAppTraffic(message)) {
    return buildResult(
      'flag',
      'unexpected-source-type',
      'Flagged a valid runtime message that is not app traffic from the embedded app iframe.',
      [`source: ${message.source}`, `type: ${message.type}`],
      expectedOrigin,
      actualOrigin,
      message
    )
  }

  const envelopeMismatchDetails = formatEnvelopeMismatchDetails(message, input)
  if (envelopeMismatchDetails.length > 0) {
    return buildResult(
      'reject',
      'envelope-mismatch',
      'Rejected embedded app traffic because the message envelope did not match the review session context.',
      envelopeMismatchDetails,
      expectedOrigin,
      actualOrigin,
      message
    )
  }

  return buildResult(
    'accept',
    'accepted-traffic',
    'Accepted embedded app traffic from the review iframe.',
    [
      `source: ${message.source}`,
      `type: ${message.type}`,
      `conversationId: ${message.conversationId}`,
      `appSessionId: ${message.appSessionId}`,
      `appId: ${message.appId}`,
    ],
    expectedOrigin,
    actualOrigin,
    message
  )
}
