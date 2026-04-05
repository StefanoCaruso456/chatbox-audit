import { exampleInternalChessManifest } from '@shared/contracts/v1'
import type { JsonObject, JsonValue } from '@shared/contracts/v1/shared'
import type { Message, MessageContentParts, MessageToolCallPart, StreamTextResult } from '@shared/types'
import { selectConversationAppReference } from '@/packages/tutormeai-apps/conversation-state'
import { buildRuntimeTraceId, recordRuntimeTraceSpan } from '@/stores/runtimeTraceStore'
import { getSidebarAppRuntimeSnapshotByAppSessionId } from '@/stores/sidebarAppRuntimeStore'

const CHESS_APPROVED_APP_ID = 'chess-tutor'

export interface RuntimeTraceRetryEvent {
  attempt: number
  maxAttempts: number
  error?: string
  recordedAt: string
}

interface AssistantModelTraceInput {
  conversationId: string
  sessionId: string
  previousMessages: Message[]
  userRequest: string
  provider?: string
  modelId: string
  messageId?: string
  promptMessageCount: number
  webBrowsingEnabled: boolean
  knowledgeBaseId?: number
  knowledgeBaseName?: string
  startedAt: string
  endedAt: string
  firstTokenLatencyMs?: number
  contentParts: MessageContentParts
  usage?: StreamTextResult['usage']
  finishReason?: string
  trace?: StreamTextResult['trace']
  retryEvents?: RuntimeTraceRetryEvent[]
  error?: {
    message: string
    code?: string
    recoverable?: boolean
    details?: JsonObject
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function buildTraceTags(...values: Array<string | undefined | null | false>) {
  return values.filter((value): value is string => Boolean(value))
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === null) {
    return null
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => toJsonValue(item))
      .filter((item): item is Exclude<typeof item, undefined> => item !== undefined)
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, entryValue]) => [key, toJsonValue(entryValue)] as const)
      .filter((entry): entry is readonly [string, JsonValue] => entry[1] !== undefined)

    return Object.fromEntries(entries)
  }

  return undefined
}

function toJsonObject(value: unknown): JsonObject | undefined {
  const normalized = toJsonValue(value)
  return normalized && !Array.isArray(normalized) && typeof normalized === 'object' ? normalized : undefined
}

function compactJsonObject(value: Record<string, JsonValue | undefined>): JsonObject | undefined {
  const entries = Object.entries(value).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined)
  return entries.length ? Object.fromEntries(entries) : undefined
}

