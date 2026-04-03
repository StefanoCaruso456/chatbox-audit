import { ActionIcon, Badge, Box, Button, Group, Loader, Paper, Stack, Text } from '@mantine/core'
import {
  IconAlertTriangle,
  IconExternalLink,
  IconPlayerPlayFilled,
  IconRefresh,
  IconShieldLock,
} from '@tabler/icons-react'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ScalableIcon } from '../common/ScalableIcon'
import {
  buildEmbeddedAppSandbox,
  type EmbeddedAppHostCompletionSnapshot,
  type EmbeddedAppHostProps,
  type EmbeddedAppHostState,
  type EmbeddedAppHostTimeoutError,
  getEmbeddedAppStatusCopy,
  mapCompletionStatusToHostState,
  mapRuntimeStatusToHostState,
  normalizeEmbeddedAppSrc,
} from './embedded-app-host'
import {
  computeHeartbeatTimeout,
  createHostBootstrapMessage,
  createHostInvokeMessage,
  validateEmbeddedAppRuntimeMessage,
  validateRuntimeMessageOrigin,
} from './embedded-app-runtime'

function getStateTone(state: EmbeddedAppHostState) {
  if (state === 'error') {
    return {
      accent: 'var(--chatbox-tint-error)',
      background: 'linear-gradient(135deg, rgba(255, 245, 245, 0.96) 0%, rgba(255, 255, 255, 0.98) 100%)',
    }
  }

  if (state === 'complete' || state === 'ready') {
    return {
      accent: 'var(--chatbox-tint-success)',
      background: 'linear-gradient(135deg, rgba(240, 253, 250, 0.98) 0%, rgba(255, 255, 255, 0.98) 100%)',
    }
  }

  if (state === 'loading') {
    return {
      accent: 'var(--chatbox-tint-brand)',
      background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.98) 0%, rgba(255, 255, 255, 0.98) 100%)',
    }
  }

  return {
    accent: 'var(--chatbox-tint-warning)',
    background: 'linear-gradient(135deg, rgba(255, 251, 235, 0.98) 0%, rgba(255, 255, 255, 0.98) 100%)',
  }
}

function buildRuntimeMessageId(kind: string, appId: string, appSessionId: string, sequence: number): string {
  return `runtime.${kind}.${appId}.${appSessionId}.${sequence}`
}

function getActualOrigin(src: string | null): string | null {
  if (!src) {
    return null
  }

  try {
    return new URL(src).origin
  } catch {
    return null
  }
}

function getRuntimeGuardError(reason: string | null | undefined): string | null {
  if (!reason) {
    return null
  }

  if (reason === 'invalid-expected-origin') {
    return 'The embedded app manifest is missing a valid allowed origin.'
  }

  if (reason === 'missing-actual-origin' || reason === 'invalid-actual-origin') {
    return 'The embedded app URL could not be matched to an allowed origin.'
  }

  if (reason === 'mismatch') {
    return 'The embedded app origin did not match the approved sandbox origin.'
  }

  return null
}

function createTimeoutError(timeoutMs: number): EmbeddedAppHostTimeoutError {
  const timeoutSeconds = Math.max(1, Math.round(timeoutMs / 1000))
  return {
    code: 'app.heartbeat-timeout',
    message: `The embedded app stopped responding after ${timeoutSeconds} second${timeoutSeconds === 1 ? '' : 's'}.`,
    recoverable: true,
    details: {
      timeoutMs,
    },
  }
}

function getInitialHostState(
  state: EmbeddedAppHostProps['state'],
  completionStatus: EmbeddedAppHostCompletionSnapshot['status'] | undefined,
  normalizedSrc: string | null
): EmbeddedAppHostState {
  if (completionStatus) {
    return mapCompletionStatusToHostState(completionStatus)
  }

  return state ?? (normalizedSrc ? 'loading' : 'idle')
}

