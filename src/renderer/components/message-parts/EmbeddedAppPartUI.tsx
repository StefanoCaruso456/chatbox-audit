import type { AppSessionAuthState, CompletionSignal, JsonValue } from '@shared/contracts/v1'
import type { JsonObject } from '@shared/contracts/v1/shared'
import { createMessage, type MessageEmbeddedAppPart } from '@shared/types'
import { useCallback, useMemo } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { getSession } from '@/stores/chatStore'
import { findMessageLocation } from '@/stores/session/forks'
import { insertMessageAfter, modifyMessage } from '@/stores/sessionActions'
import type { EmbeddedAppConversationIndicator } from '@/packages/tutormeai-apps/conversation-state'
import EmbeddedAppHost from './EmbeddedAppHost'
import type {
  EmbeddedAppHostErrorMessage,
  EmbeddedAppHostStateMessage,
  EmbeddedAppHostTimeoutError,
} from './embedded-app-host'

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
  if (part.bridge?.completion?.status === 'cancelled') {
    return 'This app session was closed. Continue in chat or relaunch it anytime.'
  }

  return part.bridge?.completion?.errorMessage ?? part.errorMessage
}

function mapRuntimeStatusToMessageStatus(
  status: 'pending' | 'active' | 'waiting-auth' | 'waiting-user' | 'completed' | 'failed'
) {
  if (status === 'failed') {
    return 'error' as const
  }

  if (status === 'pending') {
    return 'loading' as const
  }

  return 'ready' as const
}

function inferAuthStateFromJsonValue(value: JsonValue | undefined): AppSessionAuthState | undefined {
  if (value === 'connected' || value === 'required' || value === 'expired' || value === 'not-required') {
    return value
  }

  return undefined
}

function inferAuthStateFromCompletion(
  part: MessageEmbeddedAppPart,
  completion: CompletionSignal
): AppSessionAuthState | undefined {
  if (part.bridge?.bootstrap?.authState === 'required' && completion.status === 'succeeded') {
    return 'connected'
  }

  return undefined
}

