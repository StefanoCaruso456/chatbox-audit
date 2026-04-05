import { z } from 'zod'
import {
  ContractVersionSchema,
  IdentifierSchema,
  IsoDatetimeSchema,
  JsonObjectSchema,
  JsonValueSchema,
  NonEmptyStringSchema,
} from '../shared'
import { toValidationResult } from '../validation'

export const RuntimeTraceSpanKindSchema = z.enum([
  'trace-root',
  'runtime-open',
  'runtime-message',
  'runtime-snapshot',
  'runtime-command',
  'app-event',
  'state-selection',
  'agent-return',
  'coach-message',
  'model-call',
  'model-retry',
  'model-step',
  'tool-call',
])
export type RuntimeTraceSpanKind = z.infer<typeof RuntimeTraceSpanKindSchema>

export const RuntimeTraceSpanStatusSchema = z.enum([
  'active',
  'succeeded',
  'failed',
  'timed-out',
  'cancelled',
  'skipped',
])
export type RuntimeTraceSpanStatus = z.infer<typeof RuntimeTraceSpanStatusSchema>

export const RuntimeTraceActorLayerSchema = z.enum(['host', 'app', 'agent', 'model', 'store', 'user'])
export type RuntimeTraceActorLayer = z.infer<typeof RuntimeTraceActorLayerSchema>

export const RuntimeTraceActorSchema = z.object({
  layer: RuntimeTraceActorLayerSchema,
  source: IdentifierSchema,
})
export type RuntimeTraceActor = z.infer<typeof RuntimeTraceActorSchema>

export const RuntimeTraceStateSnapshotSchema = z.object({
  source: IdentifierSchema,
  status: NonEmptyStringSchema.optional(),
  summary: z.string().optional(),
  stateDigest: JsonObjectSchema.optional(),
  fen: z.string().optional(),
  moveCount: z.number().int().nonnegative().optional(),
  lastMove: z.string().optional(),
  requestedMove: z.string().optional(),
  selectedMove: z.string().optional(),
  expectedFen: z.string().optional(),
})
export type RuntimeTraceStateSnapshot = z.infer<typeof RuntimeTraceStateSnapshotSchema>

export const RuntimeTraceAgentReturnKindSchema = z.enum(['invoke-tool', 'clarify', 'pass-through'])
export type RuntimeTraceAgentReturnKind = z.infer<typeof RuntimeTraceAgentReturnKindSchema>

export const RuntimeTraceAgentReturnSchema = z.object({
  kind: RuntimeTraceAgentReturnKindSchema,
  toolName: IdentifierSchema.optional(),
  toolCallId: IdentifierSchema.optional(),
  messageId: IdentifierSchema.optional(),
})
export type RuntimeTraceAgentReturn = z.infer<typeof RuntimeTraceAgentReturnSchema>

export const RuntimeTraceModelUsageSchema = z.object({
  provider: NonEmptyStringSchema.optional(),
  modelId: NonEmptyStringSchema.optional(),
  tokenCountInput: z.number().int().nonnegative().optional(),
  tokenCountOutput: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
  textOutputTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  latencyMs: z.number().nonnegative().optional(),
  firstTokenLatencyMs: z.number().nonnegative().optional(),
})
export type RuntimeTraceModelUsage = z.infer<typeof RuntimeTraceModelUsageSchema>

export const RuntimeTraceErrorSchema = z.object({
  code: IdentifierSchema.optional(),
  message: NonEmptyStringSchema,
  recoverable: z.boolean().optional(),
  details: JsonObjectSchema.optional(),
})
export type RuntimeTraceError = z.infer<typeof RuntimeTraceErrorSchema>

export const RuntimeTraceSpanSchema = z
  .object({
    version: ContractVersionSchema,
    traceId: IdentifierSchema,
    spanId: IdentifierSchema,
    parentSpanId: IdentifierSchema.optional(),
    name: NonEmptyStringSchema,
    kind: RuntimeTraceSpanKindSchema,
    status: RuntimeTraceSpanStatusSchema,
    recordedAt: IsoDatetimeSchema,
    startedAt: IsoDatetimeSchema,
    endedAt: IsoDatetimeSchema,
    latencyMs: z.number().nonnegative(),
    conversationId: IdentifierSchema.optional(),
    sessionId: IdentifierSchema.optional(),
    appSessionId: IdentifierSchema.optional(),
    approvedAppId: IdentifierSchema.optional(),
    runtimeAppId: IdentifierSchema.optional(),
    actor: RuntimeTraceActorSchema,
    state: RuntimeTraceStateSnapshotSchema.optional(),
    agentReturn: RuntimeTraceAgentReturnSchema.optional(),
    model: RuntimeTraceModelUsageSchema.optional(),
    input: JsonValueSchema.optional(),
    output: JsonValueSchema.optional(),
    expected: JsonValueSchema.optional(),
    tags: z.array(NonEmptyStringSchema).max(16).optional(),
    metadata: JsonObjectSchema.optional(),
    error: RuntimeTraceErrorSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const startedAtMs = new Date(value.startedAt).getTime()
    const endedAtMs = new Date(value.endedAt).getTime()
    const latencyMs = endedAtMs - startedAtMs

    if (endedAtMs < startedAtMs) {
      ctx.addIssue({
        code: 'custom',
        message: 'endedAt must be after startedAt',
        path: ['endedAt'],
      })
    }

    if (value.latencyMs !== latencyMs) {
      ctx.addIssue({
        code: 'custom',
        message: 'latencyMs must equal endedAt - startedAt',
        path: ['latencyMs'],
      })
    }

    if (value.kind === 'trace-root' && value.parentSpanId) {
      ctx.addIssue({
        code: 'custom',
        message: 'trace-root spans cannot have a parentSpanId',
        path: ['parentSpanId'],
      })
    }
  })
