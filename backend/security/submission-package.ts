import {
  type AppManifest,
  AppManifestSchema,
  type ContractValidationFailure,
  IsoDatetimeSchema,
  JsonObjectSchema,
  NonEmptyStringSchema,
  normalizeOrigin,
  SemverSchema,
  toValidationResult,
} from '@shared/contracts/v1'
import { z } from 'zod'

export const AppReviewStateSchema = z.enum([
  'draft',
  'submitted',
  'validation-failed',
  'review-pending',
  'approved-staging',
  'approved-production',
  'rejected',
  'suspended',
  'retired',
])

export type AppReviewState = z.infer<typeof AppReviewStateSchema>

export const AppSubmissionOwnerTypeSchema = z.enum(['internal-team', 'external-partner'])
export type AppSubmissionOwnerType = z.infer<typeof AppSubmissionOwnerTypeSchema>

export const AppSubmissionOwnerSchema = z.object({
  ownerType: AppSubmissionOwnerTypeSchema,
  ownerName: NonEmptyStringSchema,
  contactName: NonEmptyStringSchema,
  contactEmail: z.string().email(),
  organization: NonEmptyStringSchema.optional(),
})

export const AppSubmissionSupportSchema = z.object({
  supportEmail: z.string().email(),
  supportUrl: z.string().url().optional(),
  responsePolicy: NonEmptyStringSchema,
})

export const AppSubmissionPackageSchema = z.object({
  submissionVersion: z.literal('v1').default('v1'),
  category: NonEmptyStringSchema,
  manifest: AppManifestSchema,
  owner: AppSubmissionOwnerSchema,
  domains: z.array(NonEmptyStringSchema).min(1),
  requestedOAuthScopes: z.array(NonEmptyStringSchema).default([]),
  stagingUrl: z.string().url(),
  privacyPolicyUrl: z.string().url(),
  support: AppSubmissionSupportSchema,
  releaseNotes: NonEmptyStringSchema,
  screenshots: z.array(z.string().url()).default([]),
  submittedAt: IsoDatetimeSchema.optional(),
  metadata: JsonObjectSchema.default({}),
})

export type AppSubmissionPackage = z.infer<typeof AppSubmissionPackageSchema>

export const AppSubmissionValidationFindingSeveritySchema = z.enum(['info', 'warning', 'error'])
export type AppSubmissionValidationFindingSeverity = z.infer<typeof AppSubmissionValidationFindingSeveritySchema>

export interface AppSubmissionValidationFinding {
  scope: 'submission' | 'domain-origin' | 'permission' | 'oauth-scope'
  code: string
  severity: AppSubmissionValidationFindingSeverity
  message: string
  field?: string
}

export interface AppSubmissionValidationResult {
  findings: AppSubmissionValidationFinding[]
}

const LEGACY_OWNER_EMAIL = 'legacy-submission@chatbridge.local'

export function parseAppSubmissionPackage(input: unknown): AppSubmissionPackage {
  return AppSubmissionPackageSchema.parse(input)
}

export function validateAppSubmissionPackage(input: unknown) {
  return toValidationResult(AppSubmissionPackageSchema.safeParse(input))
}

export function normalizeSubmittedManifestForPlatformReview(manifest: AppManifest): AppManifest {
  return AppManifestSchema.parse({
    ...manifest,
    safetyMetadata: {
      ...manifest.safetyMetadata,
      reviewStatus: 'pending',
      reviewedAt: undefined,
      reviewedBy: undefined,
    },
  })
}

export function buildLegacyPlatformSeedSubmissionPackage(
  manifest: AppManifest,
  category: string,
  submittedAt: string
): AppSubmissionPackage {
  return AppSubmissionPackageSchema.parse({
    submissionVersion: 'v1',
    category,
    manifest,
    owner: {
      ownerType: 'internal-team',
      ownerName: 'TutorMeAI Platform',
      contactName: 'Platform Seed Registration',
      contactEmail: LEGACY_OWNER_EMAIL,
      organization: 'TutorMeAI',
    },
    domains: manifest.allowedOrigins.map((origin) => normalizeOrigin(origin)),
    requestedOAuthScopes: manifest.authConfig?.scopes ?? [],
    stagingUrl: manifest.uiEmbedConfig.entryUrl,
    privacyPolicyUrl: manifest.uiEmbedConfig.entryUrl,
    support: {
      supportEmail: LEGACY_OWNER_EMAIL,
      responsePolicy: 'Internal seeded app registration used for trusted platform bootstrapping.',
    },
    releaseNotes: `Seeded app registration for ${manifest.appVersion}.`,
    screenshots: [],
    submittedAt,
    metadata: {
      source: 'platform-seed',
      appVersion: SemverSchema.parse(manifest.appVersion),
    },
  })
}

export function invalidSubmissionPackageFailureResult(
  validation: ContractValidationFailure,
  message = 'App submission package validation failed.'
) {
  return {
    code: 'invalid-submission-package' as const,
    message,
    details: validation.errors,
  }
}
