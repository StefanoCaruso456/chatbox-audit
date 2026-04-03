import { describe, expect, it } from 'vitest'
import {
  appendCompletionEvent,
  appendHeartbeatTimeoutEvent,
  appendIframeLoadEvent,
  appendRawMessageEvent,
  appendReviewerFindingEvent,
  appendReviewerNoteEvent,
  appendRuntimeErrorEvent,
  appendRuntimeStateEvent,
  createReviewHarnessEvent,
  type ReviewHarnessLog,
  summarizeReviewHarnessLog,
} from './-lib/review-harness-log'

describe('review-harness-log', () => {
  it('appends structured review harness events without mutating the original log', () => {
    const initialLog: ReviewHarnessLog = []

    const iframeLoaded = appendIframeLoadEvent(initialLog, {
      id: 'event.iframe-load',
      timestamp: '2026-04-01T12:00:00.000Z',
      sessionId: 'session.1',
      conversationId: 'conversation.1',
      appId: 'chess.internal',
      appSessionId: 'app-session.1',
      iframeUrl: 'http://localhost:3000/embedded-apps/chess',
      origin: 'http://localhost:3000',
      status: 'loaded',
      loadMs: 128,
      frameTitle: 'Chess Tutor',
    })
    const runtimeState = appendRuntimeStateEvent(iframeLoaded, {
      id: 'event.runtime-state',
      timestamp: '2026-04-01T12:00:01.000Z',
      sessionId: 'session.1',
      conversationId: 'conversation.1',
      appId: 'chess.internal',
      appSessionId: 'app-session.1',
      state: {
        board: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
        moveCount: 0,
      },
      stateLabel: 'board-snapshot',
      sequence: 1,
    })
    const completion = appendCompletionEvent(runtimeState, {
      id: 'event.completion',
      timestamp: '2026-04-01T12:00:02.000Z',
      sessionId: 'session.1',
      conversationId: 'conversation.1',
      appId: 'chess.internal',
      appSessionId: 'app-session.1',
      status: 'succeeded',
      resultSummary: 'Game started successfully.',
      result: {
        nextAction: 'wait-for-user-move',
      },
      toolCallId: 'tool-call.1',
    })
    const runtimeError = appendRuntimeErrorEvent(completion, {
      id: 'event.runtime-error',
      timestamp: '2026-04-01T12:00:03.000Z',
      sessionId: 'session.1',
      conversationId: 'conversation.1',
      appId: 'chess.internal',
      appSessionId: 'app-session.1',
      errorName: 'IframeBridgeError',
      message: 'Bridge connection dropped',
      stack: 'Error: Bridge connection dropped',
      recoverable: true,
    })
    const timeout = appendHeartbeatTimeoutEvent(runtimeError, {
      id: 'event.timeout',
      timestamp: '2026-04-01T12:00:04.000Z',
      sessionId: 'session.1',
      conversationId: 'conversation.1',
      appId: 'chess.internal',
      appSessionId: 'app-session.1',
      timeoutMs: 3000,
      lastHeartbeatAt: '2026-04-01T12:00:01.500Z',
      missedHeartbeats: 2,
      reason: 'No heartbeat received from iframe',
    })
    const rawMessage = appendRawMessageEvent(timeout, {
      id: 'event.raw-message',
      timestamp: '2026-04-01T12:00:05.000Z',
      sessionId: 'session.1',
      conversationId: 'conversation.1',
      appId: 'chess.internal',
      appSessionId: 'app-session.1',
      direction: 'iframe-to-host',
      messageType: 'state:update',
      origin: 'http://localhost:3000',
      correlationId: 'correlation.1',
      message: {
        type: 'state:update',
        payload: {
          move: 'e2e4',
        },
      },
    })
    const note = appendReviewerNoteEvent(rawMessage, {
      id: 'event.reviewer-note',
      timestamp: '2026-04-01T12:00:06.000Z',
      sessionId: 'session.1',
      conversationId: 'conversation.1',
      note: 'Raw bridge message includes the expected move payload.',
      severity: 'info',
      tags: ['bridge', 'move'],
      relatedEventId: 'event.raw-message',
    })
    const finding = appendReviewerFindingEvent(note, {
      id: 'event.reviewer-finding',
      timestamp: '2026-04-01T12:00:07.000Z',
      sessionId: 'session.1',
      conversationId: 'conversation.1',
      title: 'Missing retry UI for heartbeat timeout',
      summary: 'The review session shows a timeout but no explicit retry affordance.',
      severity: 'medium',
      status: 'open',
      recommendation: 'Add a retry button and surface the last known state.',
      evidence: ['timeout event', 'runtime error event'],
      relatedEventId: 'event.timeout',
    })

    expect(initialLog).toHaveLength(0)
    expect(finding).toHaveLength(8)
    expect(finding[0].type).toBe('iframe-load')
    expect(finding[0]).toMatchObject({
      id: 'event.iframe-load',
      actor: 'runtime',
      status: 'loaded',
      loadMs: 128,
    })
    expect(finding[2]).toMatchObject({
      type: 'completion',
      status: 'succeeded',
      resultSummary: 'Game started successfully.',
    })
    expect(finding[4]).toMatchObject({
      type: 'heartbeat-timeout',
      timeoutMs: 3000,
      missedHeartbeats: 2,
    })
    expect(finding[5]).toMatchObject({
      type: 'raw-message',
      direction: 'iframe-to-host',
      messageType: 'state:update',
    })
    expect(finding[6]).toMatchObject({
      type: 'reviewer-note',
      actor: 'reviewer',
      severity: 'info',
    })
    expect(finding[7]).toMatchObject({
      type: 'reviewer-finding',
      status: 'open',
      severity: 'medium',
    })
  })

  it('summarizes the latest state, completion, and reviewer findings', () => {
    const log = createLogWithMultipleStates()
    const summary = summarizeReviewHarnessLog(log)

    expect(summary.totalEvents).toBe(7)
    expect(summary.eventCounts).toMatchObject({
      'iframe-load': 1,
      'runtime-state': 2,
      completion: 1,
      'runtime-error': 1,
      'heartbeat-timeout': 0,
      'raw-message': 1,
      'reviewer-note': 0,
      'reviewer-finding': 1,
    })
    expect(summary.sessionIds).toEqual(['session.2'])
    expect(summary.conversationIds).toEqual(['conversation.2'])
    expect(summary.latestIframeLoad?.status).toBe('loaded')
    expect(summary.latestRuntimeState?.stateLabel).toBe('post-move')
    expect(summary.latestCompletion?.resultSummary).toBe('Planner is ready.')
    expect(summary.latestRuntimeError?.message).toBe('Iframe crashed while hydrating')
    expect(summary.rawMessageEvents).toHaveLength(1)
    expect(summary.reviewerFindings).toHaveLength(1)
    expect(summary.openFindings).toHaveLength(1)
    expect(summary.openFindings[0]?.title).toBe('Need clearer loading indicator')
  })

  it('creates review harness events with inferred defaults when optional fields are omitted', () => {
    const event = createReviewHarnessEvent({
      type: 'reviewer-note',
      sessionId: 'session.3',
      conversationId: 'conversation.3',
      note: 'Looks good overall.',
    })

    expect(event.type).toBe('reviewer-note')
    expect(event.actor).toBe('reviewer')
    expect(event.severity).toBe('info')
    expect(event.id.startsWith('review-harness.reviewer-note.')).toBe(true)
    expect(event.timestamp).toBeTruthy()
  })
})

