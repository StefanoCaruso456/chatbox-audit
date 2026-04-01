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

export const exampleChessCompletionSignal: CompletionSignal = CompletionSignalSchema.parse({
  version: 'v1',
  conversationId: 'conversation.1',
  appSessionId: 'app-session.chess.2',
  appId: 'chess.internal',
  toolCallId: 'tool-call.chess.2',
  status: 'succeeded',
  resultSummary: 'White checkmated black on move 22.',
  result: {
    winner: 'white',
    ending: 'checkmate',
  },
  startedAt: '2026-03-31T16:00:10.000Z',
  completedAt: '2026-03-31T16:08:00.000Z',
  followUpContext: {
    summary: 'Use this game to explain the final mating net and missed defensive resources.',
    recommendedPrompts: ['Explain why black could not escape the mating net.'],
    stateDigest: {
      moveCount: 22,
      opening: 'Italian Game',
    },
  },
})

export const exampleWeatherCompletionSignal: CompletionSignal = CompletionSignalSchema.parse({
  version: 'v1',
  conversationId: 'conversation.2',
  appSessionId: 'app-session.weather.1',
  appId: 'weather.public',
  toolCallId: 'tool-call.weather.1',
  status: 'succeeded',
  resultSummary: 'The forecast for Chicago is mild with light winds.',
  result: {
    summary: '58F and partly cloudy',
    location: 'Chicago, IL',
  },
  completedAt: '2026-03-31T18:05:00.000Z',
  followUpContext: {
    summary: 'Use the forecast to answer classroom planning or clothing questions.',
    recommendedPrompts: ['Should students bring jackets tomorrow?'],
    stateDigest: {
      temperatureF: 58,
    },
  },
})

export const examplePlannerCompletionSignal: CompletionSignal = CompletionSignalSchema.parse({
  version: 'v1',
  conversationId: 'conversation.3',
  appSessionId: 'app-session.planner.1',
  appId: 'planner.oauth',
  toolCallId: 'tool-call.planner.1',
  status: 'succeeded',
  resultSummary: 'Planner dashboard opened with overdue assignments highlighted.',
  result: {
    focus: 'overdue',
    requiresAuth: false,
  },
  startedAt: '2026-03-31T19:00:00.000Z',
  completedAt: '2026-03-31T19:00:08.000Z',
  followUpContext: {
    summary: 'Follow up by asking the student which overdue task they want to tackle first.',
    recommendedPrompts: ['Which overdue assignment should we work on first?'],
    stateDigest: {
      focus: 'overdue',
    },
  },
})

export const exampleCompletionSignals = [
  exampleChessCompletionSignal,
  exampleWeatherCompletionSignal,
  examplePlannerCompletionSignal,
]
