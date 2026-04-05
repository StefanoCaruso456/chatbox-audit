import { z } from 'zod'

export const ChessCoachActionBoardStateSchema = z.object({
  fen: z.string().min(1),
  turn: z.enum(['white', 'black']),
  moveCount: z.number().int().min(0),
  lastMove: z.string().min(1),
  moveExecutionAvailable: z.boolean(),
  summary: z.string().optional(),
  mode: z.string().optional(),
})

export const ChessCoachActionClientDataSchema = z.object({
  type: z.literal('chess-coach-action'),
  action: z.literal('play-recommended-move'),
  appSessionId: z.string().min(1),
  requestedMove: z.string().min(1),
  boardState: ChessCoachActionBoardStateSchema,
})

export type ChessCoachActionBoardState = z.infer<typeof ChessCoachActionBoardStateSchema>
export type ChessCoachActionClientData = z.infer<typeof ChessCoachActionClientDataSchema>
