import type { MessageEmbeddedAppPart } from '@shared/types'
import EmbeddedAppHost from './EmbeddedAppHost'

const EMBEDDED_APP_BRIDGE_PARAM = 'chatboxBridge'

function toHostState(status: MessageEmbeddedAppPart['status']) {
  if (status === 'error') {
    return 'error'
  }

  if (status === 'ready') {
    return 'ready'
  }

  return 'loading'
}

function buildEmbeddedAppSrc(part: MessageEmbeddedAppPart) {
  if (!part.bridge) {
    return part.sourceUrl
  }

  try {
    const url = new URL(part.sourceUrl)
    url.searchParams.set(
      EMBEDDED_APP_BRIDGE_PARAM,
      JSON.stringify({
        appId: part.appId,
        appName: part.appName,
        appSessionId: part.bridge.appSessionId ?? part.appSessionId,
        expectedOrigin: part.bridge.expectedOrigin,
        conversationId: part.bridge.conversationId,
        handshakeToken: part.bridge.handshakeToken,
        bootstrap: part.bridge.bootstrap,
        pendingInvocation: part.bridge.pendingInvocation,
        completion: part.bridge.completion,
      })
    )
    return url.toString()
  } catch {
    return part.sourceUrl
  }
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
  return (
    <EmbeddedAppHost
      appId={part.appId}
      appName={part.appName}
      src={buildEmbeddedAppSrc(part)}
      state={toHostState(part.status)}
      title={part.title}
      subtitle={part.appSessionId}
      description={getEmbeddedAppDescription(part)}
      iframeTitle={part.title || `${part.appName} embedded app`}
      height={part.minHeight}
      sandbox={part.sandbox}
      errorMessage={getEmbeddedAppErrorMessage(part)}
    />
  )
}
