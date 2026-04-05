import { z } from 'zod'
import { AppPermissionsSchema } from '../permissions'
import { IdentifierSchema, JsonValueSchema, NonEmptyStringSchema } from '../shared'
import { toValidationResult } from '../validation'

export const ToolAuthRequirementSchema = z.enum(['none', 'platform-session', 'app-oauth'])
export type ToolAuthRequirement = z.infer<typeof ToolAuthRequirementSchema>

export const ToolInvocationModeSchema = z.enum(['platform-proxy', 'embedded-bridge'])
export type ToolInvocationMode = z.infer<typeof ToolInvocationModeSchema>

export const ToolJsonScalarTypeSchema = z.enum(['string', 'number', 'integer', 'boolean', 'null'])
export const ToolJsonContainerTypeSchema = z.enum(['object', 'array'])
export const ToolJsonTypeSchema = z.union([ToolJsonScalarTypeSchema, ToolJsonContainerTypeSchema])
export type ToolJsonType = z.infer<typeof ToolJsonTypeSchema>

export const ToolJsonSchemaSchema: z.ZodType<ToolJsonSchema> = z.lazy(() =>
  z
    .object({
      type: ToolJsonTypeSchema.optional(),
      title: NonEmptyStringSchema.optional(),
      description: z.string().optional(),
      properties: z.record(z.string(), ToolJsonSchemaSchema).optional(),
      items: z.union([ToolJsonSchemaSchema, z.array(ToolJsonSchemaSchema)]).optional(),
      required: z.array(NonEmptyStringSchema).optional(),
      enum: z.array(JsonValueSchema).optional(),
      additionalProperties: z.union([z.boolean(), ToolJsonSchemaSchema]).optional(),
      nullable: z.boolean().optional(),
      default: JsonValueSchema.optional(),
      examples: z.array(JsonValueSchema).optional(),
    })
    .superRefine((value, ctx) => {
      if (value.type === 'object' && !value.properties) {
        ctx.addIssue({
          code: 'custom',
          message: 'Object schemas must define properties',
          path: ['properties'],
        })
      }

      if (value.type !== 'object' && value.properties) {
        ctx.addIssue({
          code: 'custom',
          message: 'Only object schemas may define properties',
          path: ['properties'],
        })
      }

      if (value.required && !value.properties) {
        ctx.addIssue({
          code: 'custom',
          message: 'Required fields need an object properties map',
          path: ['required'],
        })
      }

      if (value.type === 'array' && !value.items) {
        ctx.addIssue({
          code: 'custom',
          message: 'Array schemas must define items',
          path: ['items'],
        })
      }

      if (value.type !== 'array' && value.items) {
        ctx.addIssue({
          code: 'custom',
          message: 'Only array schemas may define items',
          path: ['items'],
        })
      }

      if (value.required && value.properties) {
        for (const requiredField of value.required) {
          if (!(requiredField in value.properties)) {
            ctx.addIssue({
              code: 'custom',
              message: `Required field "${requiredField}" must exist in properties`,
              path: ['required'],
            })
          }
        }
      }
    })
) as z.ZodType<ToolJsonSchema>

export type ToolJsonSchema = {
  type?: ToolJsonType
  title?: string
  description?: string
  properties?: Record<string, ToolJsonSchema>
  items?: ToolJsonSchema | ToolJsonSchema[]
  required?: string[]
  enum?: z.infer<typeof JsonValueSchema>[]
  additionalProperties?: boolean | ToolJsonSchema
  nullable?: boolean
  default?: z.infer<typeof JsonValueSchema>
  examples?: z.infer<typeof JsonValueSchema>[]
}

export const ToolSchemaSchema = z.object({
  name: IdentifierSchema,
  displayName: NonEmptyStringSchema.optional(),
  description: NonEmptyStringSchema,
  inputSchema: ToolJsonSchemaSchema,
  outputSchema: ToolJsonSchemaSchema.optional(),
  authRequirement: ToolAuthRequirementSchema,
  timeoutMs: z.number().int().min(1_000).max(300_000),
  idempotent: z.boolean(),
  invocationMode: ToolInvocationModeSchema,
  requiredPermissions: AppPermissionsSchema.optional(),
})

export type ToolSchema = z.infer<typeof ToolSchemaSchema>

export function parseToolSchema(input: unknown): ToolSchema {
  return ToolSchemaSchema.parse(input)
}

export function validateToolSchema(input: unknown) {
  return toValidationResult(ToolSchemaSchema.safeParse(input))
}

