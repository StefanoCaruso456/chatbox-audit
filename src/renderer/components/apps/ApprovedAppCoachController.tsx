import type { Session } from '@shared/types'
import { useEffect } from 'react'
import {
  buildChessApprovedAppKickoffMessage,
  buildChessApprovedAppKickoffToolCallId,
} from '@/packages/tutormeai-apps/orchestrator'
import * as scrollActions from '@/stores/scrollActions'
import { useApprovedAppEventStore } from '@/stores/approvedAppEventStore'
import { insertMessage } from '@/stores/session/messages'
import { getAllMessageList } from '@/stores/sessionHelpers'

type ApprovedAppCoachControllerProps = {
  sessionId: string
  session: Session
}

function sessionAlreadyHasKickoffMessage(session: Session, eventId: string) {
  const kickoffToolCallId = buildChessApprovedAppKickoffToolCallId(eventId)

  return getAllMessageList(session).some((message) =>
    (message.contentParts ?? []).some(
      (part) => part.type === 'tool-call' && part.toolCallId === kickoffToolCallId
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

  useEffect(() => {
    if (!latestOpenedEvent || latestOpenedEvent.sessionId !== sessionId || latestOpenedEvent.approvedAppId !== 'chess-tutor') {
      return
    }

    if (sessionAlreadyHasKickoffMessage(session, latestOpenedEvent.eventId)) {
      return
    }

    if (sessionHasActiveChessRuntimeMessage(session)) {
      return
    }

    const kickoffMessage = buildChessApprovedAppKickoffMessage({
      eventId: latestOpenedEvent.eventId,
      appSessionId: latestOpenedEvent.appSessionId,
      summary: latestOpenedEvent.summary,
      latestStateDigest: latestOpenedEvent.latestStateDigest,
      availableToolNames: latestOpenedEvent.availableToolNames,
    })
    if (!kickoffMessage) {
      return
    }

    void insertMessage(sessionId, kickoffMessage).then(() => {
      scrollActions.scrollToBottom('smooth')
    })
  }, [latestOpenedEvent, session, sessionId])

  return null
}
