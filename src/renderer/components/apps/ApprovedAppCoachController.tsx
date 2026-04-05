import type { JsonObject } from '@shared/contracts/v1/shared'
import type { Session } from '@shared/types'
import { useEffect, useRef } from 'react'
import {
  buildChessApprovedAppKickoffMessage,
  buildChessApprovedAppKickoffToolCallId,
  buildChessObservedBoardStateMessage,
  buildChessObservedBoardStateToolCallId,
} from '@/packages/tutormeai-apps/orchestrator'
import { useApprovedAppEventStore } from '@/stores/approvedAppEventStore'
import { buildRuntimeTraceId, recordRuntimeTraceSpan } from '@/stores/runtimeTraceStore'
import * as scrollActions from '@/stores/scrollActions'
import { insertMessage } from '@/stores/session/messages'
import { getAllMessageList } from '@/stores/sessionHelpers'

type ApprovedAppCoachControllerProps = {
  sessionId: string
  session: Session
}

type ChessFamilyApp = {
  approvedAppId: 'chess-tutor'
  runtimeAppId: string
  appLabel: string
}

const chessFamilyApps = new Map<string, ChessFamilyApp>([
  [
    'chess-tutor',
    {
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      appLabel: 'Chess Tutor',
    },
  ],
])

function recordCoachTraceSpan(input: {
  sessionId: string
  appSessionId: string
  eventId: string
  status: 'succeeded' | 'failed'
  traceSource: string
  summary: string
  latestStateDigest?: JsonObject
  toolCallId: string
  errorMessage?: string
  approvedAppId: string
  runtimeAppId: string
}) {
  recordRuntimeTraceSpan({
    traceId: buildRuntimeTraceId({
      conversationId: input.sessionId,
      appSessionId: input.appSessionId,
      runtimeAppId: input.runtimeAppId,
    }),
    name: `${input.traceSource} chess coach message`,
    kind: 'coach-message',
    status: input.status,
    conversationId: input.sessionId,
    sessionId: input.sessionId,
    appSessionId: input.appSessionId,
    approvedAppId: input.approvedAppId,
    runtimeAppId: input.runtimeAppId,
    actor: {
      layer: 'host',
      source: 'approved-app-coach-controller',
    },
    input: `Create chess coach message from ${input.traceSource}`,
    output: input.summary,
    tags: ['coach-message', 'host', input.approvedAppId, input.runtimeAppId, input.traceSource],
    state: {
      source: input.traceSource,
      summary: input.summary,
      stateDigest: input.latestStateDigest,
      fen: typeof input.latestStateDigest?.fen === 'string' ? input.latestStateDigest.fen : undefined,
      moveCount: typeof input.latestStateDigest?.moveCount === 'number' ? input.latestStateDigest.moveCount : undefined,
      lastMove: typeof input.latestStateDigest?.lastMove === 'string' ? input.latestStateDigest.lastMove : undefined,
    },
    agentReturn: {
      kind: 'invoke-tool',
      toolName: 'chess.get-board-state',
      toolCallId: input.toolCallId,
    },
    error: input.errorMessage
      ? {
          message: input.errorMessage,
        }
      : undefined,
    metadata: {
      eventId: input.eventId,
    },
  })
}

function sessionAlreadyHasKickoffMessage(session: Session, appSessionId: string) {
  const kickoffToolCallId = buildChessApprovedAppKickoffToolCallId(appSessionId)

  return getAllMessageList(session).some((message) =>
    (message.contentParts ?? []).some((part) => part.type === 'tool-call' && part.toolCallId === kickoffToolCallId)
  )
}

function sessionAlreadyHasObservedBoardMessage(session: Session, appSessionId: string, moveCount: number) {
  const observedToolCallId = buildChessObservedBoardStateToolCallId(appSessionId, moveCount)

  return getAllMessageList(session).some((message) =>
    (message.contentParts ?? []).some((part) => part.type === 'tool-call' && part.toolCallId === observedToolCallId)
  )
}

function sessionHasActiveChessRuntimeMessage(session: Session, runtimeAppId: string) {
  return getAllMessageList(session).some((message) =>
    (message.contentParts ?? []).some(
      (part) =>
        part.type === 'embedded-app' &&
        part.appId === runtimeAppId &&
        !part.bridge?.completion &&
        part.status !== 'error'
    )
  )
}

