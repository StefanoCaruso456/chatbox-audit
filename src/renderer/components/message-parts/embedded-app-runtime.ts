import type { AppPermissions } from '@shared/contracts/v1/permissions'
import {
  type EmbeddedAppMessage,
  EmbeddedAppMessageSchema,
  HostBootstrapMessageSchema,
  HostInvokeMessageSchema,
  validateEmbeddedAppMessage,
} from '@shared/contracts/v1/runtime-messages'
import { normalizeOrigin, OriginSchema } from '@shared/contracts/v1/shared'
import type { ToolSchema } from '@shared/contracts/v1/tool-schema'

export type HostBootstrapRuntimeMessage = Extract<EmbeddedAppMessage, { type: 'host.bootstrap' }>
export type HostInvokeRuntimeMessage = Extract<EmbeddedAppMessage, { type: 'host.invoke' }>

export type RuntimeOriginValidationReason =
  | 'match'
  | 'invalid-expected-origin'
  | 'missing-actual-origin'
  | 'invalid-actual-origin'
  | 'mismatch'

export interface RuntimeOriginValidationResult {
  valid: boolean
  reason: RuntimeOriginValidationReason
  expectedOrigin: string | null
  actualOrigin: string | null
  normalizedExpectedOrigin: string | null
  normalizedActualOrigin: string | null
}

export interface HeartbeatTimeoutInput {
  sentAt: string
  timeoutMs: number
  heartbeatExpiresAt?: string | null
  now?: string | Date
}

export interface HeartbeatTimeoutResult {
  source: 'heartbeat.expiresAt' | 'sentAt+timeoutMs'
  sentAt: string
  deadlineAt: string
  expired: boolean
  remainingMs: number
}

export interface HostRuntimeMessageContext {
  version?: 'v1'
  messageId: string
  correlationId?: string
  conversationId: string
  appSessionId: string
  appId: string
  sequence: number
  sentAt: string
  expectedOrigin: string
  handshakeToken: string
}

export interface CreateHostBootstrapMessageInput extends HostRuntimeMessageContext {
  launchReason: HostBootstrapRuntimeMessage['payload']['launchReason']
  authState: HostBootstrapRuntimeMessage['payload']['authState']
  grantedPermissions: AppPermissions
  embedUrl: string
  initialState?: HostBootstrapRuntimeMessage['payload']['initialState']
  availableTools?: ToolSchema[]
}

export interface CreateHostInvokeMessageInput extends HostRuntimeMessageContext {
  toolCallId: HostInvokeRuntimeMessage['payload']['toolCallId']
  toolName: HostInvokeRuntimeMessage['payload']['toolName']
  arguments: HostInvokeRuntimeMessage['payload']['arguments']
  timeoutMs?: number
}

function normalizeRuntimeOriginValue(origin: string | null | undefined): string | null {
  if (typeof origin !== 'string') {
    return null
  }

  const trimmed = origin.trim()
  if (!trimmed) {
    return null
  }

  const parsed = OriginSchema.safeParse(trimmed)
  if (!parsed.success) {
    return null
  }

  return normalizeOrigin(trimmed)
}

function normalizeRuntimeEmbedUrlOrigin(embedUrl: string | null | undefined): string | null {
  if (typeof embedUrl !== 'string') {
    return null
  }

  const trimmed = embedUrl.trim()
  if (!trimmed) {
    return null
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(trimmed)
  } catch {
    return null
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return null
  }

  return parsedUrl.origin
}

function toDateMs(value: string | Date, label: string): number {
  const timestamp = typeof value === 'string' ? Date.parse(value) : value.getTime()
  if (Number.isNaN(timestamp)) {
    throw new Error(`${label} must be a valid ISO datetime`)
  }

  return timestamp
}

function formatIsoDate(ms: number): string {
  return new Date(ms).toISOString()
}

function createRuntimeBase(input: HostRuntimeMessageContext) {
  return {
    version: input.version ?? 'v1',
    messageId: input.messageId,
    correlationId: input.correlationId,
    conversationId: input.conversationId,
    appSessionId: input.appSessionId,
    appId: input.appId,
    sequence: input.sequence,
    sentAt: input.sentAt,
    security: {
      handshakeToken: input.handshakeToken,
      expectedOrigin: input.expectedOrigin,
    },
  }
}

export function normalizeRuntimeMessageOrigin(origin: string | null | undefined): string | null {
  return normalizeRuntimeOriginValue(origin)
}

