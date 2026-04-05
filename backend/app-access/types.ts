import type { JsonObject } from '@shared/contracts/v1'
import type { TutorMeAIUserRole } from '@shared/types/settings'
import type { BackendFailureResult, BackendResult } from '../errors'

export type AppAccessRequestStatus = 'pending' | 'approved' | 'declined'

export interface AppAccessRequestRecord {
  appAccessRequestId: string
  appId: string
  appName: string
  studentUserId: string
  studentDisplayName: string
  studentEmail: string | null
  studentRole: TutorMeAIUserRole | null
  status: AppAccessRequestStatus
  decisionReason: string | null
  decidedByUserId: string | null
  decidedByDisplayName: string | null
  requestedAt: string
  decidedAt: string | null
  createdAt: string
  updatedAt: string
  metadata: JsonObject
}

export interface CreateAppAccessRequestInput {
  appId: string
  appName: string
  studentUserId: string
  studentDisplayName: string
  studentEmail: string | null
  studentRole: TutorMeAIUserRole | null
  metadata?: JsonObject
}

export interface DecideAppAccessRequestInput {
  appAccessRequestId: string
  status: Extract<AppAccessRequestStatus, 'approved' | 'declined'>
  decidedByUserId: string
  decidedByDisplayName: string
  decisionReason?: string | null
}

export type AppAccessErrorCode =
  | 'invalid-request'
  | 'app-access-forbidden'
  | 'app-access-request-not-found'
  | 'app-access-request-already-decided'

export type AppAccessFailure = BackendFailureResult<AppAccessErrorCode, 'app-access'>
export type AppAccessResult<T> = BackendResult<T, AppAccessErrorCode, 'app-access'>

export interface PublicAppAccessRequest {
  appAccessRequestId: string
  appId: string
  appName: string
  studentUserId: string
  studentDisplayName: string
  studentEmail: string | null
  studentRole: TutorMeAIUserRole | null
  status: AppAccessRequestStatus
  decisionReason: string | null
  decidedByUserId: string | null
  decidedByDisplayName: string | null
  requestedAt: string
  decidedAt: string | null
  updatedAt: string
}