export function EmbeddedAppPartUI({
  part,
  sessionId,
  messageId,
  partIndex,
  conversationIndicator: _conversationIndicator,
}: {
  part: MessageEmbeddedAppPart
  sessionId: string
  messageId: string
  partIndex: number
  conversationIndicator?: EmbeddedAppConversationIndicator
}) {
  const updatePart = useCallback(
    async (updater: (currentPart: MessageEmbeddedAppPart) => MessageEmbeddedAppPart) => {
      const session = await getSession(sessionId)
      if (!session) {
        return
      }

      const location = findMessageLocation(session, messageId)
      if (!location) {
        return
      }

      const currentMessage = location.list[location.index]
      const currentPart = currentMessage.contentParts?.[partIndex]
      if (!currentPart || currentPart.type !== 'embedded-app') {
        return
      }

      const nextParts = [...(currentMessage.contentParts || [])]
      nextParts[partIndex] = updater(currentPart)

      await modifyMessage(
        sessionId,
        {
          ...currentMessage,
          contentParts: nextParts,
          generating: false,
          status: [],
        },
        true
      )
    },
    [messageId, partIndex, sessionId]
  )

  const runtime = useMemo(() => {
    if (!part.bridge) {
      return undefined
    }

    return {
      expectedOrigin: part.bridge.expectedOrigin,
      conversationId: part.bridge.conversationId,
      appSessionId: part.bridge.appSessionId ?? part.appSessionId,
      handshakeToken: part.bridge.handshakeToken,
      restartNonce: part.bridge.restartNonce,
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
      onStateUpdate: (message: EmbeddedAppHostStateMessage) => {
        void updatePart((currentPart) => {
          const state = message.payload.state
          const authState =
            state && typeof state === 'object' && !Array.isArray(state)
              ? inferAuthStateFromJsonValue((state as Record<string, JsonValue>).authState)
              : undefined

          return {
            ...currentPart,
            status: mapRuntimeStatusToMessageStatus(message.payload.status),
            summary: message.payload.summary,
            errorMessage: message.payload.status === 'failed' ? currentPart.errorMessage : undefined,
            bridge: currentPart.bridge
              ? {
                  ...currentPart.bridge,
                  bootstrap: currentPart.bridge.bootstrap
                    ? {
                        ...currentPart.bridge.bootstrap,
                        authState: authState ?? currentPart.bridge.bootstrap.authState,
                        initialState:
                          state && typeof state === 'object' && !Array.isArray(state)
                            ? (state as JsonObject)
                            : currentPart.bridge.bootstrap.initialState,
                      }
                    : currentPart.bridge.bootstrap,
                }
              : currentPart.bridge,
          }
        })
      },
      onCompletion: (signal: CompletionSignal) => {
        void updatePart((currentPart) => ({
          ...currentPart,
          status: 'ready',
          summary: signal.followUpContext.userVisibleSummary ?? signal.resultSummary,
          errorMessage: signal.status === 'failed' || signal.status === 'timed-out' ? signal.resultSummary : undefined,
          bridge: currentPart.bridge
            ? {
                ...currentPart.bridge,
                pendingInvocation: undefined,
                bootstrap: currentPart.bridge.bootstrap
                  ? {
                      ...currentPart.bridge.bootstrap,
                      authState:
                        inferAuthStateFromCompletion(currentPart, signal) ?? currentPart.bridge.bootstrap.authState,
                    }
                  : currentPart.bridge.bootstrap,
                completion: {
                  status: signal.status,
                  resultSummary: signal.resultSummary,
                  result: signal.result,
                  errorMessage:
                    signal.status === 'failed' || signal.status === 'timed-out' ? signal.resultSummary : undefined,
                },
              }
            : currentPart.bridge,
        }))
      },
      onRuntimeError: (message: EmbeddedAppHostErrorMessage | EmbeddedAppHostTimeoutError) => {
        const runtimeErrorMessage = 'payload' in message ? message.payload.message : message.message
        void updatePart((currentPart) => ({
          ...currentPart,
          status: 'error',
          errorMessage: runtimeErrorMessage,
          bridge: currentPart.bridge
            ? {
                ...currentPart.bridge,
              }
            : currentPart.bridge,
        }))
      },
      onHeartbeatTimeout: (error: EmbeddedAppHostTimeoutError) => {
        void updatePart((currentPart) => ({
          ...currentPart,
          status: 'error',
          errorMessage: error.message,
          bridge: currentPart.bridge
            ? {
                ...currentPart.bridge,
              }
            : currentPart.bridge,
        }))
      },
    } as const
  }, [part, updatePart])

  const handleRetry = useCallback(() => {
    if (!part.bridge?.pendingInvocation) {
      return
    }

    void updatePart((currentPart) => {
      if (!currentPart.bridge?.pendingInvocation) {
        return currentPart
      }

      const retryCorrelationId = `corr.retry.${uuidv4()}`
      const retryToolName = currentPart.bridge.pendingInvocation.toolName

      return {
        ...currentPart,
        status: 'loading',
        summary: `Retrying ${currentPart.appName} for ${retryToolName}.`,
        errorMessage: undefined,
        bridge: {
          ...currentPart.bridge,
          restartNonce: `restart.${uuidv4()}`,
          handshakeToken: `runtime.${currentPart.appId}.${uuidv4()}`,
          bootstrap: currentPart.bridge.bootstrap
            ? {
                ...currentPart.bridge.bootstrap,
                messageId: `bootstrap.retry.${uuidv4()}`,
                correlationId: retryCorrelationId,
              }
            : currentPart.bridge.bootstrap,
          pendingInvocation: {
            ...currentPart.bridge.pendingInvocation,
            toolCallId: `tool-call.retry.${uuidv4()}`,
            messageId: `invoke.retry.${uuidv4()}`,
            correlationId: retryCorrelationId,
          },
          completion: undefined,
        },
      }
    })
  }, [part.bridge?.pendingInvocation, updatePart])

  const handleContinueInChat = useCallback(() => {
    const closedAt = new Date().toISOString()
    void updatePart((currentPart) => ({
      ...currentPart,
      summary: `${currentPart.appName} was closed. Continue in chat or launch another app when you're ready.`,
      bridge: currentPart.bridge
        ? {
            ...currentPart.bridge,
            pendingInvocation: undefined,
            completion: {
              status: 'cancelled',
              resultSummary: `${currentPart.appName} was closed before it finished.`,
              result: currentPart.bridge.bootstrap?.initialState,
            },
          }
        : currentPart.bridge,
    }))

    const followUpMessage = createMessage(
      'assistant',
      "We can keep going in chat without the app. Tell me what you'd like to do next."
    )
    followUpMessage.generating = false
    followUpMessage.status = []
    followUpMessage.contentParts = [
      {
        type: 'text',
        text: "We can keep going in chat without the app. Tell me what you'd like to do next.",
      },
      {
        type: 'info',
        text: `Closed ${part.appName} at ${closedAt}.`,
      },
    ]

    void insertMessageAfter(sessionId, followUpMessage, messageId)
  }, [messageId, part.appName, sessionId, updatePart])

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
      onRetry={handleRetry}
      onContinueInChat={handleContinueInChat}
      onOpenInNewTab={() => {
        window.open(part.sourceUrl, '_blank', 'noopener,noreferrer')
      }}
    />
  )
}
