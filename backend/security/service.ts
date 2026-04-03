import { type AppManifest, normalizeOrigin } from '@shared/contracts/v1'
import { failureResult } from '../errors'
import type { AppRegistryRecord } from '../registry/types'
import { buildAppLaunchOriginPolicy, buildAppManifestLaunchPolicy, buildAppSecurityHeaders } from './policy'
import type {
  AppLaunchabilityDecision,
  AppLaunchabilityRequest,
  AppReviewerAccessContext,
  AppSecurityFailure,
  AppSecurityRepository,
  AppSecurityResult,
  AppSecurityReviewRecord,
  AppSecurityReviewTransition,
  GetLatestAppSecurityReviewRequest,
  RecordAppSecurityReviewRequest,
  SyncAppReviewStatusRequest,
} from './types'

export interface AppSecurityServiceOptions {
  now?: () => string
  getReviewerAccess?: (userId: string) => Promise<AppReviewerAccessContext | undefined>
}

export class AppSecurityService {
  private readonly now: () => string
  private readonly getReviewerAccess?: (userId: string) => Promise<AppReviewerAccessContext | undefined>

  constructor(
    private readonly repository: AppSecurityRepository,
    options: AppSecurityServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.getReviewerAccess = options.getReviewerAccess
  }

  async recordReview(request: RecordAppSecurityReviewRequest): Promise<AppSecurityResult<AppSecurityReviewRecord>> {
    const normalized = this.normalizeReviewRequest(request)
    if (!normalized.ok) {
      return normalized
    }

    const reviewerAccess = await this.resolveReviewerAccess(normalized.value.reviewedByUserId, normalized.value.reviewStatus)
    if (!reviewerAccess.ok) {
      return reviewerAccess
    }

    const latest = await this.repository.getLatestReview({
      appId: normalized.value.appId,
      appVersionId: normalized.value.appVersionId,
    })

    const transition = this.evaluateTransition(latest, normalized.value.reviewStatus)
    if (!transition.allowed) {
      return this.failure('invalid-review-transition', transition.reason)
    }

    if (latest && this.isSameReview(latest, normalized.value)) {
      return { ok: true, value: latest }
    }

    const createdAt = normalized.value.createdAt ?? this.now()
    const decidedAt =
      normalized.value.decidedAt ??
      (normalized.value.reviewStatus === 'pending' ? undefined : createdAt)

    const review: AppSecurityReviewRecord = {
      appReviewRecordId:
        normalized.value.appReviewRecordId ??
        this.buildReviewId(normalized.value.appId, normalized.value.appVersionId, createdAt),
      appId: normalized.value.appId,
      appVersionId: normalized.value.appVersionId,
      reviewedByUserId: normalized.value.reviewedByUserId,
      reviewedByRole: reviewerAccess.value?.role,
      reviewStatus: normalized.value.reviewStatus,
      ageRating: normalized.value.ageRating,
      dataAccessLevel: normalized.value.dataAccessLevel,
      permissionsSnapshot: [...normalized.value.permissionsSnapshot],
      notes: normalized.value.notes,
      createdAt,
      decidedAt,
      metadata: structuredClone(normalized.value.metadata ?? {}),
    }

    await this.repository.saveReview(review)
    return { ok: true, value: review }
  }

  async getLatestReview(
    request: GetLatestAppSecurityReviewRequest
  ): Promise<AppSecurityResult<AppSecurityReviewRecord | undefined>> {
    const appId = this.normalizeText(request.appId)
    if (!appId) {
      return this.failure('invalid-request', 'appId is required to fetch the latest review.')
    }

    const review = await this.repository.getLatestReview({
      appId,
      appVersionId: this.normalizeOptionalText(request.appVersionId),
    })

    return { ok: true, value: review }
  }

  async listReviews(appId: string): Promise<AppSecurityReviewRecord[]> {
    const normalizedAppId = this.normalizeText(appId)
    if (!normalizedAppId) {
      return []
    }

    return this.repository.listReviews(normalizedAppId)
  }

  async syncAppReviewStatus(request: SyncAppReviewStatusRequest): Promise<AppSecurityResult<AppRegistryRecord>> {
    const review = request.review ?? (await this.repository.getLatestReview({ appId: request.app.appId }))
    return {
      ok: true,
      value: this.syncRegistryRecordWithReview(request.app, review),
    }
  }

