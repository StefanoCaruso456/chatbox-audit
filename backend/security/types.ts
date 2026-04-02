import type {
  AppAgeRating,
  AppAuthType,
  AppDataAccessLevel,
  AppDistribution,
  AppManifest,
  AppReviewStatus,
  JsonObject,
  UIEmbedConfig,
} from '@shared/contracts/v1'
import type { BackendFailureResult, BackendResult } from '../errors'
import type { AppRegistryRecord } from '../registry/types'

export interface AppSecurityReviewRecord {
  appReviewRecordId: string
  appId: string
  appVersionId?: string
  reviewedByUserId?: string
  reviewStatus: AppReviewStatus
  ageRating: AppAgeRating
  dataAccessLevel: AppDataAccessLevel
  permissionsSnapshot: string[]
  notes?: string
  createdAt: string
  decidedAt?: string
  metadata: JsonObject
}

export interface RecordAppSecurityReviewRequest {
  appReviewRecordId?: string
  appId: string
  appVersionId?: string
  reviewedByUserId?: string
  reviewStatus: AppReviewStatus
  ageRating: AppAgeRating
  dataAccessLevel: AppDataAccessLevel
  permissionsSnapshot: string[]
  notes?: string
  createdAt?: string
  decidedAt?: string
  metadata?: JsonObject
}

export interface GetLatestAppSecurityReviewRequest {
  appId: string
  appVersionId?: string
}

export interface AppSecurityReviewTransition {
  fromStatus: AppReviewStatus | null
  toStatus: AppReviewStatus
  allowed: boolean
  reason: string
}

export type AppSecurityErrorCode =
  | 'invalid-request'
  | 'review-not-found'
  | 'invalid-review-transition'
  | 'review-already-final'
  | 'empty-origin-set'
  | 'unsafe-wildcard-usage'
  | 'origin-not-allowed'
  | 'invalid-csp-policy'
  | 'app-not-launchable'

export type AppSecurityFailure = BackendFailureResult<AppSecurityErrorCode, 'security'>
export type AppSecurityResult<T> = BackendResult<T, AppSecurityErrorCode, 'security'>

export interface AppSecurityRepository {
  getLatestReview(request: GetLatestAppSecurityReviewRequest): Promise<AppSecurityReviewRecord | undefined>
  listReviews(appId: string): Promise<AppSecurityReviewRecord[]>
  saveReview(record: AppSecurityReviewRecord): Promise<void>
}

export interface BuildIframeEmbeddingPolicyInput {
  appId: string
  appVersionId: string
  entryUrl: string
  targetOrigin: string
  allowedOrigins: string[]
  sandbox: NonNullable<AppManifest['uiEmbedConfig']>['sandbox']
  loadingStrategy: UIEmbedConfig['loadingStrategy']
}

export interface AppIframeEmbeddingPolicy {
  appId: string
  appVersionId: string
  entryUrl: string
  targetOrigin: string
  allowedOrigins: string[]
  sandboxAttribute: string
  loadingStrategy: UIEmbedConfig['loadingStrategy']
  csp: AppSecurityCspPolicy
}

export interface AppSecurityCspPolicy {
  directives: Record<string, string[]>
  headerValue: string
  headers: Record<string, string>
}

export interface BuildPlatformCspPolicyInput {
  clientOrigin: string
  backendOrigin: string
  approvedAppOrigins: string[]
  extraConnectOrigins?: string[]
  allowInlineStyles?: boolean
}

export interface AppSecurityHeaders {
  headers: Record<string, string>
  csp: AppSecurityCspPolicy
}

export interface AppLaunchabilityRequest {
  app: AppRegistryRecord
  requestedOrigin?: string
  clientOrigin: string
  backendOrigin: string
}

export interface AppLaunchabilityDecision {
  appId: string
  appVersionId: string
  launchable: true
  reviewStatus: AppReviewStatus
  distribution: AppDistribution
  authType: AppAuthType
  allowedOrigins: string[]
  targetOrigin: string
  iframePolicy: AppIframeEmbeddingPolicy
  platformSecurity: AppSecurityHeaders
}

export interface SyncAppReviewStatusRequest {
  app: AppRegistryRecord
  review?: AppSecurityReviewRecord
}

export type AppSecuritySyncResult = AppSecurityResult<AppRegistryRecord>
