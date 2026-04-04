import type { AppSessionAuthState, CompletionSignal, JsonValue } from '@shared/contracts/v1'
import type { JsonObject } from '@shared/contracts/v1/shared'
import { createMessage, type Message, type MessageEmbeddedAppPart, type Session } from '@shared/types'
import { v4 as uuidv4 } from 'uuid'
import type {
  EmbeddedAppHostErrorMessage,
  EmbeddedAppHostRuntimeConfig,
  EmbeddedAppHostStateMessage,
  EmbeddedAppHostTimeoutError,
} from '@/components/message-parts/embedded-app-host'
import { getSession } from '@/stores/chatStore'
import { findMessageLocation } from '@/stores/session/forks'
import { getAllMessageList } from '@/stores/sessionHelpers'
import { insertMessageAfter, modifyMessage } from '@/stores/session/messages'
import type { ApprovedApp } from '@/types/apps'

export interface ApprovedAppConversationPartRef {
  messageId: string
  partIndex: number
  part: MessageEmbeddedAppPart
  timestamp: number
}

function getLaunchOrigin(launchUrl: string): string | null {
  try {
    const parsed = new URL(launchUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }

    return parsed.origin
  } catch {
    return null
  }
}

function getMessageTimestamp(message: Message, fallbackIndex: number) {
  if (typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)) {
    return message.timestamp
  }

  return fallbackIndex
}

function matchesApprovedAppPart(app: ApprovedApp, part: MessageEmbeddedAppPart) {
  if (!app.runtimeBridge) {
    return false
  }

  if (part.appId === app.runtimeBridge.appId) {
    return true
  }

  if (part.appName === app.name) {
    return true
  }

  try {
    return new URL(part.sourceUrl).pathname === app.launchUrl
  } catch {
    return false
  }
}

function isActivePart(part: MessageEmbeddedAppPart) {
  return !part.bridge?.completion && part.status !== 'error'
}

function isRecoverableFailure(part: MessageEmbeddedAppPart) {
  return part.status === 'error' && !part.bridge?.completion
}

function compareByRecency(left: ApprovedAppConversationPartRef, right: ApprovedAppConversationPartRef) {
  return right.timestamp - left.timestamp
}

export function selectLatestApprovedAppConversationPart(
  session: Session | null | undefined,
  app: ApprovedApp
): ApprovedAppConversationPartRef | null {
  if (!session || !app.runtimeBridge) {
    return null
  }

  const refs: ApprovedAppConversationPartRef[] = []
  const messages = getAllMessageList(session)

  messages.forEach((message, messageIndex) => {
    ;(message.contentParts ?? []).forEach((part, partIndex) => {
      if (part.type !== 'embedded-app' || !matchesApprovedAppPart(app, part)) {
        return
      }

      refs.push({
        messageId: message.id,
        partIndex,
        part,
        timestamp: getMessageTimestamp(message, messageIndex),
      })
    })
  })

  if (refs.length === 0) {
    return null
  }

  const activeRefs = refs.filter((ref) => isActivePart(ref.part)).sort(compareByRecency)
  if (activeRefs.length > 0) {
    return activeRefs[0]
  }

  const recoverableRefs = refs.filter((ref) => isRecoverableFailure(ref.part)).sort(compareByRecency)
  if (recoverableRefs.length > 0) {
    return recoverableRefs[0]
  }

  return [...refs].sort(compareByRecency)[0]
}

function toJsonObject(value: JsonValue | undefined) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject
  }

  return undefined
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

async function updateApprovedAppConversationPart(
  sessionId: string,
  ref: ApprovedAppConversationPartRef,
  updater: (currentPart: MessageEmbeddedAppPart) => MessageEmbeddedAppPart
) {
  const session = await getSession(sessionId)
  if (!session) {
    return
  }

  const location = findMessageLocation(session, ref.messageId)
  if (!location) {
    return
  }

  const currentMessage = location.list[location.index]
  const currentPart = currentMessage.contentParts?.[ref.partIndex]
  if (!currentPart || currentPart.type !== 'embedded-app') {
    return
  }

  const nextParts = [...(currentMessage.contentParts ?? [])]
  nextParts[ref.partIndex] = updater(currentPart)

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
}

