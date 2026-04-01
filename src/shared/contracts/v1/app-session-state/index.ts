import { z } from 'zod'
import { CompletionSignalSchema } from '../completion-signal'
import {
  ContractVersionSchema,
  IdentifierSchema,
  IsoDatetimeSchema,
  JsonObjectSchema,
  NonEmptyStringSchema,
} from '../shared'
import { toValidationResult } from '../validation'

export const AppSessionStatusSchema = z.enum([
  'pending',
  'active',
  'paused',
  'waiting-auth',
  'waiting-user',
  'completed',
  'failed',
  'expired',
  'cancelled',
])
export type AppSessionStatus = z.infer<typeof AppSessionStatusSchema>

export const AppSessionAuthStateSchema = z.enum(['not-required', 'connected', 'required', 'expired'])
export type AppSessionAuthState = z.infer<typeof AppSessionAuthStateSchema>

export const AppSessionLaunchReasonSchema = z.enum(['chat-tool', 'resume-session', 'manual-open'])
export type AppSessionLaunchReason = z.infer<typeof AppSessionLaunchReasonSchema>

export const AppSessionProgressSchema = z.object({
  label: NonEmptyStringSchema.optional(),
  percent: z.number().min(0).max(100).optional(),
})
export type AppSessionProgress = z.infer<typeof AppSessionProgressSchema>

export const AppSessionFailureSchema = z.object({
  code: IdentifierSchema,
  message: NonEmptyStringSchema,
  recoverable: z.boolean(),
  occurredAt: IsoDatetimeSchema,
  details: JsonObjectSchema.optional(),
})
export type AppSessionFailure = z.infer<typeof AppSessionFailureSchema>

export const AppSessionSnapshotSchema = z.object({
  sequence: z.number().int().nonnegative(),
  capturedAt: IsoDatetimeSchema,
  status: AppSessionStatusSchema,
  summary: NonEmptyStringSchema,
  stateDigest: JsonObjectSchema.optional(),
  progress: AppSessionProgressSchema.optional(),
})
export type AppSessionSnapshot = z.infer<typeof AppSessionSnapshotSchema>

const ActiveStatuses = new Set<AppSessionStatus>(['pending', 'active', 'waiting-auth', 'waiting-user'])

export const AppSessionStateSchema = z
  .object({
    version: ContractVersionSchema,
    appSessionId: IdentifierSchema,
    conversationId: IdentifierSchema,
    appId: IdentifierSchema,
    status: AppSessionStatusSchema,
    authState: AppSessionAuthStateSchema,
    launchReason: AppSessionLaunchReasonSchema,
    currentToolCallId: IdentifierSchema.optional(),
    createdAt: IsoDatetimeSchema,
    updatedAt: IsoDatetimeSchema,
    startedAt: IsoDatetimeSchema.optional(),
    lastActiveAt: IsoDatetimeSchema.optional(),
    completedAt: IsoDatetimeSchema.optional(),
    expiresAt: IsoDatetimeSchema.optional(),
    resumableUntil: IsoDatetimeSchema.optional(),
    latestSequence: z.number().int().nonnegative(),
    latestSnapshot: AppSessionSnapshotSchema.optional(),
    completion: CompletionSignalSchema.optional(),
    lastError: AppSessionFailureSchema.optional(),
    isActive: z.boolean(),
    metadata: JsonObjectSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const createdAt = new Date(value.createdAt).getTime()
    const updatedAt = new Date(value.updatedAt).getTime()

    if (updatedAt < createdAt) {
      ctx.addIssue({
        code: 'custom',
        message: 'updatedAt must be after createdAt',
        path: ['updatedAt'],
      })
    }

    if (value.startedAt && updatedAt < new Date(value.startedAt).getTime()) {
      ctx.addIssue({
        code: 'custom',
        message: 'updatedAt must be after startedAt',
        path: ['updatedAt'],
      })
    }

    if (
      value.completedAt &&
      value.startedAt &&
      new Date(value.completedAt).getTime() < new Date(value.startedAt).getTime()
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'completedAt must be after startedAt',
        path: ['completedAt'],
      })
    }

    if (value.latestSnapshot && value.latestSnapshot.sequence > value.latestSequence) {
      ctx.addIssue({
        code: 'custom',
        message: 'latestSnapshot.sequence cannot exceed latestSequence',
        path: ['latestSnapshot', 'sequence'],
      })
    }

    const expectedIsActive = ActiveStatuses.has(value.status)
    if (value.isActive !== expectedIsActive) {
      ctx.addIssue({
        code: 'custom',
        message: `isActive must be ${expectedIsActive} when status is ${value.status}`,
        path: ['isActive'],
      })
    }

    if (value.status === 'completed') {
      if (!value.completion) {
        ctx.addIssue({
          code: 'custom',
          message: 'completed sessions must include a completion payload',
          path: ['completion'],
        })
      }

      if (!value.completedAt) {
        ctx.addIssue({
          code: 'custom',
          message: 'completed sessions must include completedAt',
          path: ['completedAt'],
        })
      }
    }

    if (value.completion) {
      if (value.completion.appSessionId !== value.appSessionId) {
        ctx.addIssue({
          code: 'custom',
          message: 'completion.appSessionId must match appSessionId',
          path: ['completion', 'appSessionId'],
        })
      }

      if (value.completion.conversationId !== value.conversationId) {
        ctx.addIssue({
          code: 'custom',
          message: 'completion.conversationId must match conversationId',
          path: ['completion', 'conversationId'],
        })
      }

      if (value.completion.appId !== value.appId) {
        ctx.addIssue({
          code: 'custom',
          message: 'completion.appId must match appId',
          path: ['completion', 'appId'],
        })
      }
    }
  })