export default function ApprovedAppCoachController({ sessionId, session }: ApprovedAppCoachControllerProps) {
  const latestOpenedEvent = useApprovedAppEventStore((state) => state.latestOpenedEvent)
  const latestObservedStateEvent = useApprovedAppEventStore((state) => state.latestObservedStateEvent)
  const handledKickoffAppSessionIdsRef = useRef<Set<string>>(new Set())
  const handledObservedBoardKeysRef = useRef<Set<string>>(new Set())
  const activeChessEvent =
    latestOpenedEvent &&
    latestOpenedEvent.sessionId === sessionId &&
    chessFamilyApps.has(latestOpenedEvent.approvedAppId)
      ? latestOpenedEvent
      : null
  const activeChessObservedStateEvent =
    latestObservedStateEvent &&
    latestObservedStateEvent.sessionId === sessionId &&
    chessFamilyApps.has(latestObservedStateEvent.approvedAppId)
      ? latestObservedStateEvent
      : null

  useEffect(() => {
    if (!activeChessEvent) {
      return
    }

    const chessFamilyApp = chessFamilyApps.get(activeChessEvent.approvedAppId)
    if (!chessFamilyApp) {
      return
    }

    if (handledKickoffAppSessionIdsRef.current.has(activeChessEvent.appSessionId)) {
      return
    }

    if (sessionAlreadyHasKickoffMessage(session, activeChessEvent.appSessionId)) {
      handledKickoffAppSessionIdsRef.current.add(activeChessEvent.appSessionId)
      return
    }

    if (sessionHasActiveChessRuntimeMessage(session, chessFamilyApp.runtimeAppId)) {
      return
    }

    handledKickoffAppSessionIdsRef.current.add(activeChessEvent.appSessionId)
    const kickoffMessage = buildChessApprovedAppKickoffMessage({
      eventId: activeChessEvent.eventId,
      appSessionId: activeChessEvent.appSessionId,
      summary: activeChessEvent.summary,
      latestStateDigest: activeChessEvent.latestStateDigest,
      availableToolNames: activeChessEvent.availableToolNames,
      appLabel: chessFamilyApp.appLabel,
    })
    if (!kickoffMessage) {
      handledKickoffAppSessionIdsRef.current.delete(activeChessEvent.appSessionId)
      return
    }

    void insertMessage(sessionId, kickoffMessage)
      .then(() => {
        recordCoachTraceSpan({
          sessionId,
          appSessionId: activeChessEvent.appSessionId,
          eventId: activeChessEvent.eventId,
          status: 'succeeded',
          traceSource: 'approved-app.opened',
          summary: activeChessEvent.summary,
          latestStateDigest: activeChessEvent.latestStateDigest,
          toolCallId: buildChessApprovedAppKickoffToolCallId(activeChessEvent.appSessionId),
          approvedAppId: chessFamilyApp.approvedAppId,
          runtimeAppId: chessFamilyApp.runtimeAppId,
        })
        scrollActions.scrollToBottom('smooth')
      })
      .catch((error: unknown) => {
        recordCoachTraceSpan({
          sessionId,
          appSessionId: activeChessEvent.appSessionId,
          eventId: activeChessEvent.eventId,
          status: 'failed',
          traceSource: 'approved-app.opened',
          summary: activeChessEvent.summary,
          latestStateDigest: activeChessEvent.latestStateDigest,
          toolCallId: buildChessApprovedAppKickoffToolCallId(activeChessEvent.appSessionId),
          errorMessage: error instanceof Error ? error.message : 'Failed to insert kickoff coach message.',
          approvedAppId: chessFamilyApp.approvedAppId,
          runtimeAppId: chessFamilyApp.runtimeAppId,
        })
        handledKickoffAppSessionIdsRef.current.delete(activeChessEvent.appSessionId)
      })
  }, [activeChessEvent, session, sessionId])

  useEffect(() => {
    if (!activeChessObservedStateEvent) {
      return
    }

    const chessFamilyApp = chessFamilyApps.get(activeChessObservedStateEvent.approvedAppId)
    if (!chessFamilyApp) {
      return
    }

    const observedStateDigest = activeChessObservedStateEvent.latestStateDigest
    const fen = typeof observedStateDigest?.fen === 'string' ? observedStateDigest.fen : null
    const moveCount = typeof observedStateDigest?.moveCount === 'number' ? observedStateDigest.moveCount : null
    const lastUpdateSource =
      typeof observedStateDigest?.lastUpdateSource === 'string' ? observedStateDigest.lastUpdateSource : null

    if (!fen || moveCount === null || moveCount === 0 || lastUpdateSource !== 'manual-board-move') {
      return
    }

    const observedKey = `${activeChessObservedStateEvent.appSessionId}:${moveCount}:${fen}`
    if (handledObservedBoardKeysRef.current.has(observedKey)) {
      return
    }

    if (sessionAlreadyHasObservedBoardMessage(session, activeChessObservedStateEvent.appSessionId, moveCount)) {
      handledObservedBoardKeysRef.current.add(observedKey)
      return
    }

    handledObservedBoardKeysRef.current.add(observedKey)
    const observedMessage = buildChessObservedBoardStateMessage({
      appSessionId: activeChessObservedStateEvent.appSessionId,
      summary: activeChessObservedStateEvent.summary,
      latestStateDigest: observedStateDigest,
      availableToolNames: activeChessObservedStateEvent.availableToolNames,
    })
    if (!observedMessage) {
      handledObservedBoardKeysRef.current.delete(observedKey)
      return
    }

    void insertMessage(sessionId, observedMessage)
      .then(() => {
        recordCoachTraceSpan({
          sessionId,
          appSessionId: activeChessObservedStateEvent.appSessionId,
          eventId: activeChessObservedStateEvent.eventId,
          status: 'succeeded',
          traceSource: 'approved-app.state-observed',
          summary: activeChessObservedStateEvent.summary,
          latestStateDigest: observedStateDigest,
          toolCallId: buildChessObservedBoardStateToolCallId(activeChessObservedStateEvent.appSessionId, moveCount),
          approvedAppId: chessFamilyApp.approvedAppId,
          runtimeAppId: chessFamilyApp.runtimeAppId,
        })
        scrollActions.scrollToBottom('smooth')
      })
      .catch((error: unknown) => {
        recordCoachTraceSpan({
          sessionId,
          appSessionId: activeChessObservedStateEvent.appSessionId,
          eventId: activeChessObservedStateEvent.eventId,
          status: 'failed',
          traceSource: 'approved-app.state-observed',
          summary: activeChessObservedStateEvent.summary,
          latestStateDigest: observedStateDigest,
          toolCallId: buildChessObservedBoardStateToolCallId(activeChessObservedStateEvent.appSessionId, moveCount),
          errorMessage: error instanceof Error ? error.message : 'Failed to insert observed-board coach message.',
          approvedAppId: chessFamilyApp.approvedAppId,
          runtimeAppId: chessFamilyApp.runtimeAppId,
        })
        handledObservedBoardKeysRef.current.delete(observedKey)
      })
  }, [activeChessObservedStateEvent, session, sessionId])

  return null
}
