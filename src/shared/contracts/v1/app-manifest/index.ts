import { z } from 'zod'
import { AppPermissionsSchema } from '../permissions'
import {
  ContractVersionSchema,
  IdentifierSchema,
  IsoDatetimeSchema,
  NonEmptyStringSchema,
  normalizeOrigin,
  OriginSchema,
  SemverSchema,
  SlugSchema,
} from '../shared'
import {
  exampleChessGetBoardStateToolSchema,
  exampleChessLaunchToolSchema,
  exampleFlashcardsStartToolSchema,
  examplePlannerDashboardToolSchema,
  ToolSchemaSchema,
} from '../tool-schema'
import { toValidationResult } from '../validation'

export const AppDistributionSchema = z.enum(['internal', 'public-external', 'authenticated-external'])
export type AppDistribution = z.infer<typeof AppDistributionSchema>

export const AppAuthTypeSchema = z.enum(['none', 'platform-session', 'oauth2'])
export type AppAuthType = z.infer<typeof AppAuthTypeSchema>

export const AppReviewStatusSchema = z.enum(['pending', 'approved', 'blocked'])
export type AppReviewStatus = z.infer<typeof AppReviewStatusSchema>

export const AppAgeRatingSchema = z.enum(['all-ages', '13+', '16+', '18+'])
export type AppAgeRating = z.infer<typeof AppAgeRatingSchema>

export const AppDataAccessLevelSchema = z.enum(['minimal', 'moderate', 'sensitive'])
export type AppDataAccessLevel = z.infer<typeof AppDataAccessLevelSchema>

export const OAuthConfigSchema = z.object({
  provider: NonEmptyStringSchema,
  authorizationUrl: z.string().url(),
  tokenUrl: z.string().url(),
  scopes: z.array(NonEmptyStringSchema).min(1),
  pkceRequired: z.boolean().default(true),
})

export const UIEmbedConfigSchema = z
  .object({
    entryUrl: z.string().url(),
    targetOrigin: OriginSchema,
    loadingStrategy: z.enum(['eager', 'lazy']).default('lazy'),
    sandbox: z.object({
      allowScripts: z.boolean(),
      allowForms: z.boolean().default(false),
      allowPopups: z.boolean().default(false),
      allowSameOrigin: z.boolean().default(false),
    }),
    preferredSize: z
      .object({
        minHeight: z.number().int().positive().optional(),
        defaultHeight: z.number().int().positive(),
        maxHeight: z.number().int().positive().optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (normalizeOrigin(value.entryUrl) !== normalizeOrigin(value.targetOrigin)) {
      ctx.addIssue({
        code: 'custom',
        message: 'targetOrigin must match the entryUrl origin',
        path: ['targetOrigin'],
      })
    }
  })

export const SafetyMetadataSchema = z.object({
  reviewStatus: AppReviewStatusSchema,
  ageRating: AppAgeRatingSchema,
  dataAccessLevel: AppDataAccessLevelSchema,
  reviewedAt: IsoDatetimeSchema.optional(),
  reviewedBy: NonEmptyStringSchema.optional(),
  notes: z.string().optional(),
})

export const AppManifestSchema = z
  .object({
    version: ContractVersionSchema,
    appId: IdentifierSchema,
    slug: SlugSchema,
    name: NonEmptyStringSchema,
    shortDescription: NonEmptyStringSchema,
    description: z.string().optional(),
    appVersion: SemverSchema,
    distribution: AppDistributionSchema,
    authType: AppAuthTypeSchema,
    authConfig: OAuthConfigSchema.optional(),
    permissions: AppPermissionsSchema,
    allowedOrigins: z.array(OriginSchema).min(1),
    uiEmbedConfig: UIEmbedConfigSchema,
    toolDefinitions: z.array(ToolSchemaSchema).min(1),
    safetyMetadata: SafetyMetadataSchema,
  })
  .superRefine((value, ctx) => {
    const uniqueOrigins = new Set(value.allowedOrigins.map(normalizeOrigin))
    if (uniqueOrigins.size !== value.allowedOrigins.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'allowedOrigins must be unique',
        path: ['allowedOrigins'],
      })
    }

    if (!uniqueOrigins.has(normalizeOrigin(value.uiEmbedConfig.targetOrigin))) {
      ctx.addIssue({
        code: 'custom',
        message: 'allowedOrigins must include uiEmbedConfig.targetOrigin',
        path: ['allowedOrigins'],
      })
    }

    if (value.distribution === 'public-external' && value.authType !== 'none') {
      ctx.addIssue({
        code: 'custom',
        message: 'public-external apps must use authType "none"',
        path: ['authType'],
      })
    }

    if (value.distribution === 'authenticated-external' && value.authType !== 'oauth2') {
      ctx.addIssue({
        code: 'custom',
        message: 'authenticated-external apps must use authType "oauth2"',
        path: ['authType'],
      })
    }

    if (value.authType === 'oauth2' && !value.authConfig) {
      ctx.addIssue({
        code: 'custom',
        message: 'oauth2 apps must provide authConfig',
        path: ['authConfig'],
      })
    }

    if (value.authType !== 'oauth2' && value.authConfig) {
      ctx.addIssue({
        code: 'custom',
        message: 'authConfig is only allowed when authType is "oauth2"',
        path: ['authConfig'],
      })
    }

    for (const [index, tool] of value.toolDefinitions.entries()) {
      if (tool.requiredPermissions) {
        for (const permission of tool.requiredPermissions) {
          if (!value.permissions.includes(permission)) {
            ctx.addIssue({
              code: 'custom',
              message: `toolDefinitions[${index}] requires permission "${permission}" that is missing from manifest permissions`,
              path: ['toolDefinitions', index, 'requiredPermissions'],
            })
          }
        }
      }

      if (value.distribution === 'public-external' && tool.authRequirement !== 'none') {
        ctx.addIssue({
          code: 'custom',
          message: 'public-external app tools must use authRequirement "none"',
          path: ['toolDefinitions', index, 'authRequirement'],
        })
      }

      if (value.distribution === 'internal' && tool.authRequirement === 'app-oauth') {
        ctx.addIssue({
          code: 'custom',
          message: 'internal apps cannot require app-oauth tool authentication',
          path: ['toolDefinitions', index, 'authRequirement'],
        })
      }

      if (value.distribution === 'authenticated-external' && tool.authRequirement === 'platform-session') {
        ctx.addIssue({
          code: 'custom',
          message: 'authenticated-external apps cannot require platform-session tool authentication',
          path: ['toolDefinitions', index, 'authRequirement'],
        })
      }
    }
  })

