export const REVIEW_HARNESS_EVENT_TYPES = [
  'iframe-load',
  'runtime-state',
  'completion',
  'runtime-error',
  'heartbeat-timeout',
  'raw-message',
  'reviewer-note',
  'reviewer-finding',
] as const

export type ReviewHarnessEventType = (typeof REVIEW_HARNESS_EVENT_TYPES)[number]

export type ReviewHarnessActor = 'platform' | 'runtime' | 'reviewer'

export type ReviewHarnessRawMessageDirection = 'host-to-iframe' | 'iframe-to-host' | 'unknown'

export type ReviewHarnessReviewSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export type ReviewHarnessCompletionStatus = 'succeeded' | 'failed' | 'cancelled'

export type ReviewHarnessFindingStatus = 'open' | 'resolved' | 'dismissed'

export type ReviewHarnessJsonPrimitive = string | number | boolean | null

export type ReviewHarnessJsonValue =
  | ReviewHarnessJsonPrimitive
  | ReviewHarnessJsonValue[]
  | {
      [key: string]: ReviewHarnessJsonValue
    }

export interface ReviewHarnessBaseEvent {
  id: string
  type: ReviewHarnessEventType
  timestamp: string
  sessionId: string
  conversationId: string
  actor: ReviewHarnessActor
  appId?: string
  appSessionId?: string
}

export interface ReviewHarnessIframeLoadEvent extends ReviewHarnessBaseEvent {
  type: 'iframe-load'
  iframeUrl: string
  origin: string
  status: 'loading' | 'loaded' | 'failed'
  loadMs?: number
  frameTitle?: string
  errorMessage?: string
}

export interface ReviewHarnessRuntimeStateEvent extends ReviewHarnessBaseEvent {
  type: 'runtime-state'
  state: Record<string, ReviewHarnessJsonValue>
  stateLabel?: string
  sequence?: number
}

export interface ReviewHarnessCompletionEvent extends ReviewHarnessBaseEvent {
  type: 'completion'
  status: ReviewHarnessCompletionStatus
  resultSummary: string
  result?: ReviewHarnessJsonValue
  toolCallId?: string
}

export interface ReviewHarnessRuntimeErrorEvent extends ReviewHarnessBaseEvent {
  type: 'runtime-error'
  errorName?: string
  message: string
  stack?: string
  recoverable?: boolean
}

export interface ReviewHarnessHeartbeatTimeoutEvent extends ReviewHarnessBaseEvent {
  type: 'heartbeat-timeout'
  timeoutMs: number
  lastHeartbeatAt?: string
  missedHeartbeats?: number
  reason?: string
}

export interface ReviewHarnessRawMessageEvent extends ReviewHarnessBaseEvent {
  type: 'raw-message'
  direction: ReviewHarnessRawMessageDirection
  message: unknown
  messageType?: string
  origin?: string
  correlationId?: string
}

export interface ReviewHarnessReviewerNoteEvent extends ReviewHarnessBaseEvent {
  type: 'reviewer-note'
  note: string
  severity: ReviewHarnessReviewSeverity
  tags?: string[]
  relatedEventId?: string
}

export interface ReviewHarnessReviewerFindingEvent extends ReviewHarnessBaseEvent {
  type: 'reviewer-finding'
  title: string
  summary: string
  severity: ReviewHarnessReviewSeverity
  status: ReviewHarnessFindingStatus
  recommendation?: string
  evidence?: string[]
  relatedEventId?: string
}

export type ReviewHarnessEvent =
  | ReviewHarnessIframeLoadEvent
  | ReviewHarnessRuntimeStateEvent
  | ReviewHarnessCompletionEvent
  | ReviewHarnessRuntimeErrorEvent
  | ReviewHarnessHeartbeatTimeoutEvent
  | ReviewHarnessRawMessageEvent
  | ReviewHarnessReviewerNoteEvent
  | ReviewHarnessReviewerFindingEvent

export type ReviewHarnessLog = ReviewHarnessEvent[]

