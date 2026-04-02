import type { MessageEmbeddedAppPart } from '@shared/types'
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

export function EmbeddedAppPartUI({ part }: { part: MessageEmbeddedAppPart }) {
  return (
    <EmbeddedAppHost
      appId={part.appId}
      appName={part.appName}
      src={part.sourceUrl}
      state={toHostState(part.status)}
      title={part.title}
      subtitle={part.appSessionId}
      description={part.summary}
      iframeTitle={part.title || `${part.appName} embedded app`}
      height={part.minHeight}
      sandbox={part.sandbox}
      errorMessage={part.errorMessage}
    />
  )
}
