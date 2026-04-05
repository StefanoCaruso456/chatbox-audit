import {
  exampleAuthenticatedPlannerManifest,
  exampleInternalChessManifest,
  examplePublicFlashcardsManifest,
} from '@shared/contracts/v1'
import { InMemoryAppRegistryRepository } from '../../../../backend/registry/repository'
import { AppRegistryService } from '../../../../backend/registry/service'
import { InMemoryAppSecurityRepository } from '../../../../backend/security/repository'
import { AppSecurityService } from '../../../../backend/security/service'
import { AppSubmissionPackageSchema } from '../../../../backend/security/submission-package'
import type { AppReviewQueueItem } from '../../../../backend/security/types'
import { AppReviewWorkflowService } from '../../../../backend/security/workflow'
import type { TrustReviewQueueEntry, TrustReviewQueueState, TrustReviewWorkspace } from './types'

const FIXTURE_NOW = '2026-04-02T12:00:00.000Z'

function buildSubmission(
  manifest: typeof examplePublicFlashcardsManifest | typeof exampleAuthenticatedPlannerManifest,
  category: string
) {
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
    submittedAt: FIXTURE_NOW,
  })
}

class TrustReviewWorkspaceImpl implements TrustReviewWorkspace {
  private readonly registryRepository = new InMemoryAppRegistryRepository()
  private readonly securityRepository = new InMemoryAppSecurityRepository()
  private readonly registry = new AppRegistryService(this.registryRepository, {
    now: () => FIXTURE_NOW,
  })
  private readonly security = new AppSecurityService(this.securityRepository, {
    now: () => FIXTURE_NOW,
  })
  private readonly workflow = new AppReviewWorkflowService(this.registryRepository, this.security, {
    now: () => FIXTURE_NOW,
  })
  private seedPromise: Promise<void> | null = null

  private async ensureSeeded() {
    if (!this.seedPromise) {
      this.seedPromise = this.seed()
    }

    await this.seedPromise
  }

  private async seed() {
    const flashcards = await this.registry.registerApp({
      submission: buildSubmission(examplePublicFlashcardsManifest, 'study'),
      registrationSource: 'partner-submission',
    })
    const planner = await this.registry.registerApp({
      submission: buildSubmission(exampleAuthenticatedPlannerManifest, 'productivity'),
      registrationSource: 'partner-submission',
    })
    await this.registry.registerApp({
      manifest: exampleInternalChessManifest,
      category: 'games',
      registrationSource: 'platform-seed',
    })

    if (planner.ok) {
      await this.workflow.startReview({
        appId: planner.value.appId,
        reviewedByUserId: 'reviewer.platform',
        notes: 'OAuth harness evidence attached.',
      })
    }

    if (flashcards.ok) {
      await this.workflow.startReview({
        appId: flashcards.value.appId,
        reviewedByUserId: 'reviewer.platform',
        notes: 'Flashcards review opened for curriculum QA.',
      })
      await this.workflow.recordDecision({
        appId: flashcards.value.appId,
        reviewedByUserId: 'reviewer.platform',
        action: 'request-remediation',
        decisionSummary: 'Needs clearer student-facing privacy copy before staging approval.',
        notes: 'The visible staging build is close, but the privacy language is too generic for K-12 review.',
        ageRating: 'all-ages',
        dataAccessLevel: 'minimal',
        permissionsSnapshot: [...flashcards.value.currentVersion.manifest.permissions],
        remediationItems: [
          {
            code: 'privacy-copy',
            summary: 'Clarify what student profile data is used inside the flashcards flow.',
            recommendation: 'Update the privacy/help text and resubmit screenshots from the staging build.',
            field: 'privacyPolicyUrl',
            blocking: true,
          },
        ],
      })
    }
  }

  async listQueue(reviewState?: TrustReviewQueueState) {
    await this.ensureSeeded()
    const queue = await this.workflow.listQueue(reviewState)

    return queue.map((item) => ({
      ...item,
      reviewHarnessSearch: buildHarnessSearch(item),
      launchabilityLabel: buildLaunchabilityLabel(item),
    }))
  }

  async getReviewContext(appId: string, appVersionId?: string) {
    await this.ensureSeeded()
    return this.workflow.getReviewContext({ appId, appVersionId })
  }

  async startReview(request: Parameters<TrustReviewWorkspace['startReview']>[0]) {
    await this.ensureSeeded()
    return this.workflow.startReview(request)
  }

  async recordDecision(request: Parameters<TrustReviewWorkspace['recordDecision']>[0]) {
    await this.ensureSeeded()
    return this.workflow.recordDecision(request)
  }
}

let singleton: TrustReviewWorkspaceImpl | null = null

export function getTrustReviewWorkspace() {
  singleton ??= new TrustReviewWorkspaceImpl()
  return singleton
}

function buildHarnessSearch(item: AppReviewQueueItem): TrustReviewQueueEntry['reviewHarnessSearch'] {
  const entryUrl =
    item.slug === 'planner-connect'
      ? 'https://planner.tutorme.ai/dashboard'
      : item.slug === 'flashcards-coach'
        ? 'https://flashcards.tutorme.ai/study'
        : 'https://chess.tutorme.ai/board'

  const targetOrigin = new URL(entryUrl).origin
  const authState = item.authType === 'oauth2' ? 'required' : 'not-required'

  return {
    appId: item.appId,
    appVersionId: item.appVersionId,
    appName: item.name,
    entryUrl,
    targetOrigin,
    allowedOrigins: targetOrigin,
    conversationId: `review.${item.appId}.conversation`,
    appSessionId: `review.${item.appId}.session`,
    reviewerUserId: item.reviewedByUserId ?? 'reviewer.platform',
    authState,
    reviewerNotes: item.reviewerNotes,
  }
}

function buildLaunchabilityLabel(item: AppReviewQueueItem) {
  if (item.reviewState === 'approved-staging') {
    return 'staging-ready'
  }

  if (item.reviewState === 'review-pending') {
    return 'under-review'
  }

  if (item.reviewState === 'submitted') {
    return 'awaiting-review'
  }

  if (item.reviewState === 'suspended') {
    return 'suspended'
  }

  if (item.reviewState === 'rejected') {
    return 'blocked'
  }

  return item.runtimeReviewStatus
}