function createLogWithMultipleStates(): ReviewHarnessLog {
  const baseLog: ReviewHarnessLog = []

  const withIframe = appendIframeLoadEvent(baseLog, {
    id: 'event.iframe',
    timestamp: '2026-04-01T12:10:00.000Z',
    sessionId: 'session.2',
    conversationId: 'conversation.2',
    appId: 'planner.oauth',
    appSessionId: 'app-session.2',
    iframeUrl: 'http://localhost:3000/embedded-apps/planner',
    origin: 'http://localhost:3000',
    status: 'loaded',
  })
  const withFirstState = appendRuntimeStateEvent(withIframe, {
    id: 'event.state.1',
    timestamp: '2026-04-01T12:10:01.000Z',
    sessionId: 'session.2',
    conversationId: 'conversation.2',
    appId: 'planner.oauth',
    appSessionId: 'app-session.2',
    state: {
      screen: 'loading',
      tasks: 2,
    },
    stateLabel: 'initial',
  })
  const withSecondState = appendRuntimeStateEvent(withFirstState, {
    id: 'event.state.2',
    timestamp: '2026-04-01T12:10:02.000Z',
    sessionId: 'session.2',
    conversationId: 'conversation.2',
    appId: 'planner.oauth',
    appSessionId: 'app-session.2',
    state: {
      screen: 'board',
      tasks: 3,
    },
    stateLabel: 'post-move',
    sequence: 2,
  })
  const withRuntimeError = appendRuntimeErrorEvent(withSecondState, {
    id: 'event.error',
    timestamp: '2026-04-01T12:10:03.000Z',
    sessionId: 'session.2',
    conversationId: 'conversation.2',
    appId: 'planner.oauth',
    appSessionId: 'app-session.2',
    message: 'Iframe crashed while hydrating',
    recoverable: false,
  })
  const withCompletion = appendCompletionEvent(withRuntimeError, {
    id: 'event.completion',
    timestamp: '2026-04-01T12:10:04.000Z',
    sessionId: 'session.2',
    conversationId: 'conversation.2',
    appId: 'planner.oauth',
    appSessionId: 'app-session.2',
    status: 'succeeded',
    resultSummary: 'Planner is ready.',
  })
  const withRawMessage = appendRawMessageEvent(withCompletion, {
    id: 'event.raw',
    timestamp: '2026-04-01T12:10:05.000Z',
    sessionId: 'session.2',
    conversationId: 'conversation.2',
    appId: 'planner.oauth',
    appSessionId: 'app-session.2',
    direction: 'host-to-iframe',
    message: {
      type: 'bootstrap',
      payload: { appSessionId: 'app-session.2' },
    },
  })

  return appendReviewerFindingEvent(withRawMessage, {
    id: 'event.finding',
    timestamp: '2026-04-01T12:10:06.000Z',
    sessionId: 'session.2',
    conversationId: 'conversation.2',
    title: 'Need clearer loading indicator',
    summary: 'Iframe load is recorded but the reviewer notes a missing loading affordance.',
    severity: 'low',
    status: 'open',
    recommendation: 'Surface a visible loading state while the iframe hydrates.',
  })
}