export interface ReviewHarnessEventInputBase {
  id?: string
  timestamp?: string
  sessionId: string
  conversationId: string
  actor?: ReviewHarnessActor
  appId?: string
  appSessionId?: string
}

export interface ReviewHarnessIframeLoadEventInput extends ReviewHarnessEventInputBase {
  iframeUrl: string
  origin: string
  status?: ReviewHarnessIframeLoadEvent['status']
  loadMs?: number
  frameTitle?: string
  errorMessage?: string
}

export interface ReviewHarnessRuntimeStateEventInput extends ReviewHarnessEventInputBase {
  state: Record<string, ReviewHarnessJsonValue>
  stateLabel?: string
  sequence?: number
}

export interface ReviewHarnessCompletionEventInput extends ReviewHarnessEventInputBase {
  status: ReviewHarnessCompletionStatus
  resultSummary: string
  result?: ReviewHarnessJsonValue
  toolCallId?: string
}

export interface ReviewHarnessRuntimeErrorEventInput extends ReviewHarnessEventInputBase {
  errorName?: string
  message: string
  stack?: string
  recoverable?: boolean
}

export interface ReviewHarnessHeartbeatTimeoutEventInput extends ReviewHarnessEventInputBase {
  timeoutMs: number
  lastHeartbeatAt?: string
  missedHeartbeats?: number
  reason?: string
}

export interface ReviewHarnessRawMessageEventInput extends ReviewHarnessEventInputBase {
  direction?: ReviewHarnessRawMessageDirection
  message: unknown
  messageType?: string
  origin?: string
  correlationId?: string
}

export interface ReviewHarnessReviewerNoteEventInput extends ReviewHarnessEventInputBase {
  note: string
  severity?: ReviewHarnessReviewSeverity
  tags?: string[]
  relatedEventId?: string
}

export interface ReviewHarnessReviewerFindingEventInput extends ReviewHarnessEventInputBase {
  title: string
  summary: string
  severity?: ReviewHarnessReviewSeverity
  status?: ReviewHarnessFindingStatus
  recommendation?: string
  evidence?: string[]
  relatedEventId?: string
}

export type ReviewHarnessEventInput =
  | ReviewHarnessIframeLoadEventInput
  | ReviewHarnessRuntimeStateEventInput
  | ReviewHarnessCompletionEventInput
  | ReviewHarnessRuntimeErrorEventInput
  | ReviewHarnessHeartbeatTimeoutEventInput
  | ReviewHarnessRawMessageEventInput
  | ReviewHarnessReviewerNoteEventInput
  | ReviewHarnessReviewerFindingEventInput

export interface ReviewHarnessLogSummary {
  totalEvents: number
  eventCounts: Record<ReviewHarnessEventType, number>
  sessionIds: string[]
  conversationIds: string[]
  firstTimestamp?: string
  lastTimestamp?: string
  latestIframeLoad?: ReviewHarnessIframeLoadEvent
  latestRuntimeState?: ReviewHarnessRuntimeStateEvent
  latestCompletion?: ReviewHarnessCompletionEvent
  latestRuntimeError?: ReviewHarnessRuntimeErrorEvent
  latestHeartbeatTimeout?: ReviewHarnessHeartbeatTimeoutEvent
  rawMessageEvents: ReviewHarnessRawMessageEvent[]
  reviewerNotes: ReviewHarnessReviewerNoteEvent[]
  reviewerFindings: ReviewHarnessReviewerFindingEvent[]
  openFindings: ReviewHarnessReviewerFindingEvent[]
}

let eventCounter = 0

export function createReviewHarnessEventId(kind: ReviewHarnessEventType): string {
  eventCounter += 1
  return `review-harness.${kind}.${Date.now().toString(36)}.${eventCounter.toString(36)}`
}

