import type { RuntimeTraceSpan } from '@shared/contracts/v1'
import type { JsonValue } from '@shared/contracts/v1/shared'
import { initLogger, type Logger } from 'braintrust'

export const DEFAULT_BRAINTRUST_APP_URL = 'https://www.braintrust.dev'
export const DEFAULT_BRAINTRUST_PROJECT_NAME = 'ChatBridge Runtime'

export interface BraintrustRuntimeTelemetryConfig {
  apiKey: string
  appUrl: string
  projectName: string
}

export interface BraintrustRuntimeTelemetryResult {
  exportedSpanIds: string[]
  projectName: string
}

export class BraintrustTelemetryConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BraintrustTelemetryConfigError'
  }
}

let cachedLoggerKey: string | null = null
let cachedLogger: Logger<true> | null = null

export function resolveBraintrustRuntimeTelemetryConfig(
  env: Record<string, string | undefined> = process.env
): BraintrustRuntimeTelemetryConfig | null {
  const apiKey = normalizeNonEmptyString(env.BRAINTRUST_API_KEY)
  if (!apiKey) {
    return null
  }

  return {
    apiKey,
    appUrl: normalizeNonEmptyString(env.BRAINTRUST_APP_URL) ?? DEFAULT_BRAINTRUST_APP_URL,
    projectName: normalizeNonEmptyString(env.BRAINTRUST_PROJECT_NAME) ?? DEFAULT_BRAINTRUST_PROJECT_NAME,
  }
}

export async function ensureBraintrustRuntimeProject(input: {
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
} = {}): Promise<{ projectName: string }> {
  const config = resolveBraintrustRuntimeTelemetryConfig(input.env)
  if (!config) {
    throw new BraintrustTelemetryConfigError('Braintrust telemetry is not configured on the Railway backend.')
  }

  const logger = getBraintrustRuntimeLogger(config, input.fetchImpl)
  await logger.id
  return {
    projectName: config.projectName,
  }
}

export async function exportRuntimeTraceSpansToBraintrust(input: {
  spans: RuntimeTraceSpan[]
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
}): Promise<BraintrustRuntimeTelemetryResult> {
  const config = resolveBraintrustRuntimeTelemetryConfig(input.env)
  if (!config) {
    throw new BraintrustTelemetryConfigError('Braintrust telemetry is not configured on the Railway backend.')
  }

  if (!input.spans.length) {
    return {
      exportedSpanIds: [],
      projectName: config.projectName,
    }
  }

  const logger = getBraintrustRuntimeLogger(config, input.fetchImpl)
  await logger.id

  const rootSpanIdsByTrace = new Map<string, string>()
  for (const span of input.spans) {
    if (span.kind === 'trace-root') {
      rootSpanIdsByTrace.set(span.traceId, span.spanId)
    }
  }

  for (const span of sortRuntimeTraceSpans(input.spans)) {
    const startSpanInput = {
      name: span.name,
      spanId: span.spanId,
      startTime: toEpochSeconds(span.startedAt),
      event: buildBraintrustSpanEvent(span),
    }

    const rootSpanId = rootSpanIdsByTrace.get(span.traceId) ?? buildRuntimeTraceRootSpanId(span.traceId)
    const braintrustSpan =
      span.kind === 'trace-root'
        ? logger.startSpan(startSpanInput)
        : logger.startSpan({
            ...startSpanInput,
            parentSpanIds: {
              rootSpanId,
              spanId: span.parentSpanId ?? rootSpanId,
            },
          })

    braintrustSpan.end({
      endTime: toEpochSeconds(span.endedAt),
    })
  }

  await logger.flush()
  return {
    exportedSpanIds: input.spans.map((span) => span.spanId),
    projectName: config.projectName,
  }
}

function getBraintrustRuntimeLogger(config: BraintrustRuntimeTelemetryConfig, fetchImpl?: typeof fetch) {
  const cacheKey = JSON.stringify({
    appUrl: config.appUrl,
    projectName: config.projectName,
    apiKeySuffix: config.apiKey.slice(-6),
  })

  if (!cachedLogger || cachedLoggerKey !== cacheKey) {
    cachedLoggerKey = cacheKey
    cachedLogger = initLogger({
      apiKey: config.apiKey,
      appUrl: config.appUrl,
      projectName: config.projectName,
      fetch: fetchImpl,
    })
  }

  return cachedLogger
}