export function validateRuntimeMessageOrigin(
  expectedOrigin: string | null | undefined,
  actualOrigin: string | null | undefined
): RuntimeOriginValidationResult {
  const normalizedExpectedOrigin = normalizeRuntimeOriginValue(expectedOrigin)
  if (!normalizedExpectedOrigin) {
    return {
      valid: false,
      reason: 'invalid-expected-origin',
      expectedOrigin: typeof expectedOrigin === 'string' ? expectedOrigin : null,
      actualOrigin: typeof actualOrigin === 'string' ? actualOrigin : null,
      normalizedExpectedOrigin: null,
      normalizedActualOrigin: normalizeRuntimeOriginValue(actualOrigin),
    }
  }

  if (typeof actualOrigin !== 'string' || !actualOrigin.trim()) {
    return {
      valid: false,
      reason: 'missing-actual-origin',
      expectedOrigin: normalizedExpectedOrigin,
      actualOrigin: null,
      normalizedExpectedOrigin,
      normalizedActualOrigin: null,
    }
  }

  const normalizedActualOrigin = normalizeRuntimeOriginValue(actualOrigin)
  if (!normalizedActualOrigin) {
    return {
      valid: false,
      reason: 'invalid-actual-origin',
      expectedOrigin: normalizedExpectedOrigin,
      actualOrigin,
      normalizedExpectedOrigin,
      normalizedActualOrigin: null,
    }
  }

  const valid = normalizedExpectedOrigin === normalizedActualOrigin
  return {
    valid,
    reason: valid ? 'match' : 'mismatch',
    expectedOrigin: normalizedExpectedOrigin,
    actualOrigin: normalizedActualOrigin,
    normalizedExpectedOrigin,
    normalizedActualOrigin,
  }
}

export function isRuntimeMessageOriginAllowed(
  expectedOrigin: string | null | undefined,
  actualOrigin: string | null | undefined
): boolean {
  return validateRuntimeMessageOrigin(expectedOrigin, actualOrigin).valid
}

export function parseEmbeddedAppRuntimeMessage(input: unknown): EmbeddedAppMessage {
  return EmbeddedAppMessageSchema.parse(input)
}

export function validateEmbeddedAppRuntimeMessage(input: unknown) {
  return validateEmbeddedAppMessage(input)
}

export function createHostBootstrapMessage(input: CreateHostBootstrapMessageInput): HostBootstrapRuntimeMessage {
  const embedOrigin = normalizeRuntimeEmbedUrlOrigin(input.embedUrl)
  if (!embedOrigin) {
    throw new Error('embedUrl must be a valid HTTP or HTTPS URL')
  }

  const originCheck = validateRuntimeMessageOrigin(input.expectedOrigin, embedOrigin)
  if (!originCheck.valid) {
    throw new Error('embedUrl origin must match expectedOrigin')
  }

  return HostBootstrapMessageSchema.parse({
    ...createRuntimeBase(input),
    source: 'host',
    type: 'host.bootstrap',
    payload: {
      launchReason: input.launchReason,
      authState: input.authState,
      grantedPermissions: input.grantedPermissions,
      embedUrl: input.embedUrl,
      initialState: input.initialState,
      availableTools: input.availableTools ?? [],
    },
  })
}

export function createHostInvokeMessage(input: CreateHostInvokeMessageInput): HostInvokeRuntimeMessage {
  return HostInvokeMessageSchema.parse({
    ...createRuntimeBase(input),
    source: 'host',
    type: 'host.invoke',
    payload: {
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      arguments: input.arguments,
      timeoutMs: input.timeoutMs,
    },
  })
}

export function computeHeartbeatTimeout(input: HeartbeatTimeoutInput): HeartbeatTimeoutResult {
  const sentAtMs = toDateMs(input.sentAt, 'sentAt')
  const nowMs = input.now ? toDateMs(input.now, 'now') : Date.now()

  if (input.heartbeatExpiresAt) {
    const deadlineMs = toDateMs(input.heartbeatExpiresAt, 'heartbeatExpiresAt')
    return {
      source: 'heartbeat.expiresAt',
      sentAt: formatIsoDate(sentAtMs),
      deadlineAt: formatIsoDate(deadlineMs),
      expired: nowMs >= deadlineMs,
      remainingMs: Math.max(0, deadlineMs - nowMs),
    }
  }

  if (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive number')
  }

  const deadlineMs = sentAtMs + Math.trunc(input.timeoutMs)
  return {
    source: 'sentAt+timeoutMs',
    sentAt: formatIsoDate(sentAtMs),
    deadlineAt: formatIsoDate(deadlineMs),
    expired: nowMs >= deadlineMs,
    remainingMs: Math.max(0, deadlineMs - nowMs),
  }
}

export function isHeartbeatExpired(input: HeartbeatTimeoutInput): boolean {
  return computeHeartbeatTimeout(input).expired
}
