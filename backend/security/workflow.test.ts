import {
  exampleAuthenticatedPlannerManifest,
  examplePublicFlashcardsManifest,
} from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { InMemoryAppRegistryRepository } from '../registry/repository'
import { AppRegistryService } from '../registry/service'
import { InMemoryAppSecurityRepository } from './repository'
import { AppSecurityService } from './service'
import { AppSubmissionPackageSchema } from './submission-package'
import { AppReviewWorkflowService } from './workflow'

function createFixture() {
  const registryRepository = new InMemoryAppRegistryRepository()
  const securityRepository = new InMemoryAppSecurityRepository()
  const registry = new AppRegistryService(registryRepository, {
    now: () => '2026-04-02T12:00:00.000Z',
  })
  const security = new AppSecurityService(securityRepository, {
    now: () => '2026-04-02T12:00:00.000Z',
  })
  const workflow = new AppReviewWorkflowService(registryRepository, security, {
    now: () => '2026-04-02T12:00:00.000Z',
  })

  return {
    registry,
    security,
    workflow,
  }
}

function buildSubmission(manifest: typeof examplePublicFlashcardsManifest | typeof exampleAuthenticatedPlannerManifest, category: string) {
  return AppSubmissionPackageSchema.parse({
    submissionVersion: 'v1',
    category,
    manifest,
    owner: {
      ownerType: 'external-partner',
      ownerName: 'Partner Studio',
      contactName: 'Taylor Brooks',
      contactEmail: 'taylor@example.com',
      organization: 'Partner Studio',
    },
    domains: manifest.allowedOrigins,
    requestedOAuthScopes: manifest.authConfig?.scopes ?? [],
    stagingUrl: manifest.uiEmbedConfig.entryUrl,
    privacyPolicyUrl: `${manifest.uiEmbedConfig.targetOrigin}/privacy`,
    support: {
      supportEmail: 'support@example.com',
      responsePolicy: 'School support within one business day.',
      supportUrl: `${manifest.uiEmbedConfig.targetOrigin}/support`,
    },
    releaseNotes: `Submission package for ${manifest.appVersion}.`,
    screenshots: [],
    submittedAt: '2026-04-02T12:00:00.000Z',
  })
}

