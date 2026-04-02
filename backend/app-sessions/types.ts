import type {
  AppSessionAuthState,
  AppSessionFailure,
  AppSessionLaunchReason,
  AppSessionSnapshot,
  AppSessionState,
  AppSessionStatus,
  CompletionSignal,
  JsonObject,
} from '@shared/contracts/v1'

export type AppSessionRecord = AppSessionState

export interface CreateAppSessionInput {
  appSessionId: string
  conversationId: string
  appId: string
  launchReason: AppSessionLaunchReason
  authState: AppSessionAuthState
  status?: AppSessionStatus
  currentToolCallId?: string | null
  latestSequence?: number
  latestSnapshot?: AppSessionSnapshot | null
  completion?: CompletionSignal | null
  lastError?: AppSessionFailure | null
  startedAt?: string | null
  lastActiveAt?: string | null
  completedAt?: string | null
  expiresAt?: string | null
  resumableUntil?: string | null
  metadata?: JsonObject
}

export interface UpdateAppSessionInput {
  appSessionId: string
  status?: AppSessionStatus
  authState?: AppSessionAuthState
  launchReason?: AppSessionLaunchReason
  currentToolCallId?: string | null
  latestSequence?: number
  latestSnapshot?: AppSessionSnapshot | null
  completion?: CompletionSignal | null
  lastError?: AppSessionFailure | null
  startedAt?: string | null
  lastActiveAt?: string | null
  completedAt?: string | null
  expiresAt?: string | null
  resumableUntil?: string | null
  metadata?: JsonObject
}

export interface MarkWaitingSessionInput {
  appSessionId: string
  status: 'waiting-auth' | 'waiting-user'
  authState?: AppSessionAuthState
  currentToolCallId?: string | null
  lastActiveAt?: string
  resumableUntil?: string | null
}

export interface MarkActiveSessionInput {
  appSessionId: string
  startedAt?: string
  lastActiveAt?: string
  currentToolCallId?: string | null
  authState?: AppSessionAuthState
  resumableUntil?: string | null
}

export interface MarkPausedSessionInput {
  appSessionId: string
  lastActiveAt?: string
  resumableUntil?: string | null
}

export interface MarkCompletedSessionInput {
  appSessionId: string
  completion: CompletionSignal
  latestSnapshot?: AppSessionSnapshot | null
  currentToolCallId?: string | null
}

export interface MarkFailedSessionInput {
  appSessionId: string
  error: AppSessionFailure
  currentToolCallId?: string | null
}

export interface MarkExpiredSessionInput {
  appSessionId: string
  expiredAt?: string
  currentToolCallId?: string | null
}

export interface ListAppSessionsQuery {
  conversationId?: string
  appId?: string
  activeOnly?: boolean
  resumableOnly?: boolean
  asOf?: string
}

export type AppSessionErrorCode =
  | 'not-found'
  | 'duplicate-session'
  | 'active-session-conflict'
  | 'invalid-session-state'

export interface AppSessionSuccess<T> {
  ok: true
  value: T
}

export interface AppSessionFailureResult {
  ok: false
  code: AppSessionErrorCode
  message: string
  details?: string[]
}

export type AppSessionResult<T> = AppSessionSuccess<T> | AppSessionFailureResult