export type RuntimeTraceSpan = z.infer<typeof RuntimeTraceSpanSchema>

export const RuntimeTraceTreeSchema = z
  .object({
    version: ContractVersionSchema,
    traceId: IdentifierSchema,
    rootSpanId: IdentifierSchema,
    conversationId: IdentifierSchema.optional(),
    sessionId: IdentifierSchema.optional(),
    appSessionId: IdentifierSchema.optional(),
    spans: z.array(RuntimeTraceSpanSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const rootSpans = value.spans.filter((span) => span.kind === 'trace-root')

    if (rootSpans.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'trace trees must contain exactly one trace-root span',
        path: ['spans'],
      })
    }

    if (!value.spans.some((span) => span.spanId === value.rootSpanId && span.kind === 'trace-root')) {
      ctx.addIssue({
        code: 'custom',
        message: 'rootSpanId must point to the trace-root span',
        path: ['rootSpanId'],
      })
    }

    for (const span of value.spans) {
      if (span.traceId !== value.traceId) {
        ctx.addIssue({
          code: 'custom',
          message: 'every span in the tree must share the tree traceId',
          path: ['spans'],
        })
        break
      }
    }
  })
export type RuntimeTraceTree = z.infer<typeof RuntimeTraceTreeSchema>

export function parseRuntimeTraceSpan(input: unknown): RuntimeTraceSpan {
  return RuntimeTraceSpanSchema.parse(input)
}

export function validateRuntimeTraceSpan(input: unknown) {
  return toValidationResult(RuntimeTraceSpanSchema.safeParse(input))
}

export function parseRuntimeTraceTree(input: unknown): RuntimeTraceTree {
  return RuntimeTraceTreeSchema.parse(input)
}

export function validateRuntimeTraceTree(input: unknown) {
  return toValidationResult(RuntimeTraceTreeSchema.safeParse(input))
}

