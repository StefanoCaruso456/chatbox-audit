import { z } from 'zod'
import { AppSessionAuthStateSchema, type AppSessionStateSchema, AppSessionStatusSchema } from '../app-session-state'
import { type CompletionSignalSchema, CompletionStatusSchema, FollowUpContextSchema } from '../completion-signal'
import {
  ContractVersionSchema,
  IdentifierSchema,
  IsoDatetimeSchema,
  JsonObjectSchema,
  NonEmptyStringSchema,
} from '../shared'
import { toValidationResult } from '../validation'

export const AppSessionContextSummarySchema = z.object({
  appSessionId: IdentifierSchema,
  appId: IdentifierSchema,
  status: AppSessionStatusSchema,
  summary: NonEmptyStringSchema,
  updatedAt: IsoDatetimeSchema,
  latestSequence: z.number().int().nonnegative(),
  latestStateDigest: JsonObjectSchema.optional(),
})
export type AppSessionContextSummary = z.infer<typeof AppSessionContextSummarySchema>

export const ActiveAppContextSchema = AppSessionContextSummarySchema.extend({
  authState: AppSessionAuthStateSchema,
  currentToolCallId: IdentifierSchema.optional(),
  resumableUntil: IsoDatetimeSchema.optional(),
  availableToolNames: z.array(IdentifierSchema).optional(),
})
export type ActiveAppContext = z.infer<typeof ActiveAppContextSchema>

export const CompletionContextSummarySchema = z.object({
  appSessionId: IdentifierSchema,
  appId: IdentifierSchema,
  status: CompletionStatusSchema,
  resultSummary: NonEmptyStringSchema,
  completedAt: IsoDatetimeSchema,
  followUpContext: FollowUpContextSchema,
})
export type CompletionContextSummary = z.infer<typeof CompletionContextSummarySchema>

export const ContextSelectionMetadataSchema = z.object({
  strategy: z.enum(['active-plus-recent-completions', 'recent-completions-only', 'session-history-only']),
  includedSessionIds: z.array(IdentifierSchema),
  omittedSessionCount: z.number().int().nonnegative().default(0),
})
export type ContextSelectionMetadata = z.infer<typeof ContextSelectionMetadataSchema>

export const ConversationAppContextSchema = z
  .object({
    version: ContractVersionSchema,
    conversationId: IdentifierSchema,
    generatedAt: IsoDatetimeSchema,
    activeApp: ActiveAppContextSchema.nullable(),
    recentCompletions: z.array(CompletionContextSummarySchema).max(10),
    sessionTimeline: z.array(AppSessionContextSummarySchema).max(20),
    selection: ContextSelectionMetadataSchema,
    notes: z.array(NonEmptyStringSchema).max(5).optional(),
  })
  .superRefine((value, ctx) => {
    const timelineIds = new Set(value.sessionTimeline.map((session) => session.appSessionId))
    if (timelineIds.size !== value.sessionTimeline.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'sessionTimeline session IDs must be unique',
        path: ['sessionTimeline'],
      })
    }

    const completionIds = new Set(value.recentCompletions.map((completion) => completion.appSessionId))
    if (completionIds.size !== value.recentCompletions.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'recentCompletions appSessionIds must be unique',
        path: ['recentCompletions'],
      })
    }

    if (value.activeApp) {
      if (!timelineIds.has(value.activeApp.appSessionId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'activeApp must also appear in sessionTimeline',
          path: ['activeApp', 'appSessionId'],
        })
      }

      if (!value.selection.includedSessionIds.includes(value.activeApp.appSessionId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'selection.includedSessionIds must include the active app session',
          path: ['selection', 'includedSessionIds'],
        })
      }
    }
  })

export type ConversationAppContext = z.infer<typeof ConversationAppContextSchema>

export function parseConversationAppContext(input: unknown): ConversationAppContext {
  return ConversationAppContextSchema.parse(input)
}

export function validateConversationAppContext(input: unknown) {
  return toValidationResult(ConversationAppContextSchema.safeParse(input))
}