export type AppManifest = z.infer<typeof AppManifestSchema>
export type UIEmbedConfig = z.infer<typeof UIEmbedConfigSchema>
export type SafetyMetadata = z.infer<typeof SafetyMetadataSchema>

export function parseAppManifest(input: unknown): AppManifest {
  return AppManifestSchema.parse(input)
}

export function validateAppManifest(input: unknown) {
  return toValidationResult(AppManifestSchema.safeParse(input))
}

export const exampleInternalChessManifest: AppManifest = AppManifestSchema.parse({
  version: 'v1',
  appId: 'chess.internal',
  slug: 'chess',
  name: 'Chess Tutor',
  shortDescription: 'Practice chess with an embedded board and coaching tools.',
  description: 'A first-party chess experience that can launch a board, track turns, and summarize game state.',
  appVersion: '1.0.0',
  distribution: 'internal',
  authType: 'platform-session',
  permissions: [
    'conversation:read-summary',
    'conversation:write-summary',
    'session:read',
    'session:write',
    'tool:invoke',
  ],
  allowedOrigins: ['https://apps.chatbridge.dev'],
  uiEmbedConfig: {
    entryUrl: 'https://apps.chatbridge.dev/chess',
    targetOrigin: 'https://apps.chatbridge.dev',
    loadingStrategy: 'lazy',
    sandbox: {
      allowScripts: true,
      allowForms: false,
      allowPopups: false,
      allowSameOrigin: false,
    },
    preferredSize: {
      defaultHeight: 640,
      minHeight: 480,
    },
  },
  toolDefinitions: [exampleChessLaunchToolSchema, exampleChessGetBoardStateToolSchema],
  safetyMetadata: {
    reviewStatus: 'approved',
    ageRating: 'all-ages',
    dataAccessLevel: 'minimal',
    reviewedAt: '2026-03-31T12:00:00.000Z',
    reviewedBy: 'platform-review',
    notes: 'Approved for MVP classroom launch.',
  },
})

export const examplePublicFlashcardsManifest: AppManifest = AppManifestSchema.parse({
  version: 'v1',
  appId: 'flashcards.public',
  slug: 'flashcards',
  name: 'Flashcards Coach',
  shortDescription:
    'Study a live topic-based flashcard deck while keeping the current card and progress connected to chat.',
  appVersion: '1.0.0',
  distribution: 'public-external',
  authType: 'none',
  permissions: ['tool:invoke'],
  allowedOrigins: ['https://flashcards.chatbridge.dev'],
  uiEmbedConfig: {
    entryUrl: 'https://flashcards.chatbridge.dev/embed',
    targetOrigin: 'https://flashcards.chatbridge.dev',
    loadingStrategy: 'lazy',
    sandbox: {
      allowScripts: true,
      allowForms: true,
      allowPopups: false,
      allowSameOrigin: false,
    },
  },
  toolDefinitions: [exampleFlashcardsStartToolSchema],
  safetyMetadata: {
    reviewStatus: 'approved',
    ageRating: 'all-ages',
    dataAccessLevel: 'minimal',
    notes: 'Public study aid approved for no-auth classroom use.',
  },
})

export const exampleAuthenticatedPlannerManifest: AppManifest = AppManifestSchema.parse({
  version: 'v1',
  appId: 'planner.oauth',
  slug: 'planner-connect',
  name: 'Planner Connect',
  shortDescription: 'Connect a personal planner account and manage assignments.',
  appVersion: '1.0.0',
  distribution: 'authenticated-external',
  authType: 'oauth2',
  authConfig: {
    provider: 'planner-cloud',
    authorizationUrl: 'https://accounts.planner-cloud.dev/oauth/authorize',
    tokenUrl: 'https://accounts.planner-cloud.dev/oauth/token',
    scopes: ['assignments.read', 'assignments.write'],
    pkceRequired: true,
  },
  permissions: ['conversation:read-summary', 'tool:invoke', 'oauth:connect', 'user:read-profile'],
  allowedOrigins: ['https://planner.chatbridge.dev'],
  uiEmbedConfig: {
    entryUrl: 'https://planner.chatbridge.dev/embed',
    targetOrigin: 'https://planner.chatbridge.dev',
    loadingStrategy: 'lazy',
    sandbox: {
      allowScripts: true,
      allowForms: true,
      allowPopups: true,
      allowSameOrigin: false,
    },
  },
  toolDefinitions: [examplePlannerDashboardToolSchema],
  safetyMetadata: {
    reviewStatus: 'pending',
    ageRating: '13+',
    dataAccessLevel: 'moderate',
  },
})

export const exampleAppManifests = [
  exampleInternalChessManifest,
  examplePublicFlashcardsManifest,
  exampleAuthenticatedPlannerManifest,
]
