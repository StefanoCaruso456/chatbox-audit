import { z } from 'zod'
import {
  ContractVersionSchema,
  IdentifierSchema,
  IsoDatetimeSchema,
  JsonObjectSchema,
  NonEmptyStringSchema,
} from '../shared'
import { toValidationResult } from '../validation'

export const CompletionStatusSchema = z.enum(['succeeded', 'cancelled', 'failed', 'timed-out'])
export type CompletionStatus = z.infer<typeof CompletionStatusSchema>

export const FollowUpContextSchema = z.object({
  summary: NonEmptyStringSchema,
  userVisibleSummary: z.string().optional(),
  recommendedPrompts: z.array(NonEmptyStringSchema).max(5).optional(),
  stateDigest: JsonObjectSchema.optional(),
})

export type FollowUpContext = z.infer<typeof FollowUpContextSchema>

export const CompletionSignalSchema = z
  .object({
    version: ContractVersionSchema,
    conversationId: IdentifierSchema,
    appSessionId: IdentifierSchema,
    appId: IdentifierSchema,
    toolCallId: IdentifierSchema.optional(),
    status: CompletionStatusSchema,
    resultSummary: NonEmptyStringSchema,
    result: JsonObjectSchema.optional(),
    startedAt: IsoDatetimeSchema.optional(),
    completedAt: IsoDatetimeSchema,
    followUpContext: FollowUpContextSchema,
  })
  .superRefine((value, ctx) => {
    if (value.startedAt && new Date(value.completedAt).getTime() < new Date(value.startedAt).getTime()) {
      ctx.addIssue({
        code: 'custom',
        message: 'completedAt must be after startedAt',
        path: ['completedAt'],
      })
    }
  })

export type CompletionSignal = z.infer<typeof CompletionSignalSchema>

export function parseCompletionSignal(input: unknown): CompletionSignal {
  return CompletionSignalSchema.parse(input)
}

export function validateCompletionSignal(input: unknown) {
  return toValidationResult(CompletionSignalSchema.safeParse(input))
}
