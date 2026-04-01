import { z } from 'zod'
import { CompletionSignalSchema, exampleChessCompletionSignal } from '../completion-signal'
import { AppPermissionsSchema } from '../permissions'
import { IdentifierSchema, IsoDatetimeSchema, JsonObjectSchema, NonEmptyStringSchema, OriginSchema } from '../shared'
import { exampleChessLaunchToolSchema, ToolSchemaSchema } from '../tool-schema'
import { toValidationResult } from '../validation'

const EmbeddedAppMessageBaseSchema = z.object({
  version: z.literal('v1'),
  messageId: IdentifierSchema,
  correlationId: IdentifierSchema.optional(),
  conversationId: IdentifierSchema,
  appSessionId: IdentifierSchema,
  appId: IdentifierSchema,
  sequence: z.number().int().nonnegative(),
  sentAt: IsoDatetimeSchema,
  security: z.object({
    handshakeToken: NonEmptyStringSchema,
    expectedOrigin: OriginSchema,
  }),
})

export const RuntimeAppStatusSchema = z.enum([
  'pending',
  'active',
  'waiting-auth',
  'waiting-user',
  'completed',
  'failed',
])

export const HostBootstrapMessageSchema = EmbeddedAppMessageBaseSchema.extend({
  source: z.literal('host'),
  type: z.literal('host.bootstrap'),
  payload: z.object({
    launchReason: z.enum(['chat-tool', 'resume-session', 'manual-open']),
    authState: z.enum(['not-required', 'connected', 'required', 'expired']),
    grantedPermissions: AppPermissionsSchema,
    embedUrl: z.string().url(),
    initialState: JsonObjectSchema.optional(),
    availableTools: z.array(ToolSchemaSchema).default([]),
  }),
})

export const HostInvokeMessageSchema = EmbeddedAppMessageBaseSchema.extend({
  source: z.literal('host'),
  type: z.literal('host.invoke'),
  payload: z.object({
    toolCallId: IdentifierSchema,
    toolName: IdentifierSchema,
    arguments: JsonObjectSchema,
    timeoutMs: z.number().int().min(1_000).max(300_000).optional(),
  }),
})

export const AppStateUpdateMessageSchema = EmbeddedAppMessageBaseSchema.extend({
  source: z.literal('app'),
  type: z.literal('app.state'),
  payload: z.object({
    status: RuntimeAppStatusSchema,
    summary: NonEmptyStringSchema,
    state: JsonObjectSchema,
    progress: z
      .object({
        label: NonEmptyStringSchema.optional(),
        percent: z.number().min(0).max(100).optional(),
      })
      .optional(),
  }),
})

export const AppHeartbeatMessageSchema = EmbeddedAppMessageBaseSchema.extend({
  source: z.literal('app'),
  type: z.literal('app.heartbeat'),
  payload: z.object({
    status: z.enum(['alive', 'busy']),
    expiresAt: IsoDatetimeSchema.optional(),
  }),
})

export const AppCompletionMessageSchema = EmbeddedAppMessageBaseSchema.extend({
  source: z.literal('app'),
  type: z.literal('app.complete'),
  payload: CompletionSignalSchema,
})

export const AppErrorMessageSchema = EmbeddedAppMessageBaseSchema.extend({
  source: z.literal('app'),
  type: z.literal('app.error'),
  payload: z.object({
    code: IdentifierSchema,
    message: NonEmptyStringSchema,
    recoverable: z.boolean(),
    details: JsonObjectSchema.optional(),
  }),
})

export const EmbeddedAppMessageSchema = z.discriminatedUnion('type', [
  HostBootstrapMessageSchema,
  HostInvokeMessageSchema,
  AppStateUpdateMessageSchema,
  AppHeartbeatMessageSchema,
  AppCompletionMessageSchema,
  AppErrorMessageSchema,
])

export type EmbeddedAppMessage = z.infer<typeof EmbeddedAppMessageSchema>
export type RuntimeAppStatus = z.infer<typeof RuntimeAppStatusSchema>