function buildRuntimeTraceRootSpanId(traceId: string) {
  return normalizeTraceIdentifier(`span.trace-root.${traceId}`)
}

function normalizeTraceIdentifier(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/-+/g, '-')
}

function toEpochSeconds(value: string) {
  return new Date(value).getTime() / 1000
}

function normalizeNonEmptyString(input: string | undefined) {
  const value = input?.trim()
  return value ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function pickNumericMetadataValue(metadata: RuntimeTraceSpan['metadata'], key: string) {
  const value = metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function buildBraintrustMetrics(span: RuntimeTraceSpan) {
  return Object.fromEntries(
    Object.entries({
      latencyMs: span.latencyMs,
      recordedAtMs: new Date(span.recordedAt).getTime(),
      firstTokenLatencyMs: span.model?.firstTokenLatencyMs,
      tokenCountInput: span.model?.tokenCountInput,
      tokenCountOutput: span.model?.tokenCountOutput,
      totalTokens: span.model?.totalTokens,
      reasoningTokens: span.model?.reasoningTokens,
      cachedInputTokens: span.model?.cachedInputTokens,
      cacheWriteTokens: span.model?.cacheWriteTokens,
      textOutputTokens: span.model?.textOutputTokens,
      costUsd: span.model?.costUsd,
      retryCount: pickNumericMetadataValue(span.metadata, 'retryCount'),
      stepCount: pickNumericMetadataValue(span.metadata, 'stepCount'),
      toolCallCount: pickNumericMetadataValue(span.metadata, 'toolCallCount'),
      toolEventCount: pickNumericMetadataValue(span.metadata, 'toolEventCount'),
      toolResultCount: pickNumericMetadataValue(span.metadata, 'toolResultCount'),
      toolErrorCount: pickNumericMetadataValue(span.metadata, 'toolErrorCount'),
      toolPendingCount: pickNumericMetadataValue(span.metadata, 'toolPendingCount'),
    }).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
  )
}

function buildBraintrustMetadata(span: RuntimeTraceSpan) {
  const retryCount = pickNumericMetadataValue(span.metadata, 'retryCount')
  const stepCount = pickNumericMetadataValue(span.metadata, 'stepCount')
  const toolCallCount = pickNumericMetadataValue(span.metadata, 'toolCallCount')
  const toolResultCount = pickNumericMetadataValue(span.metadata, 'toolResultCount')
  const toolErrorCount = pickNumericMetadataValue(span.metadata, 'toolErrorCount')
  const toolPendingCount = pickNumericMetadataValue(span.metadata, 'toolPendingCount')
  const finishReason =
    typeof span.metadata?.finishReason === 'string'
      ? span.metadata.finishReason
      : isRecord(span.output) && typeof span.output.finishReason === 'string'
        ? span.output.finishReason
        : null

  return {
    runtimeTraceVersion: span.version,
    runtimeTraceKind: span.kind,
    runtimeTraceStatus: span.status,
    recordedAt: span.recordedAt,
    conversationId: span.conversationId ?? null,
    sessionId: span.sessionId ?? null,
    appSessionId: span.appSessionId ?? null,
    approvedAppId: span.approvedAppId ?? null,
    runtimeAppId: span.runtimeAppId ?? null,
    actor: span.actor,
    state: span.state ?? null,
    agentReturn: span.agentReturn ?? null,
    model: span.model ?? null,
    modelProvider: span.model?.provider ?? null,
    modelId: span.model?.modelId ?? null,
    finishReason,
    retryCount: retryCount ?? null,
    stepCount: stepCount ?? null,
    toolCallCount: toolCallCount ?? null,
    toolResultCount: toolResultCount ?? null,
    toolErrorCount: toolErrorCount ?? null,
    toolPendingCount: toolPendingCount ?? null,
    metadata: span.metadata ?? null,
    error: span.error ?? null,
  }
}

function buildBraintrustSpanEvent(span: RuntimeTraceSpan) {
  const rowFields = buildBraintrustRowFields(span)

  return {
    input: rowFields.input,
    output: rowFields.output,
    expected: rowFields.expected,
    tags: rowFields.tags,
    error: span.error?.message,
    metadata: buildBraintrustMetadata(span),
    metrics: buildBraintrustMetrics(span),
  }
}

function buildBraintrustRowFields(span: RuntimeTraceSpan): {
  input: JsonValue | undefined
  output: JsonValue | undefined
  expected: JsonValue | undefined
  tags: string[] | undefined
} {
  return {
    input: span.input ?? buildFallbackInput(span),
    output: span.output ?? buildFallbackOutput(span),
    expected: span.expected ?? buildFallbackExpected(span),
    tags: span.tags?.length ? span.tags : buildFallbackTags(span),
  }
}

function buildFallbackInput(span: RuntimeTraceSpan): JsonValue | undefined {
  const summaryTarget = span.approvedAppId ?? span.runtimeAppId ?? span.appSessionId ?? span.conversationId

  switch (span.kind) {
    case 'trace-root':
      return summaryTarget ? `Initialize runtime trace for ${summaryTarget}` : 'Initialize runtime trace'
    case 'runtime-open':
      return summaryTarget ? `Open ${summaryTarget} in the sidebar runtime` : span.name
    case 'runtime-snapshot':
      return summaryTarget ? `Sync runtime snapshot for ${summaryTarget}` : span.name
    case 'runtime-command':
      return span.state?.requestedMove
        ? `Requested move: ${span.state.requestedMove}`
        : span.agentReturn?.toolName
          ? `Run ${span.agentReturn.toolName}`
          : span.name
    case 'state-selection':
      return 'Choose the freshest runtime state for the active conversation.'
    case 'agent-return':
      return typeof span.metadata?.userRequest === 'string' ? span.metadata.userRequest : span.name
    case 'coach-message':
      return span.name
    case 'app-event':
      return span.name
    default:
      return span.name
  }
}

function buildFallbackOutput(span: RuntimeTraceSpan): JsonValue | undefined {
  if (span.state?.summary) {
    return span.state.summary
  }

  if (span.error?.message) {
    return span.error.message
  }

  if (span.agentReturn?.kind === 'pass-through') {
    return 'No runtime action was taken.'
  }

  if (span.agentReturn?.toolName) {
    return `Returned ${span.agentReturn.kind} via ${span.agentReturn.toolName}.`
  }

  if (span.kind === 'trace-root') {
    return 'Runtime trace opened.'
  }

  return undefined
}

function buildFallbackExpected(span: RuntimeTraceSpan): JsonValue | undefined {
  if (span.state?.expectedFen && span.state?.requestedMove) {
    return `Expected FEN before ${span.state.requestedMove}: ${span.state.expectedFen}`
  }

  return undefined
}

function buildFallbackTags(span: RuntimeTraceSpan) {
  const tags = [
    span.kind,
    span.actor.layer,
    span.approvedAppId,
    span.runtimeAppId,
    span.agentReturn?.kind,
  ].filter((value): value is string => Boolean(value))

  return tags.length ? [...new Set(tags)].slice(0, 16) : undefined
}

function sortRuntimeTraceSpans(spans: RuntimeTraceSpan[]) {
  return [...spans].sort((left, right) => {
    if (left.kind === 'trace-root' && right.kind !== 'trace-root') {
      return -1
    }
    if (left.kind !== 'trace-root' && right.kind === 'trace-root') {
      return 1
    }
    if (left.traceId !== right.traceId) {
      return left.traceId.localeCompare(right.traceId)
    }
    if (left.parentSpanId === right.spanId) {
      return 1
    }
    if (right.parentSpanId === left.spanId) {
      return -1
    }
    return left.startedAt.localeCompare(right.startedAt) || left.spanId.localeCompare(right.spanId)
  })
}
