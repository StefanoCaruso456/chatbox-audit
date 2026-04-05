import {
  type RuntimeTraceSpan,
  type RuntimeTraceSpanKind,
  RuntimeTraceSpanSchema,
  type RuntimeTraceTree,
  RuntimeTraceTreeSchema,
} from '@shared/contracts/v1'
import { v4 as uuidv4 } from 'uuid'
import { createStore, useStore } from 'zustand'

type RecordRuntimeTraceSpanInput = Omit<
  RuntimeTraceSpan,
  'version' | 'spanId' | 'recordedAt' | 'startedAt' | 'endedAt' | 'latencyMs'
> & {
  spanId?: string
  recordedAt?: string
  startedAt?: string
  endedAt?: string
}

type RuntimeTraceState = {
  spans: RuntimeTraceSpan[]
  exportedSpanIds: string[]
  recordSpan: (input: RecordRuntimeTraceSpanInput) => RuntimeTraceSpan
  markSpansExported: (spanIds: string[]) => void
  reset: () => void
}

const MAX_TRACE_SPANS = 800

function buildRuntimeTraceTags(input: {
  kind: RuntimeTraceSpanKind
  actorLayer?: RuntimeTraceSpan['actor']['layer']
  approvedAppId?: string
  runtimeAppId?: string
}) {
  return [input.kind, input.actorLayer, input.approvedAppId, input.runtimeAppId].filter((value): value is string =>
    Boolean(value)
  )
}

function normalizeTraceIdentifier(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/-+/g, '-')
}

function buildSpanId(kind: RuntimeTraceSpanKind) {
  return normalizeTraceIdentifier(`span.${kind}.${uuidv4()}`)
}

export function buildRuntimeTraceId(input: {
  conversationId: string
  appSessionId?: string | null
  runtimeAppId?: string | null
}) {
  return normalizeTraceIdentifier(`trace.${input.conversationId}.${input.appSessionId ?? input.runtimeAppId ?? 'host'}`)
}

export function buildRuntimeTraceRootSpanId(traceId: string) {
  return normalizeTraceIdentifier(`span.trace-root.${traceId}`)
}

function createRootTraceSpan(input: {
  traceId: string
  conversationId?: string
  sessionId?: string
  appSessionId?: string
  approvedAppId?: string
  runtimeAppId?: string
}): RuntimeTraceSpan {
  const now = new Date().toISOString()
  return RuntimeTraceSpanSchema.parse({
    version: 'v1',
    traceId: input.traceId,
    spanId: buildRuntimeTraceRootSpanId(input.traceId),
    name: 'Runtime trace root',
    kind: 'trace-root',
    status: 'active',
    recordedAt: now,
    startedAt: now,
    endedAt: now,
    latencyMs: 0,
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    appSessionId: input.appSessionId,
    approvedAppId: input.approvedAppId,
    runtimeAppId: input.runtimeAppId,
    actor: {
      layer: 'store',
      source: 'runtime-trace-store',
    },
    input: input.approvedAppId ? `Initialize runtime trace for ${input.approvedAppId}` : 'Initialize runtime trace',
    output: input.appSessionId ? `Runtime trace opened for ${input.appSessionId}.` : 'Runtime trace opened.',
    tags: buildRuntimeTraceTags({
      kind: 'trace-root',
      actorLayer: 'store',
      approvedAppId: input.approvedAppId,
      runtimeAppId: input.runtimeAppId,
    }),
    metadata: {
      autoCreated: true,
    },
  })
}

export const runtimeTraceStore = createStore<RuntimeTraceState>()((set) => ({
  spans: [],
  exportedSpanIds: [],
  recordSpan: (input) => {
    const startedAt = input.startedAt ?? new Date().toISOString()
    const endedAt = input.endedAt ?? startedAt
    const recordedAt = input.recordedAt ?? endedAt
    const latencyMs = new Date(endedAt).getTime() - new Date(startedAt).getTime()
    const nextSpan = RuntimeTraceSpanSchema.parse({
      version: 'v1',
      ...input,
      spanId: input.spanId ?? buildSpanId(input.kind),
      recordedAt,
      startedAt,
      endedAt,
      latencyMs,
    })

    set((state) => {
      const hasRoot = state.spans.some((span) => span.traceId === nextSpan.traceId && span.kind === 'trace-root')
      const rootSpan = hasRoot
        ? []
        : [
            createRootTraceSpan({
              traceId: nextSpan.traceId,
              conversationId: nextSpan.conversationId,
              sessionId: nextSpan.sessionId,
              appSessionId: nextSpan.appSessionId,
              approvedAppId: nextSpan.approvedAppId,
              runtimeAppId: nextSpan.runtimeAppId,
            }),
          ]

      const nextSpans = [...state.spans, ...rootSpan, nextSpan].slice(-MAX_TRACE_SPANS)
      return {
        spans: nextSpans,
        exportedSpanIds: state.exportedSpanIds.filter((spanId) => nextSpans.some((span) => span.spanId === spanId)),
      }
    })

    return nextSpan
  },
  markSpansExported: (spanIds) => {
    if (!spanIds.length) {
      return
    }

    set((state) => {
      const knownSpanIds = new Set(state.spans.map((span) => span.spanId))
      const nextExportedIds = new Set(state.exportedSpanIds)
      for (const spanId of spanIds) {
        if (knownSpanIds.has(spanId)) {
          nextExportedIds.add(spanId)
        }
      }

      return {
        exportedSpanIds: [...nextExportedIds],
      }
    })
  },
  reset: () => {
    set({ spans: [], exportedSpanIds: [] })
  },
}))

export function recordRuntimeTraceSpan(input: RecordRuntimeTraceSpanInput) {
  return runtimeTraceStore.getState().recordSpan(input)
}

export function resetRuntimeTraceStore() {
  runtimeTraceStore.getState().reset()
}

export function getRuntimeTraceSpans() {
  return runtimeTraceStore.getState().spans
}

export function markRuntimeTraceSpansExported(spanIds: string[]) {
  runtimeTraceStore.getState().markSpansExported(spanIds)
}

export function getPendingRuntimeTraceSpans() {
  const state = runtimeTraceStore.getState()
  const exportedSpanIds = new Set(state.exportedSpanIds)
  return state.spans.filter((span) => !exportedSpanIds.has(span.spanId))
}

export function getRuntimeTraceTree(traceId: string): RuntimeTraceTree | null {
  const spans = runtimeTraceStore.getState().spans.filter((span) => span.traceId === traceId)
  if (!spans.length) {
    return null
  }

  const rootSpan = spans.find((span) => span.kind === 'trace-root')
  if (!rootSpan) {
    return null
  }

  return RuntimeTraceTreeSchema.parse({
    version: 'v1',
    traceId,
    rootSpanId: rootSpan.spanId,
    conversationId: rootSpan.conversationId,
    sessionId: rootSpan.sessionId,
    appSessionId: rootSpan.appSessionId,
    spans,
  })
}

export function useRuntimeTraceStore<U>(selector: (state: RuntimeTraceState) => U) {
  return useStore(runtimeTraceStore, selector)
}