export const exampleRuntimeTraceSpans: RuntimeTraceSpan[] = [
  RuntimeTraceSpanSchema.parse({
    version: 'v1',
    traceId: 'trace.conversation.1.app-session.chess.1',
    spanId: 'span.trace-root.conversation.1',
    name: 'Chess Tutor runtime trace',
    kind: 'trace-root',
    status: 'active',
    recordedAt: '2026-04-05T05:10:00.000Z',
    startedAt: '2026-04-05T05:10:00.000Z',
    endedAt: '2026-04-05T05:10:00.000Z',
    latencyMs: 0,
    conversationId: 'conversation.1',
    sessionId: 'session.1',
    appSessionId: 'app-session.chess.1',
    approvedAppId: 'chess-tutor',
    runtimeAppId: 'chess.internal',
    actor: {
      layer: 'host',
      source: 'runtime-trace-store',
    },
    input: 'Initialize chess tutor runtime trace',
    output: 'Runtime trace opened for chess tutor sidebar session.',
    tags: ['trace-root', 'host', 'chess-tutor', 'chess.internal'],
    metadata: {
      purpose: 'braintrust-debugging',
    },
  }),
  RuntimeTraceSpanSchema.parse({
    version: 'v1',
    traceId: 'trace.conversation.1.app-session.chess.1',
    spanId: 'span.runtime-snapshot.1',
    parentSpanId: 'span.trace-root.conversation.1',
    name: 'sync chess runtime snapshot from app.state',
    kind: 'runtime-snapshot',
    status: 'succeeded',
    recordedAt: '2026-04-05T05:10:02.000Z',
    startedAt: '2026-04-05T05:10:02.000Z',
    endedAt: '2026-04-05T05:10:02.018Z',
    latencyMs: 18,
    conversationId: 'conversation.1',
    sessionId: 'session.1',
    appSessionId: 'app-session.chess.1',
    approvedAppId: 'chess-tutor',
    runtimeAppId: 'chess.internal',
    actor: {
      layer: 'host',
      source: 'app-iframe-panel',
    },
    input: 'Sync latest chess runtime snapshot from app.state',
    output: 'Played c6. White to move.',
    tags: ['runtime-snapshot', 'host', 'chess-tutor', 'chess.internal'],
    state: {
      source: 'runtime.message.app.state',
      status: 'active',
      summary: 'Played c6. White to move.',
      fen: 'rnbqkbnr/pp1ppppp/2p5/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
      moveCount: 2,
      lastMove: 'c6',
      stateDigest: {
        turn: 'w',
        lastUpdateSource: 'manual-board-move',
      },
    },
    metadata: {
      availableToolNames: 'chess.launch-game,chess.get-board-state,chess.make-move',
    },
  }),
  RuntimeTraceSpanSchema.parse({
    version: 'v1',
    traceId: 'trace.conversation.1.app-session.chess.1',
    spanId: 'span.state-selection.1',
    parentSpanId: 'span.trace-root.conversation.1',
    name: 'choose freshest chess board state',
    kind: 'state-selection',
    status: 'succeeded',
    recordedAt: '2026-04-05T05:10:04.000Z',
    startedAt: '2026-04-05T05:10:04.000Z',
    endedAt: '2026-04-05T05:10:04.004Z',
    latencyMs: 4,
    conversationId: 'conversation.1',
    sessionId: 'session.1',
    appSessionId: 'app-session.chess.1',
    approvedAppId: 'chess-tutor',
    runtimeAppId: 'chess.internal',
    actor: {
      layer: 'agent',
      source: 'tutormeai-orchestrator',
    },
    state: {
      source: 'sidebar-runtime-snapshot',
      fen: 'rnbqkbnr/pp1ppppp/2p5/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
      moveCount: 2,
      lastMove: 'c6',
      requestedMove: 'd5',
      expectedFen: 'rnbqkbnr/pp1ppppp/2p5/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
    },
    agentReturn: {
      kind: 'invoke-tool',
      toolName: 'chess.make-move',
      toolCallId: 'tool-call.chess.make-move.1',
    },
    metadata: {
      fallbackSource: 'shared-chess-session',
      reason: 'sidebar move count newer than shared state',
    },
  }),
  RuntimeTraceSpanSchema.parse({
    version: 'v1',
    traceId: 'trace.conversation.1.app-session.chess.1',
    spanId: 'span.model-call.1',
    parentSpanId: 'span.trace-root.conversation.1',
    name: 'generate chess coaching response',
    kind: 'model-call',
    status: 'succeeded',
    recordedAt: '2026-04-05T05:10:05.000Z',
    startedAt: '2026-04-05T05:10:05.000Z',
    endedAt: '2026-04-05T05:10:06.240Z',
    latencyMs: 1240,
    conversationId: 'conversation.1',
    sessionId: 'session.1',
    appSessionId: 'app-session.chess.1',
    approvedAppId: 'chess-tutor',
    runtimeAppId: 'chess.internal',
    actor: {
      layer: 'model',
      source: 'session-generation',
    },
    input: {
      userRequest: 'why did black play c6',
      promptMessageCount: 6,
      webBrowsingEnabled: false,
    },
    output: {
      textPreview: 'Black played c6 to reinforce d5 and prepare ...',
      finishReason: 'stop',
      toolCallCount: 1,
      toolResultCount: 1,
    },
    tags: ['model-call', 'model', 'chess-tutor', 'chess.internal', 'openai', 'succeeded'],
    model: {
      provider: 'openai',
      modelId: 'gpt-5.1',
      tokenCountInput: 812,
      tokenCountOutput: 164,
      totalTokens: 976,
      reasoningTokens: 62,
      cachedInputTokens: 320,
      textOutputTokens: 102,
      latencyMs: 1240,
      firstTokenLatencyMs: 380,
    },
    metadata: {
      finishReason: 'stop',
      retryCount: 1,
      stepCount: 2,
      toolCallCount: 1,
      toolResultCount: 1,
      toolErrorCount: 0,
      retries: [
        {
          attempt: 2,
          maxAttempts: 3,
          error: 'upstream 502',
        },
      ],
    },
  }),
]

export const exampleRuntimeTraceTree: RuntimeTraceTree = RuntimeTraceTreeSchema.parse({
  version: 'v1',
  traceId: 'trace.conversation.1.app-session.chess.1',
  rootSpanId: 'span.trace-root.conversation.1',
  conversationId: 'conversation.1',
  sessionId: 'session.1',
  appSessionId: 'app-session.chess.1',
  spans: exampleRuntimeTraceSpans,
})