export function createReviewHarnessEvent(input: ReviewHarnessEventInput): ReviewHarnessEvent {
  const base = normalizeBaseEvent(input)

  switch (input.type) {
    case 'iframe-load':
      return {
        ...base,
        type: 'iframe-load',
        iframeUrl: input.iframeUrl,
        origin: input.origin,
        status: input.status ?? 'loading',
        loadMs: input.loadMs,
        frameTitle: input.frameTitle,
        errorMessage: input.errorMessage,
      }
    case 'runtime-state':
      return {
        ...base,
        type: 'runtime-state',
        state: input.state,
        stateLabel: input.stateLabel,
        sequence: input.sequence,
      }
    case 'completion':
      return {
        ...base,
        type: 'completion',
        status: input.status,
        resultSummary: input.resultSummary,
        result: input.result,
        toolCallId: input.toolCallId,
      }
    case 'runtime-error':
      return {
        ...base,
        type: 'runtime-error',
        errorName: input.errorName,
        message: input.message,
        stack: input.stack,
        recoverable: input.recoverable ?? false,
      }
    case 'heartbeat-timeout':
      return {
        ...base,
        type: 'heartbeat-timeout',
        timeoutMs: input.timeoutMs,
        lastHeartbeatAt: input.lastHeartbeatAt,
        missedHeartbeats: input.missedHeartbeats,
        reason: input.reason,
      }
    case 'raw-message':
      return {
        ...base,
        type: 'raw-message',
        direction: input.direction ?? 'unknown',
        message: input.message,
        messageType: input.messageType,
        origin: input.origin,
        correlationId: input.correlationId,
      }
    case 'reviewer-note':
      return {
        ...base,
        type: 'reviewer-note',
        note: input.note,
        severity: input.severity ?? 'info',
        tags: input.tags,
        relatedEventId: input.relatedEventId,
      }
    case 'reviewer-finding':
      return {
        ...base,
        type: 'reviewer-finding',
        title: input.title,
        summary: input.summary,
        severity: input.severity ?? 'medium',
        status: input.status ?? 'open',
        recommendation: input.recommendation,
        evidence: input.evidence,
        relatedEventId: input.relatedEventId,
      }
  }
}

export function appendReviewHarnessEvent(log: ReviewHarnessLog, input: ReviewHarnessEventInput): ReviewHarnessLog {
  return [...log, createReviewHarnessEvent(input)]
}

export function appendIframeLoadEvent(
  log: ReviewHarnessLog,
  input: Omit<ReviewHarnessIframeLoadEventInput, 'type'>
): ReviewHarnessLog {
  return appendReviewHarnessEvent(log, {
    ...input,
    type: 'iframe-load',
  })
}

export function appendRuntimeStateEvent(
  log: ReviewHarnessLog,
  input: Omit<ReviewHarnessRuntimeStateEventInput, 'type'>
): ReviewHarnessLog {
  return appendReviewHarnessEvent(log, {
    ...input,
    type: 'runtime-state',
  })
}

export function appendCompletionEvent(
  log: ReviewHarnessLog,
  input: Omit<ReviewHarnessCompletionEventInput, 'type'>
): ReviewHarnessLog {
  return appendReviewHarnessEvent(log, {
    ...input,
    type: 'completion',
  })
}

export function appendRuntimeErrorEvent(
  log: ReviewHarnessLog,
  input: Omit<ReviewHarnessRuntimeErrorEventInput, 'type'>
): ReviewHarnessLog {
  return appendReviewHarnessEvent(log, {
    ...input,
    type: 'runtime-error',
  })
}

export function appendHeartbeatTimeoutEvent(
  log: ReviewHarnessLog,
  input: Omit<ReviewHarnessHeartbeatTimeoutEventInput, 'type'>
): ReviewHarnessLog {
  return appendReviewHarnessEvent(log, {
    ...input,
    type: 'heartbeat-timeout',
  })
}

export function appendRawMessageEvent(
  log: ReviewHarnessLog,
  input: Omit<ReviewHarnessRawMessageEventInput, 'type'>
): ReviewHarnessLog {
  return appendReviewHarnessEvent(log, {
    ...input,
    type: 'raw-message',
  })
}

