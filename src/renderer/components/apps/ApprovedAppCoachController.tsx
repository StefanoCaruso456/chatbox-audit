import type { Session } from '@shared/types'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  buildChessApprovedAppKickoffMessage,
  buildChessApprovedAppKickoffToolCallId,
  buildChessObservedBoardStateMessage,
  buildChessObservedBoardStateToolCallId,
} from '@/packages/tutormeai-apps/orchestrator'
import * as scrollActions from '@/stores/scrollActions'
import { useApprovedAppEventStore } from '@/stores/approvedAppEventStore'
import { getChessSessionSnapshot, subscribeChessSession } from '@/stores/chessSessionStore'
import { insertMessage } from '@/stores/session/messages'
import { getAllMessageList } from '@/stores/sessionHelpers'

type ApprovedAppCoachControllerProps = {
  sessionId: string
  session: Session
}

function sessionAlreadyHasKickoffMessage(session: Session, appSessionId: string) {
  const kickoffToolCallId = buildChessApprovedAppKickoffToolCallId(appSessionId)

  return getAllMessageList(session).some((message) =>
    (message.contentParts ?? []).some(
      (part) => part.type === 'tool-call' && part.toolCallId === kickoffToolCallId
    )
  )
}

function sessionAlreadyHasObservedBoardMessage(session: Session, appSessionId: string, moveCount: number) {
  const observedToolCallId = buildChessObservedBoardStateToolCallId(appSessionId, moveCount)

  return getAllMessageList(session).some((message) =>
    (message.contentParts ?? []).some(
      (part) => part.type === 'tool-call' && part.toolCallId === observedToolCallId
    )
  )
}

function sessionHasActiveChessRuntimeMessage(session: Session) {
  return getAllMessageList(session).some((message) =>
    (message.contentParts ?? []).some(
      (part) =>
        part.type === 'embedded-app' &&
        part.appId === 'chess.internal' &&
        !part.bridge?.completion &&
        part.status !== 'error'
    )
  )
}

export default function ApprovedAppCoachController({ sessionId, session }: ApprovedAppCoachControllerProps) {
  const latestOpenedEvent = useApprovedAppEventStore((state) => state.latestOpenedEvent)
  const handledKickoffAppSessionIdsRef = useRef<Set<string>>(new Set())
  const handledObservedBoardKeysRef = useRef<Set<string>>(new Set())
  const activeChessEvent =
    latestOpenedEvent && latestOpenedEvent.sessionId === sessionId && latestOpenedEvent.approvedAppId === 'chess-tutor'
      ? latestOpenedEvent
      : null

  const activeChessSnapshot = useSyncExternalStore(
    (listener) => {
      if (!activeChessEvent) {
        return () => {}
      }

      return subscribeChessSession(activeChessEvent.conversationId, activeChessEvent.appSessionId, listener)
    },
    () => {
      if (!activeChessEvent) {
        return null
      }

      return getChessSessionSnapshot(activeChessEvent.conversationId, activeChessEvent.appSessionId)
    },
    () => null
  )

  useEffect(() => {
    if (!activeChessEvent) {
      return
    }

    if (handledKickoffAppSessionIdsRef.current.has(activeChessEvent.appSessionId)) {
      return
    }

    if (sessionAlreadyHasKickoffMessage(session, activeChessEvent.appSessionId)) {
      handledKickoffAppSessionIdsRef.current.add(activeChessEvent.appSessionId)
      return
    }

    if (sessionHasActiveChessRuntimeMessage(session)) {
      return
    }

    handledKickoffAppSessionIdsRef.current.add(activeChessEvent.appSessionId)
    const kickoffMessage = buildChessApprovedAppKickoffMessage({
      eventId: activeChessEvent.eventId,
      appSessionId: activeChessEvent.appSessionId,
      summary: activeChessEvent.summary,
      latestStateDigest: activeChessEvent.latestStateDigest,
      availableToolNames: activeChessEvent.availableToolNames,
    })
    if (!kickoffMessage) {
      handledKickoffAppSessionIdsRef.current.delete(activeChessEvent.appSessionId)
      return
    }

    void insertMessage(sessionId, kickoffMessage)
      .then(() => {
        scrollActions.scrollToBottom('smooth')
      })
      .catch(() => {
        handledKickoffAppSessionIdsRef.current.delete(activeChessEvent.appSessionId)
      })
  }, [activeChessEvent, session, sessionId])

  useEffect(() => {
    if (!activeChessEvent || !activeChessSnapshot) {
      return
    }

    if (activeChessSnapshot.lastUpdateSource !== 'manual-board-move' || activeChessSnapshot.moveCount === 0) {
      return
    }

    const observedKey = `${activeChessEvent.appSessionId}:${activeChessSnapshot.moveCount}:${activeChessSnapshot.fen}`
    if (handledObservedBoardKeysRef.current.has(observedKey)) {
      return
    }

    if (sessionAlreadyHasObservedBoardMessage(session, activeChessEvent.appSessionId, activeChessSnapshot.moveCount)) {
      handledObservedBoardKeysRef.current.add(observedKey)
      return
    }

    handledObservedBoardKeysRef.current.add(observedKey)
    const observedMessage = buildChessObservedBoardStateMessage({
      appSessionId: activeChessEvent.appSessionId,
      summary: activeChessSnapshot.summary,
      latestStateDigest: {
        fen: activeChessSnapshot.fen,
        turn: activeChessSnapshot.turn,
        moveCount: activeChessSnapshot.moveCount,
        lastMove: activeChessSnapshot.lastMove,
        lastUpdateSource: activeChessSnapshot.lastUpdateSource,
        ...(activeChessSnapshot.mode ? { mode: activeChessSnapshot.mode } : {}),
      },
      availableToolNames: activeChessEvent.availableToolNames,
    })
    if (!observedMessage) {
      handledObservedBoardKeysRef.current.delete(observedKey)
      return
    }

    void insertMessage(sessionId, observedMessage)
      .then(() => {
        scrollActions.scrollToBottom('smooth')
      })
      .catch(() => {
        handledObservedBoardKeysRef.current.delete(observedKey)
      })
  }, [activeChessEvent, activeChessSnapshot, session, sessionId])

  return null
}
