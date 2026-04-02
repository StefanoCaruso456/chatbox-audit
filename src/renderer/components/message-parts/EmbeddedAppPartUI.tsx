import type { JsonObject } from '@shared/contracts/v1/shared'
import type { MessageEmbeddedAppPart } from '@shared/types'
import { useMemo } from 'react'
import EmbeddedAppHost from './EmbeddedAppHost'

function toHostState(status: MessageEmbeddedAppPart['status']) {
  if (status === 'error') {
    return 'error'
  }

  if (status === 'ready') {
    return 'ready'
  }

  return 'loading'
}

function getEmbeddedAppDescription(part: MessageEmbeddedAppPart) {
  if (part.bridge?.completion?.resultSummary) {
    return part.bridge.completion.resultSummary
  }

  if (part.bridge?.pendingInvocation) {
    return part.summary ?? `${part.bridge.pendingInvocation.toolName} pending`
  }

  return part.summary
}

function getEmbeddedAppErrorMessage(part: MessageEmbeddedAppPart) {
  return part.bridge?.completion?.errorMessage ?? part.errorMessage
}

export function EmbeddedAppPartUI({ part }: { part: MessageEmbeddedAppPart }) {
  const runtime = useMemo(() => {
    if (!part.bridge) {
      return undefined
    }

    return {
      expectedOrigin: part.bridge.expectedOrigin,
      conversationId: part.bridge.conversationId,
      appSessionId: part.bridge.appSessionId ?? part.appSessionId,
      handshakeToken: part.bridge.handshakeToken,
      heartbeatTimeoutMs: part.bridge.heartbeatTimeoutMs,
      bootstrap: part.bridge.bootstrap,
      pendingInvocation: part.bridge.pendingInvocation,
      completion: part.bridge.completion
        ? {
            status: part.bridge.completion.status,
            summary: part.bridge.completion.resultSummary,
            resultPayload:
              part.bridge.completion.result && typeof part.bridge.completion.result === 'object'
                ? (part.bridge.completion.result as JsonObject)
                : undefined,
            errorMessage: part.bridge.completion.errorMessage,
          }
        : undefined,
    } as const
  }, [part])

  return (
    <EmbeddedAppHost
      appId={part.appId}
      appName={part.appName}
      src={part.sourceUrl}
      state={toHostState(part.status)}
      title={part.title}
      subtitle={part.appSessionId}
      description={getEmbeddedAppDescription(part)}
      iframeTitle={part.title || `${part.appName} embedded app`}
      height={part.minHeight}
      sandbox={part.sandbox}
      errorMessage={getEmbeddedAppErrorMessage(part)}
      runtime={runtime}
    />
  )
}