function truncateText(value: string | undefined, maxLength = 280) {
  const normalized = value?.trim()
  if (!normalized) {
    return undefined
  }

  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}...`
}

function inferApprovedAppId(referenceAppId: string | undefined) {
  if (!referenceAppId) {
    return undefined
  }

  return referenceAppId === exampleInternalChessManifest.appId ? CHESS_APPROVED_APP_ID : referenceAppId
}

function resolveTraceTarget(
  input: Pick<AssistantModelTraceInput, 'conversationId' | 'sessionId' | 'previousMessages' | 'userRequest'>
) {
  const reference = selectConversationAppReference(input.previousMessages, input.userRequest)
  const appSessionId = reference?.appSessionId
  const snapshot = appSessionId ? getSidebarAppRuntimeSnapshotByAppSessionId(input.sessionId, appSessionId) : null
  const approvedAppId = snapshot?.approvedAppId ?? inferApprovedAppId(reference?.appId)
  const runtimeAppId = snapshot?.runtimeAppId

  return {
    traceId: buildRuntimeTraceId({
      conversationId: input.conversationId,
      appSessionId,
      runtimeAppId,
    }),
    appSessionId,
    approvedAppId,
    runtimeAppId,
  }
}

function getToolCallParts(parts: MessageContentParts): MessageToolCallPart[] {
  return parts.filter((part): part is MessageToolCallPart => part.type === 'tool-call')
}

function summarizeContent(parts: MessageContentParts) {
  const textPreview = truncateText(
    parts
      .filter((part) => part.type === 'text' || part.type === 'reasoning' || part.type === 'info')
      .map((part) => part.text)
      .join('\n')
  )

  const toolCallParts = getToolCallParts(parts)
  const uniqueToolCallCount = new Set(toolCallParts.map((part) => part.toolCallId)).size
  const toolResultCount = toolCallParts.filter((part) => part.state === 'result').length
  const toolErrorCount = toolCallParts.filter((part) => part.state === 'error').length
  const toolPendingCount = toolCallParts.filter((part) => part.state === 'call').length

  return {
    textPreview,
    toolCallParts,
    uniqueToolCallCount,
    toolResultCount,
    toolErrorCount,
    toolPendingCount,
  }
}

function extractCostUsd(input: Pick<AssistantModelTraceInput, 'usage' | 'trace'>) {
  const candidates: Array<Record<string, unknown> | undefined> = [
    toJsonObject(input.usage?.raw),
    input.trace?.providerMetadata,
    ...(input.trace?.steps?.map((step) => step.providerMetadata) ?? []),
  ]

  const costPaths = [
    ['costUsd'],
    ['cost_usd'],
    ['totalCostUsd'],
    ['total_cost_usd'],
    ['billing', 'costUsd'],
    ['billing', 'cost_usd'],
    ['usage', 'costUsd'],
    ['usage', 'cost_usd'],
    ['pricing', 'costUsd'],
    ['pricing', 'cost_usd'],
    ['openrouter', 'cost'],
    ['gateway', 'costUsd'],
  ]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    for (const path of costPaths) {
      let current: unknown = candidate
      for (const segment of path) {
        current = isRecord(current) ? current[segment] : undefined
      }

      if (typeof current === 'number' && Number.isFinite(current) && current >= 0) {
        return current
      }
    }
  }

  return undefined
}

function buildToolEventTimestamp(startedAt: string, endedAt: string, index: number, count: number) {
  const startMs = new Date(startedAt).getTime()
  const endMs = new Date(endedAt).getTime()
  const durationMs = Math.max(endMs - startMs, 0)

  if (durationMs === 0 || count <= 0) {
    return new Date(endMs).toISOString()
  }

  const offset = Math.round((durationMs * (index + 1)) / (count + 1))
  return new Date(startMs + offset).toISOString()
}

function summarizeToolValue(value: unknown) {
  const jsonValue = toJsonValue(value)
  if (jsonValue !== undefined) {
    return jsonValue
  }

  if (typeof value === 'string') {
    return truncateText(value, 400)
  }

  return undefined
}

export function recordAssistantModelTrace(input: AssistantModelTraceInput) {
  const target = resolveTraceTarget(input)
  const contentSummary = summarizeContent(input.contentParts)
  const usage = input.usage
  const trace = input.trace
  const costUsd = extractCostUsd(input)
  const retryEvents = input.retryEvents ?? []

  const modelSpan = recordRuntimeTraceSpan({
    traceId: target.traceId,
    name: `${input.modelId} assistant generation`,
    kind: 'model-call',
    status: input.error ? 'failed' : 'succeeded',
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    appSessionId: target.appSessionId,
    approvedAppId: target.approvedAppId,
    runtimeAppId: target.runtimeAppId,
    actor: {
      layer: 'model',
      source: 'session-generation',
    },
    input: compactJsonObject({
      userRequest: truncateText(input.userRequest, 600),
      messageId: input.messageId,
      promptMessageCount: input.promptMessageCount,
      webBrowsingEnabled: input.webBrowsingEnabled,
      knowledgeBaseId: input.knowledgeBaseId,
      knowledgeBaseName: input.knowledgeBaseName,
    }),
    output: compactJsonObject({
      textPreview: contentSummary.textPreview,
      finishReason: input.finishReason,
      toolCallCount: contentSummary.uniqueToolCallCount,
      toolResultCount: contentSummary.toolResultCount,
      toolErrorCount: contentSummary.toolErrorCount,
      toolPendingCount: contentSummary.toolPendingCount,
    }),
    tags: buildTraceTags(
      'model-call',
      'model',
      target.approvedAppId,
      target.runtimeAppId,
      input.provider,
      input.error ? 'failed' : 'succeeded'
    ),
    model: {
      provider: input.provider,
      modelId: input.modelId,
      tokenCountInput: usage?.inputTokens,
      tokenCountOutput: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
      reasoningTokens: usage?.outputTokenDetails.reasoningTokens ?? usage?.reasoningTokens,
      cachedInputTokens: usage?.inputTokenDetails.cacheReadTokens ?? usage?.cachedInputTokens,
      cacheWriteTokens: usage?.inputTokenDetails.cacheWriteTokens,
      textOutputTokens: usage?.outputTokenDetails.textTokens,
      costUsd,
      latencyMs: Math.max(new Date(input.endedAt).getTime() - new Date(input.startedAt).getTime(), 0),
      firstTokenLatencyMs: input.firstTokenLatencyMs,
    },
    metadata: compactJsonObject({
      finishReason: input.finishReason,
      retryCount: retryEvents.length,
      stepCount: trace?.stepCount ?? trace?.steps?.length,
      toolCallCount: contentSummary.uniqueToolCallCount,
      toolEventCount: contentSummary.toolCallParts.length,
      toolResultCount: contentSummary.toolResultCount,
      toolErrorCount: contentSummary.toolErrorCount,
      toolPendingCount: contentSummary.toolPendingCount,
      retries: retryEvents.length
        ? retryEvents
            .map((event) =>
              compactJsonObject({
                recordedAt: event.recordedAt,
                attempt: event.attempt,
                maxAttempts: event.maxAttempts,
                error: event.error,
              })
            )
            .filter((value): value is JsonObject => value !== undefined)
        : undefined,
      steps: trace?.steps?.length
        ? trace.steps.map((step) => toJsonObject(step)).filter((value): value is JsonObject => value !== undefined)
        : undefined,
      providerMetadata: trace?.providerMetadata,
      outputPreview: contentSummary.textPreview,
    }),
    error: input.error
      ? {
          code: input.error.code,
          message: input.error.message,
          recoverable: input.error.recoverable,
          details: input.error.details,
        }
      : undefined,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
  })

  retryEvents.forEach((event) => {
    recordRuntimeTraceSpan({
      traceId: target.traceId,
      parentSpanId: modelSpan.spanId,
      name: `${input.modelId} retry attempt ${event.attempt}`,
      kind: 'model-retry',
      status: 'failed',
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      appSessionId: target.appSessionId,
      approvedAppId: target.approvedAppId,
      runtimeAppId: target.runtimeAppId,
      actor: {
        layer: 'model',
        source: 'session-generation',
      },
      input: compactJsonObject({
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
      }),
      output: event.error ? truncateText(event.error, 400) : `Retrying attempt ${event.attempt}.`,
      tags: buildTraceTags('model-retry', 'model', target.approvedAppId, target.runtimeAppId, input.provider),
      metadata: compactJsonObject({
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
        error: event.error,
      }),
      error: event.error
        ? {
            message: event.error,
            recoverable: true,
          }
        : undefined,
      startedAt: event.recordedAt,
      endedAt: event.recordedAt,
    })
  })

  contentSummary.toolCallParts.forEach((part, index) => {
    const eventTimestamp = buildToolEventTimestamp(
      input.startedAt,
      input.endedAt,
      index,
      contentSummary.toolCallParts.length
    )
    recordRuntimeTraceSpan({
      traceId: target.traceId,
      parentSpanId: modelSpan.spanId,
      name: `${part.toolName} ${part.state}`,
      kind: 'tool-call',
      status: part.state === 'error' ? 'failed' : part.state === 'result' ? 'succeeded' : 'active',
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      appSessionId: target.appSessionId,
      approvedAppId: target.approvedAppId,
      runtimeAppId: target.runtimeAppId,
      actor: {
        layer: 'model',
        source: 'session-generation',
      },
      input: summarizeToolValue(part.args),
      output: part.state === 'call' ? undefined : summarizeToolValue(part.result),
      tags: buildTraceTags('tool-call', 'model', target.approvedAppId, target.runtimeAppId, part.toolName, part.state),
      metadata: compactJsonObject({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        state: part.state,
        index,
      }),
      error:
        part.state === 'error'
          ? {
              message:
                truncateText(typeof part.result === 'string' ? part.result : `${part.toolName} returned an error.`) ??
                `${part.toolName} returned an error.`,
              recoverable: true,
            }
          : undefined,
      startedAt: eventTimestamp,
      endedAt: eventTimestamp,
    })
  })

  return modelSpan
}