export function appSessionStateToContextSummary(
  session: z.infer<typeof AppSessionStateSchema>
): AppSessionContextSummary {
  return AppSessionContextSummarySchema.parse({
    appSessionId: session.appSessionId,
    appId: session.appId,
    status: session.status,
    summary: session.latestSnapshot?.summary ?? 'No app summary available yet.',
    updatedAt: session.updatedAt,
    latestSequence: session.latestSequence,
    latestStateDigest: session.latestSnapshot?.stateDigest,
  })
}

export function completionSignalToContextSummary(
  completion: z.infer<typeof CompletionSignalSchema>
): CompletionContextSummary {
  return CompletionContextSummarySchema.parse({
    appSessionId: completion.appSessionId,
    appId: completion.appId,
    status: completion.status,
    resultSummary: completion.resultSummary,
    completedAt: completion.completedAt,
    followUpContext: completion.followUpContext,
  })
}

export const exampleConversationAppContext: ConversationAppContext = ConversationAppContextSchema.parse({
  version: 'v1',
  conversationId: 'conversation.1',
  generatedAt: '2026-03-31T16:10:00.000Z',
  activeApp: {
    appSessionId: 'app-session.chess.1',
    appId: 'chess.internal',
    status: 'active',
    summary: 'White is evaluating the next move from the current board state.',
    updatedAt: '2026-03-31T15:02:00.000Z',
    latestSequence: 4,
    latestStateDigest: {
      boardState: 'r1bqkbnr/pppp1ppp/2n5/4p3/2BPP3/5N2/PPP2PPP/RNBQK2R b KQkq - 2 3',
    },
    authState: 'connected',
    currentToolCallId: 'tool-call.chess.1',
    resumableUntil: '2026-04-01T15:00:00.000Z',
    availableToolNames: ['chess.launch-game'],
  },
  recentCompletions: [
    {
      appSessionId: 'app-session.chess.2',
      appId: 'chess.internal',
      status: 'succeeded',
      resultSummary: 'White checkmated black on move 22.',
      completedAt: '2026-03-31T16:08:00.000Z',
      followUpContext: {
        summary: 'Use this game to explain the final mating net and missed defensive resources.',
        recommendedPrompts: ['Explain why black could not escape the mating net.'],
        stateDigest: {
          moveCount: 22,
        },
      },
    },
    {
      appSessionId: 'app-session.flashcards.1',
      appId: 'flashcards.public',
      status: 'succeeded',
      resultSummary: 'Flashcard session on fractions is ready for follow-up.',
      completedAt: '2026-03-31T16:09:30.000Z',
      followUpContext: {
        summary: 'Use the flashcard deck to guide the next study question.',
        userVisibleSummary: 'Flashcards are ready for review.',
        stateDigest: {
          topic: 'fractions',
          reviewedCount: 3,
        },
      },
    },
  ],
  sessionTimeline: [
    {
      appSessionId: 'app-session.chess.1',
      appId: 'chess.internal',
      status: 'active',
      summary: 'White is evaluating the next move from the current board state.',
      updatedAt: '2026-03-31T15:02:00.000Z',
      latestSequence: 4,
      latestStateDigest: {
        moveNumber: 3,
      },
    },
    {
      appSessionId: 'app-session.chess.2',
      appId: 'chess.internal',
      status: 'completed',
      summary: 'The lesson game finished in checkmate.',
      updatedAt: '2026-03-31T16:08:00.000Z',
      latestSequence: 9,
      latestStateDigest: {
        winner: 'white',
      },
    },
    {
      appSessionId: 'app-session.flashcards.1',
      appId: 'flashcards.public',
      status: 'completed',
      summary: 'Flashcard session ready for discussion.',
      updatedAt: '2026-03-31T16:09:30.000Z',
      latestSequence: 12,
      latestStateDigest: {
        topic: 'fractions',
        reviewedCount: 3,
      },
    },
  ],
  selection: {
    strategy: 'active-plus-recent-completions',
    includedSessionIds: ['app-session.chess.1', 'app-session.chess.2', 'app-session.flashcards.1'],
    omittedSessionCount: 0,
  },
  notes: ['Prioritize the active chess board and keep the completed flashcard session as secondary follow-up context.'],
})
