import type { AppAuthType, AppDistribution, AppManifest, AppReviewStatus } from '@shared/contracts/v1'

export interface AppRegistryVersionRecord {
  appVersionId: string
  appVersion: string
  manifest: AppManifest
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
  currentVersionId: string
  currentVersion: AppRegistryVersionRecord
  versions: AppRegistryVersionRecord[]
  createdAt: string
  updatedAt: string
}

export interface RegisterAppRequest {
  manifest: unknown
  category: string
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
  | 'invalid-category'
  | 'slug-conflict'
  | 'version-conflict'
  | 'not-found'
  | 'not-approved'

export interface AppRegistrySuccess<T> {
  ok: true
  value: T
}

export interface AppRegistryFailure {
  ok: false
  code: AppRegistryErrorCode
  message: string
  details?: string[]
}

export type AppRegistryResult<T> = AppRegistrySuccess<T> | AppRegistryFailure