export function parseEmbeddedAppMessage(input: unknown): EmbeddedAppMessage {
  return EmbeddedAppMessageSchema.parse(input)
}

export function validateEmbeddedAppMessage(input: unknown) {
  return toValidationResult(EmbeddedAppMessageSchema.safeParse(input))
}

const exampleRuntimeMessageBase = {
  version: 'v1' as const,
  messageId: 'msg.runtime.1',
  conversationId: 'conversation.1',
  appSessionId: 'app-session.chess.1',
  appId: 'chess.internal',
  sequence: 1,
  sentAt: '2026-03-31T15:00:00.000Z',
  security: {
    handshakeToken: 'nonce-123',
    expectedOrigin: 'https://apps.chatbridge.dev',
  },
}

export const exampleHostBootstrapMessage: EmbeddedAppMessage = HostBootstrapMessageSchema.parse({
  ...exampleRuntimeMessageBase,
  source: 'host',
  type: 'host.bootstrap',
  payload: {
    launchReason: 'chat-tool',
    authState: 'connected',
    grantedPermissions: ['session:write', 'tool:invoke'],
    embedUrl: 'https://apps.chatbridge.dev/chess',
    initialState: {
      boardState: 'startpos',
    },
    availableTools: [exampleChessLaunchToolSchema],
  },
})

export const exampleHostInvokeMessage: EmbeddedAppMessage = HostInvokeMessageSchema.parse({
  ...exampleRuntimeMessageBase,
  messageId: 'msg.runtime.2',
  sequence: 2,
  source: 'host',
  type: 'host.invoke',
  payload: {
    toolCallId: 'tool-call.chess.1',
    toolName: 'chess.launch-game',
    arguments: {
      mode: 'practice',
    },
    timeoutMs: 30_000,
  },
})

export const exampleAppStateUpdateMessage: EmbeddedAppMessage = AppStateUpdateMessageSchema.parse({
  ...exampleRuntimeMessageBase,
  messageId: 'msg.runtime.3',
  sequence: 3,
  source: 'app',
  type: 'app.state',
  payload: {
    status: 'active',
    summary: 'White is evaluating the next move from the current board state.',
    state: {
      boardState: 'r1bqkbnr/pppp1ppp/2n5/4p3/2BPP3/5N2/PPP2PPP/RNBQK2R b KQkq - 2 3',
    },
    progress: {
      label: 'Move 3',
      percent: 15,
    },
  },
})

export const exampleAppHeartbeatMessage: EmbeddedAppMessage = AppHeartbeatMessageSchema.parse({
  ...exampleRuntimeMessageBase,
  messageId: 'msg.runtime.4',
  sequence: 4,
  source: 'app',
  type: 'app.heartbeat',
  payload: {
    status: 'alive',
    expiresAt: '2026-03-31T15:00:30.000Z',
  },
})

export const exampleAppCompletionMessage: EmbeddedAppMessage = AppCompletionMessageSchema.parse({
  ...exampleRuntimeMessageBase,
  messageId: 'msg.runtime.5',
  appSessionId: exampleChessCompletionSignal.appSessionId,
  sequence: 5,
  source: 'app',
  type: 'app.complete',
  payload: exampleChessCompletionSignal,
})

export const exampleAppErrorMessage: EmbeddedAppMessage = AppErrorMessageSchema.parse({
  ...exampleRuntimeMessageBase,
  messageId: 'msg.runtime.6',
  sequence: 6,
  source: 'app',
  type: 'app.error',
  payload: {
    code: 'app.timeout',
    message: 'The embedded app did not respond before the timeout window expired.',
    recoverable: true,
    details: {
      timeoutMs: 30_000,
    },
  },
})

export const exampleEmbeddedAppMessages = [
  exampleHostBootstrapMessage,
  exampleHostInvokeMessage,
  exampleAppStateUpdateMessage,
  exampleAppHeartbeatMessage,
  exampleAppCompletionMessage,
  exampleAppErrorMessage,
]