export const exampleChessLaunchToolSchema: ToolSchema = ToolSchemaSchema.parse({
  name: 'chess.launch-game',
  displayName: 'Launch Chess Game',
  description: 'Create or resume a chess session for the current conversation.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['practice', 'analysis'],
      },
    },
    required: ['mode'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      appSessionId: { type: 'string' },
      boardState: { type: 'string' },
    },
    required: ['appSessionId'],
  },
  authRequirement: 'platform-session',
  timeoutMs: 30_000,
  idempotent: false,
  invocationMode: 'embedded-bridge',
  requiredPermissions: ['session:write', 'tool:invoke'],
})

export const exampleChessGetBoardStateToolSchema: ToolSchema = ToolSchemaSchema.parse({
  name: 'chess.get-board-state',
  displayName: 'Get Chess Board State',
  description:
    'Read the current live chess board state, including FEN, turn, last move, and legal move options from the active sidebar session.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['current-position'],
      },
    },
    required: ['scope'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      appSessionId: { type: 'string' },
      fen: { type: 'string' },
      turn: {
        type: 'string',
        enum: ['white', 'black'],
      },
      moveCount: { type: 'integer' },
      lastMove: { type: 'string' },
      legalMoveCount: { type: 'integer' },
      legalMoves: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      candidateMoves: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      phase: { type: 'string' },
      status: { type: 'string' },
      summary: { type: 'string' },
      moveExecutionAvailable: { type: 'boolean' },
      mode: { type: 'string', nullable: true },
    },
    required: [
      'appSessionId',
      'fen',
      'turn',
      'moveCount',
      'lastMove',
      'legalMoveCount',
      'legalMoves',
      'candidateMoves',
      'phase',
      'status',
      'summary',
      'moveExecutionAvailable',
    ],
  },
  authRequirement: 'platform-session',
  timeoutMs: 10_000,
  idempotent: true,
  invocationMode: 'embedded-bridge',
  requiredPermissions: ['session:read', 'tool:invoke'],
})

export const exampleChessMakeMoveToolSchema: ToolSchema = ToolSchemaSchema.parse({
  name: 'chess.make-move',
  displayName: 'Make Chess Move',
  description:
    'Apply a legal move to the active live chess board in the sidebar session and return the updated position.',
  inputSchema: {
    type: 'object',
    properties: {
      move: {
        type: 'string',
        description: 'A SAN or coordinate move like d4, Nf3, e2e4, or a2-a4.',
      },
      expectedFen: {
        type: 'string',
        description: 'The board FEN the chat used before sending the move, for stale-state protection.',
      },
    },
    required: ['move', 'expectedFen'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      appSessionId: { type: 'string' },
      requestedMove: { type: 'string' },
      appliedMove: { type: 'string' },
      fen: { type: 'string' },
      turn: {
        type: 'string',
        enum: ['white', 'black'],
      },
      moveCount: { type: 'integer' },
      lastMove: { type: 'string' },
      legalMoveCount: { type: 'integer' },
      candidateMoves: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      summary: { type: 'string' },
      explanation: { type: 'string' },
      moveExecutionAvailable: { type: 'boolean' },
    },
    required: [
      'appSessionId',
      'requestedMove',
      'appliedMove',
      'fen',
      'turn',
      'moveCount',
      'lastMove',
      'legalMoveCount',
      'candidateMoves',
      'summary',
      'explanation',
      'moveExecutionAvailable',
    ],
  },
  authRequirement: 'platform-session',
  timeoutMs: 15_000,
  idempotent: false,
  invocationMode: 'embedded-bridge',
  requiredPermissions: ['session:read', 'session:write', 'tool:invoke'],
})

export const exampleFlashcardsStartToolSchema: ToolSchema = ToolSchemaSchema.parse({
  name: 'flashcards.start-session',
  displayName: 'Start Flashcard Session',
  description: 'Open a public flashcard practice session for the requested topic.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
    },
    required: ['topic'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      cardCount: { type: 'integer' },
    },
  },
  authRequirement: 'none',
  timeoutMs: 20_000,
  idempotent: false,
  invocationMode: 'embedded-bridge',
  requiredPermissions: ['tool:invoke'],
})

export const examplePlannerDashboardToolSchema: ToolSchema = ToolSchemaSchema.parse({
  name: 'planner.open-dashboard',
  description: 'Open the authenticated planner experience for the current user.',
  inputSchema: {
    type: 'object',
    properties: {
      focus: {
        type: 'string',
        enum: ['today', 'week', 'overdue'],
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      requiresAuth: { type: 'boolean' },
    },
  },
  authRequirement: 'app-oauth',
  timeoutMs: 30_000,
  idempotent: true,
  invocationMode: 'embedded-bridge',
  requiredPermissions: ['oauth:connect', 'tool:invoke'],
})

export const exampleToolSchemas = [
  exampleChessLaunchToolSchema,
  exampleChessGetBoardStateToolSchema,
  exampleChessMakeMoveToolSchema,
  exampleFlashcardsStartToolSchema,
  examplePlannerDashboardToolSchema,
]