  private async resolveReviewerAccess(
    reviewedByUserId: string | undefined,
    reviewStatus: AppSecurityReviewRecord['reviewStatus']
  ): Promise<AppSecurityResult<AppReviewerAccessContext | undefined>> {
    if (!this.getReviewerAccess) {
      return { ok: true, value: undefined }
    }

    if (!reviewedByUserId) {
      return this.failure('reviewer-not-authorized', 'A stored reviewer role is required to record app reviews.')
    }

    const reviewerAccess = await this.getReviewerAccess(reviewedByUserId)
    if (!reviewerAccess) {
      return this.failure(
        'reviewer-not-authorized',
        `User "${reviewedByUserId}" does not have a reviewer profile with role-based safety permissions.`
      )
    }

    const hasPermission =
      (reviewStatus === 'pending' && reviewerAccess.permissions.canStartAppReview) ||
      (reviewStatus === 'approved' && reviewerAccess.permissions.canApproveApp) ||
      (reviewStatus === 'blocked' && reviewerAccess.permissions.canBlockApp)

    if (!hasPermission) {
      return this.failure(
        'reviewer-not-authorized',
        `Role "${reviewerAccess.role}" cannot record a "${reviewStatus}" app review decision.`
      )
    }

    return {
      ok: true,
      value: reviewerAccess,
    }
  }

  async evaluateLaunchability(request: AppLaunchabilityRequest): Promise<AppSecurityResult<AppLaunchabilityDecision>> {
    const synced = await this.syncAppReviewStatus({ app: request.app })
    if (!synced.ok) {
      return synced
    }

    const app = synced.value
    if (app.reviewStatus !== 'approved') {
      return this.failure(
        'app-not-launchable',
        `App "${app.appId}" is not approved for launch (status: ${app.reviewStatus}).`
      )
    }

    const policy = buildAppLaunchOriginPolicy(app)
    if (!policy.ok) {
      return policy
    }

    const requestedOrigin = request.requestedOrigin ? normalizeOrigin(request.requestedOrigin) : policy.value.targetOrigin
    if (requestedOrigin !== policy.value.targetOrigin) {
      return this.failure(
        'origin-not-allowed',
        `Requested origin "${requestedOrigin}" is not allowed for app "${app.appId}".`
      )
    }

    const platformSecurity = buildAppSecurityHeaders({
      clientOrigin: request.clientOrigin,
      backendOrigin: request.backendOrigin,
      approvedAppOrigins: policy.value.allowedOrigins,
    })
    if (!platformSecurity.ok) {
      return platformSecurity
    }

    return {
      ok: true,
      value: {
        appId: app.appId,
        appVersionId: app.currentVersionId,
        launchable: true,
        reviewStatus: app.reviewStatus,
        distribution: app.distribution,
        authType: app.authType,
        allowedOrigins: policy.value.allowedOrigins,
        targetOrigin: policy.value.targetOrigin,
        iframePolicy: policy.value,
        platformSecurity: platformSecurity.value,
      },
    }
  }

  buildIframePolicy(manifest: AppManifest) {
    return buildAppManifestLaunchPolicy(manifest)
  }

  private syncRegistryRecordWithReview(app: AppRegistryRecord, review?: AppSecurityReviewRecord): AppRegistryRecord {
    if (!review) {
      return structuredClone(app)
    }

    const next = structuredClone(app)
    next.reviewStatus = review.reviewStatus

    const currentVersion = next.currentVersion
    currentVersion.manifest.safetyMetadata = {
      ...currentVersion.manifest.safetyMetadata,
      reviewStatus: review.reviewStatus,
      reviewedAt: review.decidedAt ?? review.createdAt,
      reviewedBy: review.reviewedByUserId,
      notes: review.notes,
    }
    next.currentVersion = currentVersion

    next.versions = next.versions.map((version) => {
      if (version.appVersionId !== currentVersion.appVersionId) {
        return version
      }

      return {
        ...version,
        manifest: {
          ...version.manifest,
          safetyMetadata: currentVersion.manifest.safetyMetadata,
        },
      }
    })

    return next
  }

