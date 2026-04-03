import {
  exampleAuthenticatedPlannerManifest,
  exampleInternalChessManifest,
  examplePublicFlashcardsManifest,
} from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import {
  AppSubmissionPackageSchema,
  buildLegacyPlatformSeedSubmissionPackage,
  normalizeSubmittedManifestForPlatformReview,
  validateAppSubmissionPackage,
} from './submission-package'

describe('AppSubmissionPackage', () => {
  it('validates a complete public external submission package', () => {
    const result = validateAppSubmissionPackage({
      submissionVersion: 'v1',
      category: 'study',
      manifest: examplePublicFlashcardsManifest,
      owner: {
        ownerType: 'external-partner',
        ownerName: 'Flashcards Learning Co',
        contactName: 'Jamie Rivera',
        contactEmail: 'jamie@example.com',
        organization: 'Flashcards Learning Co',
      },
      domains: ['https://apps.chatbridge.dev'],
      stagingUrl: 'https://staging.flashcards.example.com',
      privacyPolicyUrl: 'https://flashcards.example.com/privacy',
      support: {
        supportEmail: 'support@flashcards.example.com',
        responsePolicy: 'Responds to school support tickets within two business days.',
      },
      releaseNotes: 'Adds the initial public flashcards review flow.',
      screenshots: ['https://flashcards.example.com/screenshot-1.png'],
      submittedAt: '2026-04-02T12:00:00.000Z',
    })

    expect(result.success).toBe(true)
  })

  it('normalizes submitted manifests back to platform-owned pending review', () => {
    const normalized = normalizeSubmittedManifestForPlatformReview(exampleInternalChessManifest)

    expect(normalized.safetyMetadata.reviewStatus).toBe('pending')
    expect(normalized.safetyMetadata.reviewedAt).toBeUndefined()
    expect(normalized.safetyMetadata.reviewedBy).toBeUndefined()
  })

  it('builds a legacy platform seed submission package for internal bootstrapping', () => {
    const submission = buildLegacyPlatformSeedSubmissionPackage(
      exampleAuthenticatedPlannerManifest,
      'productivity',
      '2026-04-02T12:00:00.000Z'
    )

    expect(submission.owner.ownerType).toBe('internal-team')
    expect(submission.metadata.source).toBe('platform-seed')
    expect(submission.manifest.appId).toBe(exampleAuthenticatedPlannerManifest.appId)
  })

  it('rejects malformed submission packages with readable errors', () => {
    const parsed = AppSubmissionPackageSchema.safeParse({
      submissionVersion: 'v1',
      category: '',
      manifest: examplePublicFlashcardsManifest,
      owner: {
        ownerType: 'external-partner',
        ownerName: 'Partner',
        contactName: 'Partner',
        contactEmail: 'not-an-email',
      },
      domains: [],
      stagingUrl: 'not-a-url',
      privacyPolicyUrl: 'https://partner.example.com/privacy',
      support: {
        supportEmail: 'support@partner.example.com',
        responsePolicy: '1 day',
      },
      releaseNotes: 'release',
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.join('.').includes('contactEmail'))).toBe(true)
      expect(parsed.error.issues.some((issue) => issue.path.join('.').includes('domains'))).toBe(true)
    }
  })

  it('supports authenticated external submission packages', () => {
    const parsed = AppSubmissionPackageSchema.parse({
      submissionVersion: 'v1',
      category: 'productivity',
      manifest: exampleAuthenticatedPlannerManifest,
      owner: {
        ownerType: 'external-partner',
        ownerName: 'Planner Partner',
        contactName: 'Morgan Lee',
        contactEmail: 'morgan@example.com',
      },
      domains: ['https://apps.chatbridge.dev'],
      stagingUrl: 'https://planner.example.com/staging',
      privacyPolicyUrl: 'https://planner.example.com/privacy',
      support: {
        supportEmail: 'support@planner.example.com',
        responsePolicy: 'School support queue within one business day.',
        supportUrl: 'https://planner.example.com/support',
      },
      releaseNotes: 'Initial authenticated planner partner submission.',
      screenshots: [],
    })

    expect(parsed.manifest.appId).toBe(exampleAuthenticatedPlannerManifest.appId)
  })
})
