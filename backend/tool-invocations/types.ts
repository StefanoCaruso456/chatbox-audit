import type { JsonObject, ToolAuthRequirement, ToolInvocationMode } from '@shared/contracts/v1'

export const ToolInvocationStatusValues = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
] as const

export type ToolInvocationStatus = (typeof ToolInvocationStatusValues)[number]

export interface ToolInvocationTransitionEntry {
  status: ToolInvocationStatus
  at: string
  note?: string
}

export type ToolInvocationMetadata = Record<string, unknown> & {
  transitionLog?: ToolInvocationTransitionEntry[]
}

export interface ToolInvocationRecord {
  toolCallId: string
  conversationId: string
  appSessionId?: string
  userId: string
  appId: string
  appVersionId?: string
  requestMessageId?: string
  correlationId?: string
  toolName: string
  invocationMode: ToolInvocationMode
  authRequirement: ToolAuthRequirement
  status: ToolInvocationStatus
  requestPayloadJson: JsonObject
  responsePayloadJson?: JsonObject
  errorPayloadJson?: JsonObject
  resultSummary?: string
  queuedAt: string
  startedAt?: string
  completedAt?: string
  latencyMs?: number
  metadata: ToolInvocationMetadata
}

export interface QueueToolInvocationRequest {
  toolCallId: string
  conversationId: string
  userId: string
  appId: string
  toolName: string
  invocationMode: ToolInvocationMode
  authRequirement: ToolAuthRequirement
  requestPayloadJson: JsonObject
  appSessionId?: string
  appVersionId?: string
  requestMessageId?: string
  correlationId?: string
  queuedAt?: string
  metadata?: ToolInvocationMetadata
}

export interface StartToolInvocationRequest {
  toolCallId: string
  startedAt?: string
  metadata?: ToolInvocationMetadata
}

export interface CompleteToolInvocationRequest {
  toolCallId: string
  responsePayloadJson: JsonObject
  resultSummary: string
  completedAt?: string
  latencyMs?: number
  metadata?: ToolInvocationMetadata
}

export interface FailToolInvocationRequest {
  toolCallId: string
  errorPayloadJson: JsonObject
  resultSummary?: string
  completedAt?: string
  latencyMs?: number
  metadata?: ToolInvocationMetadata
}

export interface CancelToolInvocationRequest {
  toolCallId: string
  resultSummary?: string
  completedAt?: string
  latencyMs?: number
  metadata?: ToolInvocationMetadata
}

export interface TimeoutToolInvocationRequest {
  toolCallId: string
  resultSummary?: string
  completedAt?: string
  latencyMs?: number
  metadata?: JsonObject
}

export interface ListToolInvocationsFilter {
  conversationId?: string
  appSessionId?: string
  userId?: string
  appId?: string
  toolName?: string
  status?: ToolInvocationStatus
}

export interface ToolInvocationSuccess<T> {
  ok: true
  value: T
}

export interface ToolInvocationFailure {
  ok: false
  code: ToolInvocationErrorCode
  message: string
  details?: string[]
}

export type ToolInvocationResult<T> = ToolInvocationSuccess<T> | ToolInvocationFailure

export type ToolInvocationErrorCode =
  | 'invalid-payload'
  | 'duplicate-tool-call'
  | 'not-found'
  | 'invalid-transition'