export function buildConversationEmbeddedAppRuntime(
  sessionId: string,
  ref: ApprovedAppConversationPartRef,
  currentLaunchUrl?: string
): EmbeddedAppHostRuntimeConfig | undefined {
  const { part } = ref
  if (!part.bridge) {
    return undefined
  }

  const currentLaunchOrigin = currentLaunchUrl ? getLaunchOrigin(currentLaunchUrl) : null

  return {
    expectedOrigin: currentLaunchOrigin ?? part.bridge.expectedOrigin,
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
          resultPayload: toJsonObject(part.bridge.completion.result),
          errorMessage: part.bridge.completion.errorMessage,
        }
      : undefined,
    onStateUpdate: (message: EmbeddedAppHostStateMessage) => {
      void updateApprovedAppConversationPart(sessionId, ref, (currentPart) => {
        const state = toJsonObject(message.payload.state)
        const authState = inferAuthStateFromJsonValue(state?.authState)
        const nextStatus =
          message.payload.status === 'failed' ? 'error' : message.payload.status === 'pending' ? 'loading' : 'ready'
        const shouldClearPendingInvocation =
          Boolean(currentPart.bridge?.pendingInvocation) && message.payload.status !== 'pending' && message.payload.status !== 'failed'

        return {
          ...currentPart,
          status: nextStatus,
          summary: message.payload.summary,
          errorMessage: message.payload.status === 'failed' ? currentPart.errorMessage : undefined,
          bridge: currentPart.bridge
            ? {
                ...currentPart.bridge,
                pendingInvocation: shouldClearPendingInvocation ? undefined : currentPart.bridge.pendingInvocation,
                bootstrap: currentPart.bridge.bootstrap
                  ? {
                      ...currentPart.bridge.bootstrap,
                      authState: authState ?? currentPart.bridge.bootstrap.authState,
                      initialState: state ?? currentPart.bridge.bootstrap.initialState,
                    }
                  : currentPart.bridge.bootstrap,
              }
            : currentPart.bridge,
        }
      })
    },
    onCompletion: (signal: CompletionSignal) => {
      void updateApprovedAppConversationPart(sessionId, ref, (currentPart) => ({
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
      void updateApprovedAppConversationPart(sessionId, ref, (currentPart) => ({
        ...currentPart,
        status: 'error',
        errorMessage: runtimeErrorMessage,
      }))
    },
    onHeartbeatTimeout: (error: EmbeddedAppHostTimeoutError) => {
      void updateApprovedAppConversationPart(sessionId, ref, (currentPart) => ({
        ...currentPart,
        status: 'error',
        errorMessage: error.message,
      }))
    },
  }
}

export function getApprovedAppConversationPartDescription(part: MessageEmbeddedAppPart) {
  if (part.bridge?.completion?.resultSummary) {
    return part.bridge.completion.resultSummary
  }

  if (part.bridge?.pendingInvocation) {
    return part.summary ?? `${part.bridge.pendingInvocation.toolName} pending`
  }

  return part.summary
}

export function getApprovedAppConversationPartError(part: MessageEmbeddedAppPart) {
  if (part.bridge?.completion?.status === 'cancelled') {
    return 'This app session was closed from the right sidebar. Relaunch it anytime or continue in chat.'
  }

  return part.bridge?.completion?.errorMessage ?? part.errorMessage
}

export function getApprovedAppConversationPartState(part: MessageEmbeddedAppPart) {
  if (part.status === 'error') {
    return 'error' as const
  }

  if (part.status === 'ready') {
    return 'ready' as const
  }

  return 'loading' as const
}

export async function restartApprovedAppConversationPart(sessionId: string, ref: ApprovedAppConversationPartRef) {
  await updateApprovedAppConversationPart(sessionId, ref, (currentPart) => {
    if (!currentPart.bridge?.pendingInvocation) {
      return currentPart
    }

    const retryCorrelationId = `corr.retry.${uuidv4()}`

    return {
      ...currentPart,
      status: 'loading',
      summary: `Retrying ${currentPart.appName} in the right sidebar for ${currentPart.bridge.pendingInvocation.toolName}.`,
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
}

export async function closeApprovedAppConversationPart(sessionId: string, ref: ApprovedAppConversationPartRef) {
  const closedAt = new Date().toISOString()

  await updateApprovedAppConversationPart(sessionId, ref, (currentPart) => ({
    ...currentPart,
    summary: `${currentPart.appName} was closed from the right sidebar. Continue in chat or relaunch it anytime.`,
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
    "We can keep going in chat while the app stays closed. Tell me what you'd like to do next."
  )
  followUpMessage.generating = false
  followUpMessage.status = []
  followUpMessage.contentParts = [
    {
      type: 'text',
      text: "We can keep going in chat while the app stays closed. Tell me what you'd like to do next.",
    },
    {
      type: 'info',
      text: `Closed ${ref.part.appName} from the right sidebar at ${closedAt}.`,
    },
  ]

  await insertMessageAfter(sessionId, followUpMessage, ref.messageId)
}
