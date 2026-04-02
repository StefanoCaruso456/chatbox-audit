import type { AppAuthType, AppDistribution, AppManifest, AppReviewStatus } from '@shared/contracts/v1'
import type { BackendFailureResult, BackendResult } from '../errors'
import type {
  AppReviewState,
  AppSubmissionPackage,
  AppSubmissionValidationFinding,
} from '../security/submission-package'

export interface AppRegistryVersionReviewRecord {
  reviewState: AppReviewState
  runtimeReviewStatus: AppReviewStatus
  submittedAt: string
  decidedAt?: string
  reviewedByUserId?: string
  reviewRecordId?: string
  reviewerNotes?: string
  validationFindings: AppSubmissionValidationFinding[]
}

export interface AppRegistryVersionRecord {
  appVersionId: string
  appVersion: string
  manifest: AppManifest
  submission: AppSubmissionPackage
  review: AppRegistryVersionReviewRecord
  createdAt: string
}

export interface AppRegistryRecord {
  appId: string
  slug: string
  name: string
  category: string
  distribution: AppDistribution
  authType: AppAuthType
  reviewStatus: AppReviewStatus
  reviewState: AppReviewState
  currentVersionId: string
  currentVersion: AppRegistryVersionRecord
  versions: AppRegistryVersionRecord[]
  createdAt: string
  updatedAt: string
}

export interface RegisterAppRequest {
  submission?: unknown
  manifest?: unknown
  category?: string
  registrationSource?: 'partner-submission' | 'platform-seed'
}

export interface ListRegisteredAppsRequest {
  approvedOnly?: boolean
  distribution?: AppDistribution
  authType?: AppAuthType
}

export interface GetRegisteredAppRequest {
  appId?: string
  slug?: string
  approvedOnly?: boolean
}

export type AppRegistryErrorCode =
  | 'invalid-manifest'
  | 'invalid-submission-package'
  | 'invalid-category'
  | 'slug-conflict'
  | 'version-conflict'
  | 'not-found'
  | 'not-approved'

export type AppRegistryFailure = BackendFailureResult<AppRegistryErrorCode, 'registry'>

export type AppRegistryResult<T> = BackendResult<T, AppRegistryErrorCode, 'registry'>