export const EmbeddedAppHost: FC<EmbeddedAppHostProps> = (props) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const sequenceRef = useRef(0)
  const bootstrapKeyRef = useRef<string | null>(null)
  const invocationKeyRef = useRef<string | null>(null)
  const heartbeatTimerRef = useRef<number | null>(null)
  const handshakeReplayTimersRef = useRef<number[]>([])
  const hasRuntimeResponseRef = useRef(false)

  const normalizedSrc = useMemo(() => normalizeEmbeddedAppSrc(props.src), [props.src])
  const actualOrigin = useMemo(() => getActualOrigin(normalizedSrc), [normalizedSrc])
  const runtimeAppSessionId = props.runtime?.appSessionId ?? props.appSessionId ?? `${props.appId}.session`
  const handshakeToken = props.runtime?.handshakeToken?.trim() || `runtime.${props.appId}.${runtimeAppSessionId}`
  const [retryNonce, setRetryNonce] = useState(0)
  const [recoveryDismissed, setRecoveryDismissed] = useState(false)
  const initialState = useMemo(
    () => getInitialHostState(props.state, props.runtime?.completion?.status, normalizedSrc),
    [normalizedSrc, props.runtime?.completion?.status, props.state]
  )
  const runtimeResetKey = useMemo(() => {
    return [
      props.appId,
      runtimeAppSessionId,
      props.runtime?.conversationId ?? '',
      normalizedSrc ?? '',
      props.runtime?.restartNonce ?? '',
      retryNonce,
    ].join('|')
  }, [
    normalizedSrc,
    props.appId,
    props.runtime?.conversationId,
    props.runtime?.restartNonce,
    runtimeAppSessionId,
    retryNonce,
  ])

  const originValidation = useMemo(() => {
    if (!props.runtime) {
      return null
    }

    return validateRuntimeMessageOrigin(props.runtime.expectedOrigin, actualOrigin)
  }, [actualOrigin, props.runtime])

  const runtimeGuardError = useMemo(() => {
    if (!props.runtime) {
      return null
    }

    return getRuntimeGuardError(originValidation?.reason)
  }, [originValidation?.reason, props.runtime])

  const [hasLoaded, setHasLoaded] = useState(false)
  const [hasRuntimeResponse, setHasRuntimeResponse] = useState(false)
  const [displayState, setDisplayState] = useState<EmbeddedAppHostState>(initialState)
  const [runtimeDescription, setRuntimeDescription] = useState<string | undefined>(
    props.runtime?.completion?.summary ?? props.description
  )
  const [runtimeErrorMessage, setRuntimeErrorMessage] = useState<string | undefined>(
    props.runtime?.completion?.errorMessage ?? props.errorMessage
  )

  const clearHeartbeatTimer = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      window.clearTimeout(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }, [])

  const clearHandshakeReplayTimers = useCallback(() => {
    handshakeReplayTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    handshakeReplayTimersRef.current = []
  }, [])

  const emitTimeout = useCallback(
    (timeoutMs: number) => {
      const timeoutError = createTimeoutError(timeoutMs)
      clearHeartbeatTimer()
      setDisplayState('error')
      setRuntimeErrorMessage(timeoutError.message)
      props.runtime?.onHeartbeatTimeout?.(timeoutError)
      props.runtime?.onRuntimeError?.(timeoutError)
    },
    [clearHeartbeatTimer, props.runtime]
  )

  const scheduleHeartbeatTimeout = useCallback(
    (sentAt: string, heartbeatExpiresAt?: string | null) => {
      const timeoutMs = props.runtime?.heartbeatTimeoutMs ?? props.runtime?.pendingInvocation?.timeoutMs ?? 45_000

      clearHeartbeatTimer()

      try {
        const heartbeat = computeHeartbeatTimeout({
          sentAt,
          timeoutMs,
          heartbeatExpiresAt,
          now: new Date(),
        })

        if (heartbeat.expired) {
          emitTimeout(timeoutMs)
          return
        }

        heartbeatTimerRef.current = window.setTimeout(() => {
          emitTimeout(timeoutMs)
        }, heartbeat.remainingMs)
      } catch {
        emitTimeout(timeoutMs)
      }
    },
    [clearHeartbeatTimer, emitTimeout, props.runtime]
  )

  useEffect(() => {
    return () => {
      clearHeartbeatTimer()
    }
  }, [clearHeartbeatTimer])

  useEffect(() => {
    void runtimeResetKey
    setHasLoaded(false)
    setRecoveryDismissed(false)
    setDisplayState(initialState)
    setRuntimeDescription(props.runtime?.completion?.summary ?? props.description)
    setRuntimeErrorMessage(props.runtime?.completion?.errorMessage ?? props.errorMessage)
    sequenceRef.current = 0
    bootstrapKeyRef.current = null
    invocationKeyRef.current = null
    hasRuntimeResponseRef.current = false
    setHasRuntimeResponse(false)
    clearHeartbeatTimer()
    clearHandshakeReplayTimers()
  }, [
    clearHandshakeReplayTimers,
    clearHeartbeatTimer,
    initialState,
    props.description,
    props.errorMessage,
    props.runtime?.completion?.errorMessage,
    props.runtime?.completion?.summary,
    runtimeResetKey,
  ])

  const handleRetry = useCallback(() => {
    setRecoveryDismissed(false)
    setRetryNonce((current) => current + 1)
    props.onRetry?.()
  }, [props])

  const handleContinueInChat = useCallback(() => {
    setRecoveryDismissed(true)
    props.onContinueInChat?.()
  }, [props])

  useEffect(() => {
    const runtime = props.runtime
    if (!runtime || runtimeGuardError) {
      return
    }

    const handleMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow
      if (event.source !== iframeWindow) {
        return
      }

      const originCheck = validateRuntimeMessageOrigin(runtime.expectedOrigin, event.origin)
      if (!originCheck.valid) {
        return
      }

      const validation = validateEmbeddedAppRuntimeMessage(event.data)
      if (!validation.success) {
        return
      }

      const message = validation.data
      if (message.source !== 'app') {
        return
      }

      if (
        message.appId !== props.appId ||
        message.conversationId !== runtime.conversationId ||
        message.appSessionId !== runtimeAppSessionId ||
        message.security.expectedOrigin !== originCheck.normalizedExpectedOrigin ||
        message.security.handshakeToken !== handshakeToken
      ) {
        return
      }

      if (!hasRuntimeResponseRef.current) {
        hasRuntimeResponseRef.current = true
        setHasRuntimeResponse(true)
        clearHandshakeReplayTimers()
      }

      if (message.type === 'app.state') {
        setDisplayState(mapRuntimeStatusToHostState(message.payload.status))
        setRuntimeDescription(message.payload.summary)
        if (message.payload.status !== 'failed') {
          setRuntimeErrorMessage(undefined)
        }
        runtime.onStateUpdate?.(message)
        scheduleHeartbeatTimeout(message.sentAt)
        return
      }

      if (message.type === 'app.heartbeat') {
        setDisplayState((currentState) => {
          if (currentState === 'error' || currentState === 'complete') {
            return currentState
          }

          return 'ready'
        })
        scheduleHeartbeatTimeout(message.sentAt, message.payload.expiresAt)
        return
      }

      if (message.type === 'app.complete') {
        clearHeartbeatTimer()
        setDisplayState(mapCompletionStatusToHostState(message.payload.status))
        setRuntimeDescription(message.payload.followUpContext.userVisibleSummary ?? message.payload.resultSummary)
        setRuntimeErrorMessage(
          message.payload.status === 'failed' || message.payload.status === 'timed-out'
            ? message.payload.resultSummary
            : undefined
        )
        runtime.onCompletion?.(message.payload)
        return
      }

      if (message.type === 'app.error') {
        clearHeartbeatTimer()
        setDisplayState('error')
        setRuntimeErrorMessage(message.payload.message)
        runtime.onRuntimeError?.(message)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [
    clearHeartbeatTimer,
    handshakeToken,
    props.appId,
    props.runtime,
    runtimeAppSessionId,
    runtimeGuardError,
    clearHandshakeReplayTimers,
    scheduleHeartbeatTimeout,
  ])

  const postRuntimeHandshake = useCallback(
    (forceReplay = false) => {
      const runtime = props.runtime
      if (!hasLoaded || !normalizedSrc || !runtime || runtimeGuardError || !originValidation?.valid) {
        return
      }

      const iframeWindow = iframeRef.current?.contentWindow
      const targetOrigin = originValidation.normalizedExpectedOrigin
      if (!iframeWindow || !targetOrigin) {
        return
      }

      const now = new Date().toISOString()
      const nextSequence = () => {
        sequenceRef.current += 1
        return sequenceRef.current
      }

      const bootstrapKey = JSON.stringify([
        runtime.conversationId,
        runtimeAppSessionId,
        runtime.bootstrap?.launchReason ?? 'manual-open',
        runtime.bootstrap?.messageId ?? '',
        runtime.bootstrap?.correlationId ?? '',
        runtime.bootstrap?.authState ?? 'not-required',
        runtime.bootstrap?.grantedPermissions ?? [],
        runtime.bootstrap?.availableTools?.map((tool) => tool.name) ?? [],
      ])

      if (forceReplay || bootstrapKeyRef.current !== bootstrapKey) {
        const bootstrapSequence = nextSequence()
        const bootstrapMessage = createHostBootstrapMessage({
          messageId:
            runtime.bootstrap?.messageId ??
            buildRuntimeMessageId('bootstrap', props.appId, runtimeAppSessionId, bootstrapSequence),
          correlationId: runtime.bootstrap?.correlationId,
          conversationId: runtime.conversationId,
          appSessionId: runtimeAppSessionId,
          appId: props.appId,
          sequence: bootstrapSequence,
          sentAt: now,
          expectedOrigin: targetOrigin,
          handshakeToken,
          launchReason: runtime.bootstrap?.launchReason ?? 'manual-open',
          authState: runtime.bootstrap?.authState ?? 'not-required',
          grantedPermissions: runtime.bootstrap?.grantedPermissions ?? [],
          embedUrl: normalizedSrc,
          initialState: runtime.bootstrap?.initialState,
          availableTools: runtime.bootstrap?.availableTools ?? [],
        })

        iframeWindow.postMessage(bootstrapMessage, targetOrigin)
        bootstrapKeyRef.current = bootstrapKey
        scheduleHeartbeatTimeout(now)
      }

      if (!runtime.pendingInvocation) {
        return
      }

      const invocationKey = JSON.stringify([
        runtime.pendingInvocation.toolCallId,
        runtime.pendingInvocation.toolName,
        runtime.pendingInvocation.messageId ?? '',
        runtime.pendingInvocation.correlationId ?? '',
        runtime.pendingInvocation.timeoutMs ?? '',
        runtime.pendingInvocation.arguments ?? {},
      ])

      if (!forceReplay && invocationKeyRef.current === invocationKey) {
        return
      }

      const invokeSequence = nextSequence()
      const invokeMessage = createHostInvokeMessage({
        messageId:
          runtime.pendingInvocation.messageId ??
          buildRuntimeMessageId('invoke', props.appId, runtimeAppSessionId, invokeSequence),
        correlationId: runtime.pendingInvocation.correlationId,
        conversationId: runtime.conversationId,
        appSessionId: runtimeAppSessionId,
        appId: props.appId,
        sequence: invokeSequence,
        sentAt: now,
        expectedOrigin: targetOrigin,
        handshakeToken,
        toolCallId: runtime.pendingInvocation.toolCallId,
        toolName: runtime.pendingInvocation.toolName,
        arguments: runtime.pendingInvocation.arguments ?? {},
        timeoutMs: runtime.pendingInvocation.timeoutMs,
      })

      iframeWindow.postMessage(invokeMessage, targetOrigin)
      invocationKeyRef.current = invocationKey
      setDisplayState((currentState) => (currentState === 'complete' ? currentState : 'loading'))
      setRuntimeDescription((currentDescription) => {
        return currentDescription ?? `${runtime.pendingInvocation?.toolName} pending`
      })
      scheduleHeartbeatTimeout(now)
    },
    [
      handshakeToken,
      hasLoaded,
      normalizedSrc,
      originValidation?.normalizedExpectedOrigin,
      originValidation?.valid,
      props.appId,
      props.runtime,
      runtimeAppSessionId,
      runtimeGuardError,
      scheduleHeartbeatTimeout,
    ]
  )

  useEffect(() => {
    if (!hasLoaded || !normalizedSrc || !props.runtime || runtimeGuardError || !originValidation?.valid) {
      return
    }

    postRuntimeHandshake(false)
  }, [hasLoaded, normalizedSrc, originValidation?.valid, postRuntimeHandshake, props.runtime, runtimeGuardError])

  useEffect(() => {
    if (!hasLoaded || !props.runtime || runtimeGuardError || hasRuntimeResponse) {
      clearHandshakeReplayTimers()
      return
    }

    const replayDelays = [180, 720, 1_600]
    handshakeReplayTimersRef.current = replayDelays.map((delayMs) =>
      window.setTimeout(() => {
        if (!hasRuntimeResponseRef.current) {
          postRuntimeHandshake(true)
        }
      }, delayMs)
    )

    return () => {
      clearHandshakeReplayTimers()
    }
  }, [
    clearHandshakeReplayTimers,
    hasLoaded,
    hasRuntimeResponse,
    postRuntimeHandshake,
    props.runtime,
    runtimeGuardError,
  ])

  const effectiveState: EmbeddedAppHostState = runtimeGuardError ? 'error' : !normalizedSrc ? 'error' : displayState
  const statusCopy = getEmbeddedAppStatusCopy(effectiveState)
  const tone = getStateTone(effectiveState)
  const hasError = effectiveState === 'error'
  const showRecoveryPanel = hasError && recoveryDismissed
  const iframeTitle = props.iframeTitle || `${props.appName} embedded app`
  const displayTitle = props.title || props.appName
  const displaySubtitle = props.subtitle || props.appSlug || props.appId
  const displayDescription = runtimeDescription || props.description || statusCopy.description
  const displayErrorMessage =
    runtimeGuardError ||
    runtimeErrorMessage ||
    props.errorMessage ||
    'The embedded app could not be loaded. Retry the launch or continue the conversation in chat.'
  const shouldRevealIframe = hasLoaded && !hasError
  const shouldShowLoadingOverlay = !shouldRevealIframe && !hasError
  const shouldShowErrorOverlay = hasError && !showRecoveryPanel

  return (
    <Paper
      withBorder
      radius="lg"
      data-testid="embedded-app-host"
      className={cn(
        'overflow-hidden border border-slate-200/80 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.55)]',
        props.className
      )}
      style={{
        background: tone.background,
        borderColor: 'rgba(148, 163, 184, 0.35)',
      }}
    >
      <Stack gap={0}>
        <Box
          className="border-b border-slate-200/70 px-4 py-3"
          style={{
            background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.92) 100%)',
          }}
        >
          <Group justify="space-between" gap="sm" align="flex-start" wrap="nowrap">
            <Stack gap={4} className="min-w-0">
              <Group gap="xs" wrap="nowrap">
                <Badge
                  variant="light"
                  color={
                    hasError ? 'red' : effectiveState === 'complete' || effectiveState === 'ready' ? 'teal' : 'blue'
                  }
                  leftSection={<ScalableIcon icon={IconShieldLock} size={12} />}
                  className="uppercase tracking-[0.12em]"
                >
                  {statusCopy.badge}
                </Badge>
                <Text fw={700} size="sm" className="truncate">
                  {displayTitle}
                </Text>
              </Group>
              <Text size="xs" c="dimmed" className="truncate">
                {displaySubtitle}
              </Text>
            </Stack>

            <Group gap={6} wrap="nowrap">
              {props.onOpenInNewTab && normalizedSrc && (
                <ActionIcon
                  variant="subtle"
                  radius="md"
                  aria-label="Open embedded app in a new tab"
                  onClick={props.onOpenInNewTab}
                >
                  <ScalableIcon icon={IconExternalLink} />
                </ActionIcon>
              )}
              <ActionIcon variant="subtle" radius="md" aria-label="Retry embedded app" onClick={handleRetry}>
                <ScalableIcon icon={IconRefresh} />
              </ActionIcon>
            </Group>
          </Group>
          <Text size="sm" mt={8} className="leading-6 text-slate-700">
            {displayDescription}
          </Text>
        </Box>

        <Box
          className="relative min-h-[320px] overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at top left, rgba(59, 130, 246, 0.14), transparent 45%), radial-gradient(circle at top right, rgba(14, 165, 233, 0.12), transparent 30%)',
            minHeight: typeof props.height === 'number' ? `${props.height}px` : props.height || 320,
          }}
        >
          {!hasError && normalizedSrc && (
            <iframe
              key={runtimeResetKey}
              ref={iframeRef}
              data-testid="embedded-app-host-iframe"
              title={iframeTitle}
              src={normalizedSrc}
              sandbox={buildEmbeddedAppSandbox(props.sandbox)}
              allow={props.allow}
              className={cn('absolute inset-0 h-full w-full border-0 transition-opacity duration-300', {
                'opacity-100': shouldRevealIframe,
                'opacity-0': !shouldRevealIframe,
              })}
              onLoad={() => {
                setHasLoaded(true)
                props.onLoad?.()
              }}
              onError={() => {
                setDisplayState('error')
                setRuntimeErrorMessage('The embedded iframe failed to load.')
                props.onError?.()
              }}
            />
          )}

          {showRecoveryPanel ? (
            <Box
              data-testid="embedded-app-host-recovery"
              className="absolute inset-0 flex items-center justify-center p-5"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(254,242,242,0.92) 100%)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <Stack gap="sm" align="center" maw={420} className="text-center">
                <Box
                  className="flex h-12 w-12 items-center justify-center rounded-full"
                  style={{
                    background: 'rgba(254, 226, 226, 0.95)',
                    color: tone.accent,
                  }}
                >
                  <ScalableIcon icon={IconAlertTriangle} size={20} color={tone.accent} />
                </Box>
                <Stack gap={4}>
                  <Text fw={700} size="md">
                    App session ended
                  </Text>
                  <Text size="sm" className="text-slate-600">
                    You can keep chatting while we preserve the failure summary here.
                  </Text>
                </Stack>
                <Group gap="xs" justify="center">
                  <Button radius="md" onClick={handleRetry}>
                    Retry app
                  </Button>
                  {props.onOpenInNewTab && normalizedSrc && (
                    <Button
                      variant="light"
                      radius="md"
                      leftSection={<ScalableIcon icon={IconExternalLink} size={14} />}
                      onClick={props.onOpenInNewTab}
                    >
                      Open in new tab
                    </Button>
                  )}
                </Group>
              </Stack>
            </Box>
          ) : shouldShowErrorOverlay || shouldShowLoadingOverlay ? (
            <Box
              data-testid="embedded-app-host-overlay"
              className="absolute inset-0 flex items-center justify-center p-5"
              style={{
                background: hasError
                  ? 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(254,242,242,0.95) 100%)'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.35) 100%)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <Stack gap="sm" align="center" maw={420} className="text-center">
                <Box
                  className="flex h-14 w-14 items-center justify-center rounded-full"
                  style={{
                    background: hasError ? 'rgba(254, 226, 226, 0.95)' : 'rgba(219, 234, 254, 0.92)',
                    color: tone.accent,
                  }}
                >
                  <ScalableIcon
                    icon={hasError ? IconAlertTriangle : IconPlayerPlayFilled}
                    size={22}
                    color={tone.accent}
                  />
                </Box>
                <Stack gap={4}>
                  <Text fw={700} size="md">
                    {hasError ? props.errorTitle || 'App blocked or unavailable' : statusCopy.title}
                  </Text>
                  <Text size="sm" className="text-slate-600">
                    {hasError ? displayErrorMessage : props.loadingLabel || statusCopy.description}
                  </Text>
                </Stack>
                {hasError ? (
                  <Group gap="xs" justify="center">
                    <Button radius="md" onClick={handleRetry}>
                      Retry app
                    </Button>
                    <Button variant="light" radius="md" onClick={handleContinueInChat}>
                      Continue in chat
                    </Button>
                    {props.onOpenInNewTab && normalizedSrc && (
                      <Button
                        variant="light"
                        radius="md"
                        leftSection={<ScalableIcon icon={IconExternalLink} size={14} />}
                        onClick={props.onOpenInNewTab}
                      >
                        Open in new tab
                      </Button>
                    )}
                  </Group>
                ) : (
                  <Group gap="xs" justify="center" className="text-slate-600">
                    <Loader size="sm" color={tone.accent} />
                    <Text size="xs" tt="uppercase" fw={700} className="tracking-[0.14em]">
                      {props.loadingLabel || 'Connecting sandbox'}
                    </Text>
                  </Group>
                )}
              </Stack>
            </Box>
          ) : null}
        </Box>
      </Stack>
    </Paper>
  )
}

export default EmbeddedAppHost
