import { failureResult } from '../errors'
import type { AppRegistryRepository } from '../registry/repository'
import type { AppRegistryRecord, AppRegistryVersionRecord } from '../registry/types'
import { AppSecurityService } from './service'
import type { AppReviewState } from './submission-package'
import type {
  AppReviewContext,
  AppReviewDecisionAction,
  AppReviewQueueItem,
  AppSecurityFailure,
  AppSecurityResult,
  AppSecurityReviewRecord,
  GetAppReviewContextRequest,
  RecordReviewerDecisionRequest,
  RecordReviewerDecisionResult,
  StartAppReviewRequest,
} from './types'

export interface AppReviewWorkflowServiceOptions {
  now?: () => string
}

type ResolvedAppVersion = {
  app: AppRegistryRecord
  version: AppRegistryVersionRecord
}

export class AppReviewWorkflowService {
  private readonly now: () => string

  constructor(
    private readonly registryRepository: AppRegistryRepository,
    private readonly securityService: AppSecurityService,
    options: AppReviewWorkflowServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  async listQueue(reviewState?: AppReviewState): Promise<AppReviewQueueItem[]> {
    const apps = await this.registryRepository.list()

    return apps
      .filter((app) => {
        if (reviewState) {
          return app.currentVersion.review.reviewState === reviewState
        }

        return app.currentVersion.review.reviewState !== 'approved-production' && app.currentVersion.review.reviewState !== 'retired'
      })
      .map((app) => ({
        appId: app.appId,
        appVersionId: app.currentVersion.appVersionId,
        name: app.name,
        slug: app.slug,
        category: app.category,
        distribution: app.distribution,
        authType: app.authType,
        reviewState: app.currentVersion.review.reviewState,
        runtimeReviewStatus: app.currentVersion.review.runtimeReviewStatus,
        submittedAt: app.currentVersion.review.submittedAt,
        reviewedByUserId: app.currentVersion.review.reviewedByUserId,
        reviewerNotes: app.currentVersion.review.reviewerNotes,
      }))
      .sort((left, right) => {
        return `${left.reviewState}:${left.name}`.localeCompare(`${right.reviewState}:${right.name}`)
      })
  }

  async getReviewContext(request: GetAppReviewContextRequest): Promise<AppSecurityResult<AppReviewContext>> {
    const resolved = await this.resolveAppVersion(request.appId, request.appVersionId)
    if (!resolved.ok) {
      return resolved
    }

    const reviews = await this.securityService.listReviews(resolved.value.app.appId)
    const filteredReviews = request.appVersionId
      ? reviews.filter((review) => review.appVersionId === request.appVersionId)
      : reviews

    return {
      ok: true,
      value: {
        app: resolved.value.app,
        reviews: filteredReviews,
      },
    }
  }

  async startReview(request: StartAppReviewRequest): Promise<AppSecurityResult<RecordReviewerDecisionResult>> {
    const resolved = await this.resolveAppVersion(request.appId, request.appVersionId)
    if (!resolved.ok) {
      return resolved
    }

    const transition = this.evaluateStartTransition(resolved.value.version.review.reviewState)
    if (!transition.ok) {
      return transition
    }

    const review = await this.securityService.recordReview({
      appId: resolved.value.app.appId,
      appVersionId: resolved.value.version.appVersionId,
      reviewedByUserId: request.reviewedByUserId,
      reviewStatus: 'pending',
      reviewState: 'review-pending',
      decisionAction: 'start-review',
      decisionSummary: 'Review session started.',
      ageRating: resolved.value.version.manifest.safetyMetadata.ageRating,
      dataAccessLevel: resolved.value.version.manifest.safetyMetadata.dataAccessLevel,
      permissionsSnapshot: [...resolved.value.version.manifest.permissions],
      notes: request.notes,
      decidedAt: this.now(),
      metadata: {
        workflow: 'phase4-reviewer-workflow',
        sourceState: resolved.value.version.review.reviewState,
      },
    })
    if (!review.ok) {
      return review
    }

    const updated = this.applyReviewToRegistryRecord(resolved.value.app, resolved.value.version.appVersionId, review.value)
    await this.registryRepository.save(updated)

    return {
      ok: true,
      value: {
        app: updated,
        review: review.value,
      },
    }
  }

  async recordDecision(
    request: RecordReviewerDecisionRequest
  ): Promise<AppSecurityResult<RecordReviewerDecisionResult>> {
    const resolved = await this.resolveAppVersion(request.appId, request.appVersionId)
    if (!resolved.ok) {
      return resolved
    }

    const next = this.evaluateDecisionTransition(resolved.value.version.review.reviewState, request.action)
    if (!next.ok) {
      return next
    }

    const review = await this.securityService.recordReview({
      appId: resolved.value.app.appId,
      appVersionId: resolved.value.version.appVersionId,
      reviewedByUserId: request.reviewedByUserId,
      reviewStatus: next.value.runtimeReviewStatus,
      reviewState: next.value.reviewState,
      decisionAction: request.action,
      decisionSummary: request.decisionSummary,
      remediationItems: request.remediationItems,
      ageRating: request.ageRating,
      dataAccessLevel: request.dataAccessLevel,
      permissionsSnapshot: request.permissionsSnapshot,
      notes: request.notes,
      decidedAt: this.now(),
      metadata: {
        ...request.metadata,
        workflow: 'phase4-reviewer-workflow',
        previousReviewState: resolved.value.version.review.reviewState,
      },
    })
    if (!review.ok) {
      return review
    }

    const updated = this.applyReviewToRegistryRecord(resolved.value.app, resolved.value.version.appVersionId, review.value)
    await this.registryRepository.save(updated)

    return {
      ok: true,
      value: {
        app: updated,
        review: review.value,
      },
    }
  }

  private applyReviewToRegistryRecord(
    app: AppRegistryRecord,
    appVersionId: string,
    review: AppSecurityReviewRecord
  ): AppRegistryRecord {
    const next = structuredClone(app)

    next.versions = next.versions.map((version) => {
      if (version.appVersionId !== appVersionId) {
        return version
      }

      return {
        ...version,
        manifest: {
          ...version.manifest,
          safetyMetadata: {
            ...version.manifest.safetyMetadata,
            reviewStatus: review.reviewStatus,
            reviewedAt: review.decidedAt ?? review.createdAt,
            reviewedBy: review.reviewedByUserId,
            notes: review.decisionSummary ?? review.notes,
          },
        },
        review: {
          ...version.review,
          reviewState: review.reviewState ?? version.review.reviewState,
          runtimeReviewStatus: review.reviewStatus,
          reviewedByUserId: review.reviewedByUserId ?? version.review.reviewedByUserId,
          reviewerNotes: review.notes ?? version.review.reviewerNotes,
          reviewRecordId: review.appReviewRecordId,
          decidedAt: review.decidedAt ?? review.createdAt,
        },
      }
    })

    const nextCurrentVersion = next.versions.find((version) => version.appVersionId === next.currentVersionId) ?? next.currentVersion
    next.currentVersion = nextCurrentVersion
    next.reviewStatus = nextCurrentVersion.review.runtimeReviewStatus
    next.reviewState = nextCurrentVersion.review.reviewState
    next.updatedAt = review.decidedAt ?? review.createdAt

    return next
  }

  private async resolveAppVersion(
    appId: string,
    requestedAppVersionId?: string
  ): Promise<AppSecurityResult<ResolvedAppVersion>> {
    const normalizedAppId = appId.trim()
    if (!normalizedAppId) {
      return this.failure('invalid-request', 'appId is required.')
    }

    const app = await this.registryRepository.getByAppId(normalizedAppId)
    if (!app) {
      return this.failure('app-not-found', `No registered app matched appId "${normalizedAppId}".`)
    }

    const version = requestedAppVersionId
      ? app.versions.find((candidate) => candidate.appVersionId === requestedAppVersionId)
      : app.currentVersion

    if (!version) {
      return this.failure(
        'app-version-not-found',
        `No registered app version matched "${requestedAppVersionId}" for "${normalizedAppId}".`
      )
    }

    return {
      ok: true,
      value: {
        app,
        version,
      },
    }
  }

  private evaluateStartTransition(reviewState: AppReviewState): AppSecurityResult<{ nextState: 'review-pending' }> {
    if (reviewState === 'submitted' || reviewState === 'suspended') {
      return {
        ok: true,
        value: {
          nextState: 'review-pending',
        },
      }
    }

    return this.failure(
      'invalid-review-state-transition',
      `Cannot start a review session from reviewState "${reviewState}".`
    )
  }

  private evaluateDecisionTransition(
    reviewState: AppReviewState,
    action: Exclude<AppReviewDecisionAction, 'start-review'>
  ): AppSecurityResult<{ reviewState: AppReviewState; runtimeReviewStatus: AppSecurityReviewRecord['reviewStatus'] }> {
    if (action === 'approve-staging') {
      if (reviewState !== 'review-pending') {
        return this.failure(
          'invalid-review-state-transition',
          `Cannot approve staging from reviewState "${reviewState}".`
        )
      }

      return {
        ok: true,
        value: {
          reviewState: 'approved-staging',
          runtimeReviewStatus: 'pending',
        },
      }
    }

    if (action === 'approve-production') {
      if (reviewState !== 'review-pending' && reviewState !== 'approved-staging') {
        return this.failure(
          'invalid-review-state-transition',
          `Cannot approve production from reviewState "${reviewState}".`
        )
      }

      return {
        ok: true,
        value: {
          reviewState: 'approved-production',
          runtimeReviewStatus: 'approved',
        },
      }
    }

    if (action === 'request-remediation' || action === 'reject') {
      if (reviewState !== 'review-pending' && reviewState !== 'approved-staging') {
        return this.failure(
          'invalid-review-state-transition',
          `Cannot ${action} from reviewState "${reviewState}".`
        )
      }

      return {
        ok: true,
        value: {
          reviewState: 'rejected',
          runtimeReviewStatus: 'blocked',
        },
      }
    }

    if (action === 'suspend') {
      if (reviewState !== 'approved-staging' && reviewState !== 'approved-production') {
        return this.failure('invalid-review-state-transition', `Cannot suspend from reviewState "${reviewState}".`)
      }

      return {
        ok: true,
        value: {
          reviewState: 'suspended',
          runtimeReviewStatus: 'blocked',
        },
      }
    }

    return this.failure('invalid-request', `Unsupported reviewer decision action "${action}".`)
  }

  private failure(
    code: AppSecurityFailure['code'],
    message: string,
    details?: string[]
  ): AppSecurityFailure {
    return failureResult('security', code, message, { details })
  }
}
