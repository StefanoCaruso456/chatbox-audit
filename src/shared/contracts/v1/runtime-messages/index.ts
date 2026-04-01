import { z } from 'zod'
import { CompletionSignalSchema } from '../completion-signal'
import { AppPermissionsSchema } from '../permissions'
import { IdentifierSchema, IsoDatetimeSchema, JsonObjectSchema, NonEmptyStringSchema, OriginSchema } from '../shared'
import { ToolSchemaSchema } from '../tool-schema'
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
