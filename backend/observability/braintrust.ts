import type { RuntimeTraceSpan } from '@shared/contracts/v1'
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

function buildBraintrustSpanEvent(span: RuntimeTraceSpan) {
  return {
    input: span.input,
    output: span.output,
    error: span.error?.message,
    metadata: {
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
      metadata: span.metadata ?? null,
      error: span.error ?? null,
    },
    metrics: {
      latencyMs: span.latencyMs,
      recordedAtMs: new Date(span.recordedAt).getTime(),
    },
  }
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