  private evaluateTransition(
    latest: AppSecurityReviewRecord | undefined,
    nextStatus: AppSecurityReviewRecord['reviewStatus']
  ): AppSecurityReviewTransition {
    if (!latest) {
      return {
        fromStatus: null,
        toStatus: nextStatus,
        allowed: true,
        reason: 'initial review',
      }
    }

    if (latest.reviewStatus === 'pending') {
      if (nextStatus === 'pending') {
        return {
          fromStatus: latest.reviewStatus,
          toStatus: nextStatus,
          allowed: true,
          reason: 'idempotent pending review',
        }
      }

      return {
        fromStatus: latest.reviewStatus,
        toStatus: nextStatus,
        allowed: true,
        reason: 'pending review can be finalized',
      }
    }

    if (latest.reviewStatus === nextStatus) {
      return {
        fromStatus: latest.reviewStatus,
        toStatus: nextStatus,
        allowed: true,
        reason: 'final review is idempotent',
      }
    }

    return {
      fromStatus: latest.reviewStatus,
      toStatus: nextStatus,
      allowed: false,
      reason: `Review for this app version is already final with status "${latest.reviewStatus}".`,
    }
  }

  private isSameReview(
    left: AppSecurityReviewRecord,
    right: Pick<
      AppSecurityReviewRecord,
      'appId' | 'appVersionId' | 'reviewStatus' | 'ageRating' | 'dataAccessLevel' | 'permissionsSnapshot' | 'notes'
    >
  ): boolean {
    return (
      left.appId === right.appId &&
      left.appVersionId === right.appVersionId &&
      left.reviewStatus === right.reviewStatus &&
      left.ageRating === right.ageRating &&
      left.dataAccessLevel === right.dataAccessLevel &&
      JSON.stringify(left.permissionsSnapshot) === JSON.stringify(right.permissionsSnapshot) &&
      left.notes === right.notes
    )
  }

  private normalizeReviewRequest(
    request: RecordAppSecurityReviewRequest
  ):
    | AppSecurityResult<{
        appReviewRecordId?: string
        appId: string
        appVersionId?: string
        reviewedByUserId?: string
        reviewStatus: AppSecurityReviewRecord['reviewStatus']
        ageRating: AppSecurityReviewRecord['ageRating']
        dataAccessLevel: AppSecurityReviewRecord['dataAccessLevel']
        permissionsSnapshot: string[]
        notes?: string
        createdAt?: string
        decidedAt?: string
        metadata?: AppSecurityReviewRecord['metadata']
      }>
    | AppSecurityFailure {
    const appId = this.normalizeText(request.appId)
    if (!appId) {
      return this.failure('invalid-request', 'appId is required.')
    }

    const appVersionId = this.normalizeOptionalText(request.appVersionId)
    const reviewedByUserId = this.normalizeOptionalText(request.reviewedByUserId)
    const notes = this.normalizeOptionalText(request.notes)
    const createdAt = this.normalizeOptionalText(request.createdAt)
    const decidedAt = this.normalizeOptionalText(request.decidedAt)
    const permissionsSnapshot = this.normalizePermissions(request.permissionsSnapshot)
    if (!permissionsSnapshot.ok) {
      return permissionsSnapshot
    }

    const metadata = request.metadata ?? {}
    const appReviewRecordId = this.normalizeOptionalText(request.appReviewRecordId)

    return {
      ok: true,
      value: {
        appReviewRecordId,
        appId,
        appVersionId,
        reviewedByUserId,
        reviewStatus: request.reviewStatus,
        ageRating: request.ageRating,
        dataAccessLevel: request.dataAccessLevel,
        permissionsSnapshot: permissionsSnapshot.value,
        notes: notes ?? undefined,
        createdAt: createdAt ?? undefined,
        decidedAt: decidedAt ?? undefined,
        metadata,
      },
    }
  }

  private normalizePermissions(permissions: string[]): AppSecurityResult<string[]> {
    if (!Array.isArray(permissions)) {
      return this.failure('invalid-request', 'permissionsSnapshot must be an array.')
    }

    const normalized = permissions
      .map((permission) => this.normalizeText(permission))
      .filter((permission): permission is string => Boolean(permission))

    const unique = new Set(normalized)
    if (unique.size !== normalized.length) {
      return this.failure('invalid-request', 'permissionsSnapshot must not contain duplicates.')
    }

    return { ok: true, value: normalized }
  }

  private normalizeText(value: string | undefined | null): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : undefined
  }

  private normalizeOptionalText(value: string | undefined | null): string | undefined {
    return this.normalizeText(value)
  }

  private buildReviewId(appId: string, appVersionId: string | undefined, createdAt: string): string {
    return `app-review.${appId}.${appVersionId ?? 'latest'}.${createdAt}`
  }

  private failure(
    code: AppSecurityFailure['code'],
    message: string,
    details?: string[]
  ): AppSecurityFailure {
    return failureResult('security', code, message, { details })
  }
}