describe('AppReviewWorkflowService', () => {
  it('moves a submitted app into review-pending and exposes it in the queue', async () => {
    const { registry, workflow } = createFixture()

    const registered = await registry.registerApp({
      submission: buildSubmission(examplePublicFlashcardsManifest, 'study'),
      registrationSource: 'partner-submission',
    })

    expect(registered.ok).toBe(true)
    if (!registered.ok) {
      return
    }

    const started = await workflow.startReview({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
      notes: 'Starting manual review with harness artifacts attached.',
    })

    expect(started.ok).toBe(true)
    if (!started.ok) {
      return
    }

    expect(started.value.app.reviewState).toBe('review-pending')
    expect(started.value.app.currentVersion.review.reviewState).toBe('review-pending')
    expect(started.value.review.reviewState).toBe('review-pending')
    expect(started.value.review.decisionAction).toBe('start-review')

    const queue = await workflow.listQueue('review-pending')
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      appId: registered.value.appId,
      reviewState: 'review-pending',
      reviewedByUserId: 'reviewer.platform',
    })
  })

  it('allows a suspended app to re-enter active review', async () => {
    const { registry, workflow } = createFixture()

    const registered = await registry.registerApp({
      submission: buildSubmission(examplePublicFlashcardsManifest, 'study'),
      registrationSource: 'partner-submission',
    })

    expect(registered.ok).toBe(true)
    if (!registered.ok) {
      return
    }

    await workflow.startReview({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
    })

    const suspended = await workflow.recordDecision({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
      action: 'suspend',
      decisionSummary: 'Suspended after a classroom policy incident.',
      ageRating: 'all-ages',
      dataAccessLevel: 'minimal',
      permissionsSnapshot: [...registered.value.currentVersion.manifest.permissions],
    })

    expect(suspended.ok).toBe(false)
    if (!suspended.ok) {
      expect(suspended.code).toBe('invalid-review-state-transition')
    }

    const staging = await workflow.recordDecision({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
      action: 'approve-staging',
      decisionSummary: 'Approved for staging review.',
      ageRating: 'all-ages',
      dataAccessLevel: 'minimal',
      permissionsSnapshot: [...registered.value.currentVersion.manifest.permissions],
    })

    expect(staging.ok).toBe(true)
    if (!staging.ok) {
      return
    }

    const suspendedFromApproved = await workflow.recordDecision({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
      action: 'suspend',
      decisionSummary: 'Suspended after a classroom policy incident.',
      ageRating: 'all-ages',
      dataAccessLevel: 'minimal',
      permissionsSnapshot: [...registered.value.currentVersion.manifest.permissions],
    })

    expect(suspendedFromApproved.ok).toBe(true)
    if (!suspendedFromApproved.ok) {
      return
    }

    const restarted = await workflow.startReview({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
    })

    expect(restarted.ok).toBe(true)
    if (!restarted.ok) {
      return
    }

    expect(restarted.value.app.reviewState).toBe('review-pending')
    expect(restarted.value.review.decisionAction).toBe('start-review')
  })

  it('blocks final approval decisions until the app is actively in review', async () => {
    const { registry, workflow } = createFixture()

    const registered = await registry.registerApp({
      submission: buildSubmission(examplePublicFlashcardsManifest, 'study'),
      registrationSource: 'partner-submission',
    })

    expect(registered.ok).toBe(true)
    if (!registered.ok) {
      return
    }

    const decision = await workflow.recordDecision({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
      action: 'approve-production',
      decisionSummary: 'Attempted to approve too early.',
      ageRating: 'all-ages',
      dataAccessLevel: 'minimal',
      permissionsSnapshot: ['tool:invoke'],
    })

    expect(decision.ok).toBe(false)
    if (decision.ok) {
      return
    }

    expect(decision.code).toBe('invalid-review-state-transition')
  })

  it('records reviewer decisions and persists the resulting app version state', async () => {
    const { registry, workflow } = createFixture()

    const registered = await registry.registerApp({
      submission: buildSubmission(exampleAuthenticatedPlannerManifest, 'productivity'),
      registrationSource: 'partner-submission',
    })

    expect(registered.ok).toBe(true)
    if (!registered.ok) {
      return
    }

    await workflow.startReview({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
    })

    const approved = await workflow.recordDecision({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
      action: 'approve-production',
      decisionSummary: 'Approved for production after successful manual review.',
      notes: 'OAuth flow, planner launch, and runtime findings were all acceptable.',
      ageRating: 'all-ages',
      dataAccessLevel: 'moderate',
      permissionsSnapshot: [...registered.value.currentVersion.manifest.permissions],
    })

    expect(approved.ok).toBe(true)
    if (!approved.ok) {
      return
    }

    expect(approved.value.app.reviewState).toBe('approved-production')
    expect(approved.value.app.reviewStatus).toBe('approved')
    expect(approved.value.app.currentVersion.review.reviewState).toBe('approved-production')
    expect(approved.value.review.decisionAction).toBe('approve-production')
    expect(approved.value.review.decisionSummary).toContain('Approved for production')

    const context = await workflow.getReviewContext({
      appId: registered.value.appId,
    })

    expect(context.ok).toBe(true)
    if (!context.ok) {
      return
    }

    expect(context.value.reviews.some((review) => review.decisionAction === 'approve-production')).toBe(true)
  })

  it('supports staged approval before promotion to production', async () => {
    const { registry, workflow } = createFixture()

    const registered = await registry.registerApp({
      submission: buildSubmission(exampleAuthenticatedPlannerManifest, 'productivity'),
      registrationSource: 'partner-submission',
    })

    expect(registered.ok).toBe(true)
    if (!registered.ok) {
      return
    }

    await workflow.startReview({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
    })

    const staging = await workflow.recordDecision({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
      action: 'approve-staging',
      decisionSummary: 'Approved for staging.',
      ageRating: 'all-ages',
      dataAccessLevel: 'moderate',
      permissionsSnapshot: [...registered.value.currentVersion.manifest.permissions],
    })

    expect(staging.ok).toBe(true)
    if (!staging.ok) {
      return
    }

    const production = await workflow.recordDecision({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
      action: 'approve-production',
      decisionSummary: 'Promoted after staging review.',
      ageRating: 'all-ages',
      dataAccessLevel: 'moderate',
      permissionsSnapshot: [...registered.value.currentVersion.manifest.permissions],
    })

    expect(production.ok).toBe(true)
    if (!production.ok) {
      return
    }

    expect(production.value.app.reviewState).toBe('approved-production')
    expect(production.value.app.reviewStatus).toBe('approved')
  })

  it('stores structured remediation details when a reviewer requests fixes', async () => {
    const { registry, workflow } = createFixture()

    const registered = await registry.registerApp({
      submission: buildSubmission(examplePublicFlashcardsManifest, 'study'),
      registrationSource: 'partner-submission',
    })

    expect(registered.ok).toBe(true)
    if (!registered.ok) {
      return
    }

    await workflow.startReview({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
    })

    const remediation = await workflow.recordDecision({
      appId: registered.value.appId,
      reviewedByUserId: 'reviewer.platform',
      action: 'request-remediation',
      decisionSummary: 'Requesting fixes before staging approval.',
      notes: 'The app still needs stronger reviewer-facing content guidance.',
      ageRating: 'all-ages',
      dataAccessLevel: 'minimal',
      permissionsSnapshot: [...registered.value.currentVersion.manifest.permissions],
      remediationItems: [
        {
          code: 'content-guidance',
          summary: 'Add clearer reviewer-visible study-topic guidance before launch.',
          recommendation: 'Document allowed topic categories and add reviewer notes.',
          blocking: true,
        },
      ],
    })

    expect(remediation.ok).toBe(true)
    if (!remediation.ok) {
      return
    }

    expect(remediation.value.app.reviewState).toBe('rejected')
    expect(remediation.value.app.reviewStatus).toBe('blocked')
    expect(remediation.value.review.decisionAction).toBe('request-remediation')
    expect(remediation.value.review.remediationItems).toEqual([
      {
        code: 'content-guidance',
        summary: 'Add clearer reviewer-visible study-topic guidance before launch.',
        recommendation: 'Document allowed topic categories and add reviewer notes.',
        field: undefined,
        blocking: true,
      },
    ])
  })
})
