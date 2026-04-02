import {
  AppCompletionMessageSchema,
  AppErrorMessageSchema,
  AppHeartbeatMessageSchema,
  AppStateUpdateMessageSchema,
  type CompletionSignal,
  type JsonObject,
  type RuntimeAppStatus,
} from '@shared/contracts/v1'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type HostBootstrapRuntimeMessage,
  type HostInvokeRuntimeMessage,
  validateEmbeddedAppRuntimeMessage,
  validateRuntimeMessageOrigin,
} from '@/components/message-parts/embedded-app-runtime'

function buildMessageId(kind: string, appId: string, appSessionId: string, sequence: number) {
  return `app.${kind}.${appId}.${appSessionId}.${sequence}`
}

export function useEmbeddedAppBridge(appId: string) {
  const [bootstrapMessage, setBootstrapMessage] = useState<HostBootstrapRuntimeMessage | null>(null)
  const [invocationMessage, setInvocationMessage] = useState<HostInvokeRuntimeMessage | null>(null)
  const sequenceRef = useRef(0)

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const validation = validateEmbeddedAppRuntimeMessage(event.data)
      if (!validation.success) {
        return
      }

      const message = validation.data
      if (message.source !== 'host' || message.appId !== appId) {
        return
      }

      const originCheck = validateRuntimeMessageOrigin(message.security.expectedOrigin, event.origin)
      if (!originCheck.valid) {
        return
      }

      sequenceRef.current = Math.max(sequenceRef.current, message.sequence)

      if (message.type === 'host.bootstrap') {
        setBootstrapMessage(message)
        return
      }

      if (message.type === 'host.invoke') {
        setInvocationMessage(message)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [appId])

  const runtimeContext = useMemo(() => {
    if (!bootstrapMessage) {
      return null
    }

    return {
      appId: bootstrapMessage.appId,
      appSessionId: bootstrapMessage.appSessionId,
      conversationId: bootstrapMessage.conversationId,
      expectedOrigin: bootstrapMessage.security.expectedOrigin,
      handshakeToken: bootstrapMessage.security.handshakeToken,
      authState: bootstrapMessage.payload.authState,
      availableTools: bootstrapMessage.payload.availableTools,
      grantedPermissions: bootstrapMessage.payload.grantedPermissions,
      initialState: bootstrapMessage.payload.initialState,
      pendingInvocation: invocationMessage?.payload,
    }
  }, [bootstrapMessage, invocationMessage])

  const postRuntimeMessage = useCallback(
    (message: unknown) => {
      if (!runtimeContext || window.parent === window) {
        return
      }

      window.parent.postMessage(message, runtimeContext.expectedOrigin)
    },
    [runtimeContext]
  )

  const nextSequence = useCallback(() => {
    sequenceRef.current += 1
    return sequenceRef.current
  }, [])

  const buildBaseEnvelope = useCallback(
    (kind: string) => {
      if (!runtimeContext) {
        return null
      }

      const sequence = nextSequence()

      return {
        version: 'v1' as const,
        messageId: buildMessageId(kind, runtimeContext.appId, runtimeContext.appSessionId, sequence),
        correlationId: invocationMessage?.correlationId ?? bootstrapMessage?.correlationId,
        conversationId: runtimeContext.conversationId,
        appSessionId: runtimeContext.appSessionId,
        appId: runtimeContext.appId,
        sequence,
        sentAt: new Date().toISOString(),
        security: {
          handshakeToken: runtimeContext.handshakeToken,
          expectedOrigin: runtimeContext.expectedOrigin,
        },
      }
    },
    [bootstrapMessage?.correlationId, invocationMessage?.correlationId, nextSequence, runtimeContext]
  )

  const sendState = useCallback(
    (input: {
      status: RuntimeAppStatus
      summary: string
      state?: JsonObject
      progress?: {
        label?: string
        percent?: number
      }
    }) => {
      const base = buildBaseEnvelope('state')
      if (!base) {
        return
      }

      postRuntimeMessage(
        AppStateUpdateMessageSchema.parse({
          ...base,
          source: 'app',
          type: 'app.state',
          payload: {
            status: input.status,
            summary: input.summary,
            state: input.state ?? {},
            progress: input.progress,
          },
        })
      )
    },
    [buildBaseEnvelope, postRuntimeMessage]
  )

  const sendHeartbeat = useCallback(
    (status: 'alive' | 'busy' = 'alive', expiresInMs = 15_000) => {
      const base = buildBaseEnvelope('heartbeat')
      if (!base) {
        return
      }

      postRuntimeMessage(
        AppHeartbeatMessageSchema.parse({
          ...base,
          source: 'app',
          type: 'app.heartbeat',
          payload: {
            status,
            expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
          },
        })
      )
    },
    [buildBaseEnvelope, postRuntimeMessage]
  )

  const sendCompletion = useCallback(
    (completion: CompletionSignal) => {
      const base = buildBaseEnvelope('complete')
      if (!base) {
        return
      }

      postRuntimeMessage(
        AppCompletionMessageSchema.parse({
          ...base,
          source: 'app',
          type: 'app.complete',
          payload: completion,
        })
      )
    },
    [buildBaseEnvelope, postRuntimeMessage]
  )

  const sendError = useCallback(
    (input: { code: string; message: string; recoverable: boolean; details?: JsonObject }) => {
      const base = buildBaseEnvelope('error')
      if (!base) {
        return
      }

      postRuntimeMessage(
        AppErrorMessageSchema.parse({
          ...base,
          source: 'app',
          type: 'app.error',
          payload: input,
        })
      )
    },
    [buildBaseEnvelope, postRuntimeMessage]
  )

  useEffect(() => {
    if (!runtimeContext) {
      return
    }

    sendHeartbeat('alive')
    const timer = window.setInterval(() => {
      sendHeartbeat(invocationMessage ? 'busy' : 'alive')
    }, 10_000)

    return () => {
      window.clearInterval(timer)
    }
  }, [invocationMessage, runtimeContext, sendHeartbeat])

  return {
    bootstrapMessage,
    invocationMessage,
    runtimeContext,
    sendState,
    sendHeartbeat,
    sendCompletion,
    sendError,
  }
}
