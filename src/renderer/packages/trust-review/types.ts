import type {
  AppReviewContext,
  AppReviewQueueItem,
  AppSecurityResult,
  RecordReviewerDecisionRequest,
  RecordReviewerDecisionResult,
  StartAppReviewRequest,
} from '../../../../backend/security/types'
import type { ReviewHarnessSearch } from '../review-harness/review-harness'

export type TrustReviewQueueState = AppReviewQueueItem['reviewState']

export interface TrustReviewQueueEntry extends AppReviewQueueItem {
  reviewHarnessSearch: ReviewHarnessSearch
  launchabilityLabel: string
}

export interface TrustReviewWorkspace {
  listQueue(reviewState?: TrustReviewQueueState): Promise<TrustReviewQueueEntry[]>
  getReviewContext(appId: string, appVersionId?: string): Promise<AppSecurityResult<AppReviewContext>>
  startReview(request: StartAppReviewRequest): Promise<AppSecurityResult<RecordReviewerDecisionResult>>
  recordDecision(request: RecordReviewerDecisionRequest): Promise<AppSecurityResult<RecordReviewerDecisionResult>>
}