export type AppSessionState = z.infer<typeof AppSessionStateSchema>

export function parseAppSessionState(input: unknown): AppSessionState {
  return AppSessionStateSchema.parse(input)
}

export function validateAppSessionState(input: unknown) {
  return toValidationResult(AppSessionStateSchema.safeParse(input))
}

export const exampleActiveChessSessionState: AppSessionState = AppSessionStateSchema.parse({
  version: 'v1',
  appSessionId: 'app-session.chess.1',
  conversationId: 'conversation.1',
  appId: 'chess.internal',
  status: 'active',
  authState: 'connected',
  launchReason: 'chat-tool',
  currentToolCallId: 'tool-call.chess.1',
  createdAt: '2026-03-31T15:00:00.000Z',
  updatedAt: '2026-03-31T15:02:00.000Z',
  startedAt: '2026-03-31T15:00:05.000Z',
  lastActiveAt: '2026-03-31T15:02:00.000Z',
  resumableUntil: '2026-04-01T15:00:00.000Z',
  latestSequence: 4,
  latestSnapshot: {
    sequence: 4,
    capturedAt: '2026-03-31T15:02:00.000Z',
    status: 'active',
    summary: 'White is evaluating the next move from the current board state.',
    stateDigest: {
      boardState: 'r1bqkbnr/pppp1ppp/2n5/4p3/2BPP3/5N2/PPP2PPP/RNBQK2R b KQkq - 2 3',
      moveNumber: 3,
    },
    progress: {
      label: 'Move 3',
      percent: 15,
    },
  },
  isActive: true,
  metadata: {
    theme: 'lesson-analysis',
  },
})

export const exampleCompletedChessSessionState: AppSessionState = AppSessionStateSchema.parse({
  version: 'v1',
  appSessionId: 'app-session.chess.2',
  conversationId: 'conversation.1',
  appId: 'chess.internal',
  status: 'completed',
  authState: 'connected',
  launchReason: 'chat-tool',
  createdAt: '2026-03-31T16:00:00.000Z',
  updatedAt: '2026-03-31T16:08:00.000Z',
  startedAt: '2026-03-31T16:00:10.000Z',
  lastActiveAt: '2026-03-31T16:07:00.000Z',
  completedAt: '2026-03-31T16:08:00.000Z',
  latestSequence: 9,
  latestSnapshot: {
    sequence: 9,
    capturedAt: '2026-03-31T16:07:30.000Z',
    status: 'completed',
    summary: 'The lesson game finished in checkmate.',
    stateDigest: {
      winner: 'white',
      moveCount: 22,
    },
  },
  completion: {
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
      },
    },
  },
  isActive: false,
})

export const exampleAppSessionStates = [exampleActiveChessSessionState, exampleCompletedChessSessionState]