export function appendReviewerNoteEvent(
  log: ReviewHarnessLog,
  input: Omit<ReviewHarnessReviewerNoteEventInput, 'type'>
): ReviewHarnessLog {
  return appendReviewHarnessEvent(log, {
    ...input,
    type: 'reviewer-note',
  })
}

export function appendReviewerFindingEvent(
  log: ReviewHarnessLog,
  input: Omit<ReviewHarnessReviewerFindingEventInput, 'type'>
): ReviewHarnessLog {
  return appendReviewHarnessEvent(log, {
    ...input,
    type: 'reviewer-finding',
  })
}

export function summarizeReviewHarnessLog(log: ReviewHarnessLog): ReviewHarnessLogSummary {
  const eventCounts = createEmptyEventCounts()
  const sessionIds = new Set<string>()
  const conversationIds = new Set<string>()
  const rawMessageEvents: ReviewHarnessRawMessageEvent[] = []
  const reviewerNotes: ReviewHarnessReviewerNoteEvent[] = []
  const reviewerFindings: ReviewHarnessReviewerFindingEvent[] = []

  let latestIframeLoad: ReviewHarnessIframeLoadEvent | undefined
  let latestRuntimeState: ReviewHarnessRuntimeStateEvent | undefined
  let latestCompletion: ReviewHarnessCompletionEvent | undefined
  let latestRuntimeError: ReviewHarnessRuntimeErrorEvent | undefined
  let latestHeartbeatTimeout: ReviewHarnessHeartbeatTimeoutEvent | undefined

  for (const event of log) {
    eventCounts[event.type] += 1
    sessionIds.add(event.sessionId)
    conversationIds.add(event.conversationId)

    switch (event.type) {
      case 'iframe-load':
        latestIframeLoad = event
        break
      case 'runtime-state':
        latestRuntimeState = event
        break
      case 'completion':
        latestCompletion = event
        break
      case 'runtime-error':
        latestRuntimeError = event
        break
      case 'heartbeat-timeout':
        latestHeartbeatTimeout = event
        break
      case 'raw-message':
        rawMessageEvents.push(event)
        break
      case 'reviewer-note':
        reviewerNotes.push(event)
        break
      case 'reviewer-finding':
        reviewerFindings.push(event)
        break
    }
  }

  return {
    totalEvents: log.length,
    eventCounts,
    sessionIds: [...sessionIds],
    conversationIds: [...conversationIds],
    firstTimestamp: log[0]?.timestamp,
    lastTimestamp: log.at(-1)?.timestamp,
    latestIframeLoad,
    latestRuntimeState,
    latestCompletion,
    latestRuntimeError,
    latestHeartbeatTimeout,
    rawMessageEvents,
    reviewerNotes,
    reviewerFindings,
    openFindings: reviewerFindings.filter((finding) => finding.status === 'open'),
  }
}

function normalizeBaseEvent(input: ReviewHarnessEventInput): ReviewHarnessBaseEvent {
  return {
    id: input.id ?? createReviewHarnessEventId(input.type),
    type: input.type,
    timestamp: input.timestamp ?? new Date().toISOString(),
    sessionId: input.sessionId,
    conversationId: input.conversationId,
    actor: input.actor ?? inferActor(input.type),
    appId: input.appId,
    appSessionId: input.appSessionId,
  }
}

function inferActor(type: ReviewHarnessEventType): ReviewHarnessActor {
  switch (type) {
    case 'iframe-load':
    case 'runtime-state':
    case 'completion':
    case 'runtime-error':
    case 'heartbeat-timeout':
      return 'runtime'
    case 'raw-message':
      return 'platform'
    case 'reviewer-note':
    case 'reviewer-finding':
      return 'reviewer'
  }
}

function createEmptyEventCounts(): Record<ReviewHarnessEventType, number> {
  return {
    'iframe-load': 0,
    'runtime-state': 0,
    completion: 0,
    'runtime-error': 0,
    'heartbeat-timeout': 0,
    'raw-message': 0,
    'reviewer-note': 0,
    'reviewer-finding': 0,
  }
}
