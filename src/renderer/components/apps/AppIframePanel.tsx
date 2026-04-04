import { ActionIcon, Box, Button, Drawer, Flex, Group, Loader, Stack, Text, Title } from '@mantine/core'
import type { JsonObject } from '@shared/contracts/v1'
import { IconLayoutGrid, IconReload, IconX } from '@tabler/icons-react'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import EmbeddedAppHost from '@/components/message-parts/EmbeddedAppHost'
import {
  createHostBootstrapMessage,
  createHostInvokeMessage,
  validateEmbeddedAppRuntimeMessage,
  validateRuntimeMessageOrigin,
} from '@/components/message-parts/embedded-app-runtime'
import { getApprovedAppById } from '@/data/approvedApps'
import { useScreenDownToMD } from '@/hooks/useScreenChange'
import { probeForNewerBuild } from '@/lib/build-freshness'
import { cn } from '@/lib/utils'
import { currentSessionIdAtom } from '@/stores/atoms'
import { useSession } from '@/stores/chatStore'
import {
  getSidebarAppRuntimeCommand,
  rejectSidebarAppRuntimeCommand,
  resolveSidebarAppRuntimeCommand,
  subscribeSidebarAppRuntimeCommands,
} from '@/stores/sidebarAppRuntimeCommandStore'
import { clearSidebarAppRuntimeSnapshot, upsertSidebarAppRuntimeSnapshot } from '@/stores/sidebarAppRuntimeStore'
import { useUIStore } from '@/stores/uiStore'
import { type ApprovedApp, appIntegrationModeMeta } from '@/types/apps'
import { isSidebarDirectIframeStateMessage } from './sidebarDirectIframeState'
import AppIcon from './AppIcon'
import { resolveAppPanelLaunchUrl, resolveApprovedAppPanelRuntime } from './app-panel-runtime'

const iframeSandbox = [
  'allow-downloads',
  'allow-forms',
  'allow-modals',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-same-origin',
  'allow-scripts',
].join(' ')

const APP_LOAD_TIMEOUT_MS = 7000

function buildRuntimeMessageId(kind: string, appId: string, appSessionId: string, sequence: number): string {
  return `runtime.${kind}.${appId}.${appSessionId}.${sequence}`
}

type AppLoadState = 'loading' | 'ready' | 'blocked'

function toJsonObject(value: unknown): JsonObject | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject
  }

  return undefined
}

function getDefaultFallbackCopy(app: ApprovedApp, t: ReturnType<typeof useTranslation>['t']) {
  if (app.integrationMode === 'browser-session') {
    return {
      title: t('{{name}} needs a governed browser session', { name: app.name }),
      description: t(
        'This vendor usually blocks standard iframe embedding. Keep it inside ChatBridge by launching it through a browser-session style flow instead of a raw vendor iframe.'
      ),
    }
  }

  if (app.integrationMode === 'api-adapter') {
    return {
      title: t('{{name}} uses an adapter workspace', { name: app.name }),
      description: t(
        'This app is intended to run through a ChatBridge-owned adapter UI backed by APIs and school configuration, not by loading the vendor homepage directly.'
      ),
    }
  }

  if (app.integrationMode === 'native-replacement') {
    return {
      title: t('{{name}} will use a ChatBridge-native experience', { name: app.name }),
      description: t(
        'This learning workflow is better represented by a ChatBridge-built experience than by embedding the vendor product directly.'
      ),
    }
  }

  if (app.embedStatus === 'needs-district-url') {
    return {
      title: t('This app needs a school-specific launch link'),
      description: t(
        'Canvas and similar district-managed tools often need a verified school iframe launch URL before they can open beside chat. Switch to another app or come back once the school launch link is configured.'
      ),
    }
  }

  if (app.experience === 'tutormeai-runtime') {
    return {
      title: t('{{name}} is still connecting', { name: app.name }),
      description: t(
        'This TutorMeAI runtime is still booting inside the sidebar. Reload the panel or switch apps while the embedded session reconnects.'
      ),
    }
  }

  return {
    title: t('{{name}} is not loading in the sidebar', { name: app.name }),
    description: t(
      'This usually means the vendor blocks iframe embedding or the page is taking longer to initialize. Reload the panel or switch apps.'
    ),
  }
}

function AppPanelHeader({ app, onClose }: { app: ApprovedApp; onClose: () => void }) {
  const { t } = useTranslation()

  return (
    <Flex justify="space-between" align="center" gap="sm">
      <Flex align="center" gap="sm" className="min-w-0">
        <AppIcon app={app} w={38} h={38} radius="lg" />
        <Stack gap={0} className="min-w-0">
          <Title order={4} fz="md" className="truncate">
            {app.name}
          </Title>
          <Text size="xs" c="chatbox-secondary" className="truncate">
            {app.experience === 'tutormeai-runtime'
              ? t('TutorMeAI runtime')
              : appIntegrationModeMeta[app.integrationMode].label}
          </Text>
        </Stack>
      </Flex>

      <ActionIcon variant="subtle" color="chatbox-secondary" onClick={onClose} aria-label={t('Close app')}>
        <IconX size={18} />
      </ActionIcon>
    </Flex>
  )
}

function AppLoadingFallback({
  app,
  onRetry,
  onSwitchApps,
  showRetryButton,
}: {
  app: ApprovedApp
  onRetry: () => void
  onSwitchApps: () => void
  showRetryButton: boolean
}) {
  const { t } = useTranslation()
  const defaultCopy = getDefaultFallbackCopy(app, t)
  const fallbackTitle = app.loadingFallback?.title ?? defaultCopy.title
  const fallbackBody = app.loadingFallback?.body ?? defaultCopy.description

  return (
    <div
      data-testid="app-iframe-panel-fallback"
      className="absolute inset-0 flex items-end justify-center bg-slate-950/52 p-3 backdrop-blur-[2px] sm:items-center sm:p-4"
    >
      <Stack
        gap="sm"
        className="w-full max-w-sm rounded-[1.25rem] border border-white/12 bg-slate-950/92 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.4)]"
      >
        <Text size="sm" fw={700} c="white">
          {fallbackTitle}
        </Text>
        <Text size="xs" c="rgba(255,255,255,0.74)">
          {fallbackBody}
        </Text>
        <Group gap={6} wrap="wrap">
          {showRetryButton ? (
            <Button
              size="xs"
              variant="light"
              color="chatbox-brand"
              leftSection={<IconReload size={14} />}
              onClick={onRetry}
            >
              {t('Reload panel')}
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="subtle"
            color="chatbox-secondary"
            leftSection={<IconLayoutGrid size={14} />}
            onClick={onSwitchApps}
          >
            {t('Switch apps')}
          </Button>
        </Group>
      </Stack>
    </div>
  )
}

function AppIframeSurface({ app }: { app: ApprovedApp }) {
  const { t } = useTranslation()
  const closeApprovedApp = useUIStore((state) => state.closeApprovedApp)
  const setApprovedAppsModalOpen = useUIStore((state) => state.setApprovedAppsModalOpen)
  const currentSessionId = useAtomValue(currentSessionIdAtom)
  const { session } = useSession(currentSessionId)

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const loadTimeoutRef = useRef<number | null>(null)
  const runtimeSequenceRef = useRef(0)
  const runtimeBootstrapKeyRef = useRef<string | null>(null)
  const runtimeInvocationKeyRef = useRef<string | null>(null)
  const runtimeReplayTimersRef = useRef<number[]>([])
  const hasRuntimeResponseRef = useRef(false)
  const lastSidebarCommandToolCallIdRef = useRef<string | null>(null)
  const [launchSessionKey] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [loadState, setLoadState] = useState<AppLoadState>('loading')
  const [sidebarCommandVersion, setSidebarCommandVersion] = useState(0)
  const runtimeAppId = app.runtimeBridge?.appId ?? app.id

  const iframeInstanceKey = `${app.id}:${reloadNonce}`
  const directIframeLaunchArguments =
    app.experience === 'tutormeai-runtime' && app.runtimeBridge?.sidebarMode === 'direct-iframe'
      ? app.runtimeBridge.pendingInvocation?.arguments
      : undefined
  const resolvedLaunchUrl = useMemo(
    () =>
      resolveAppPanelLaunchUrl(app.launchUrl, {
        cacheBustKey: `${launchSessionKey}-${reloadNonce}`,
        launchArguments: directIframeLaunchArguments,
      }),
    [app.launchUrl, directIframeLaunchArguments, launchSessionKey, reloadNonce]
  )
  const embeddedRuntime = useMemo(
    () =>
      resolveApprovedAppPanelRuntime(app, resolvedLaunchUrl, reloadNonce, {
        sessionId: currentSessionId,
        session,
      }),
    [app, currentSessionId, reloadNonce, resolvedLaunchUrl, session]
  )
  const usesEmbeddedRuntime =
    app.experience === 'tutormeai-runtime' &&
    app.runtimeBridge?.sidebarMode !== 'direct-iframe' &&
    Boolean(embeddedRuntime)
  const usesDirectRuntimeBridge =
    app.experience === 'tutormeai-runtime' &&
    app.runtimeBridge?.sidebarMode === 'direct-iframe' &&
    Boolean(embeddedRuntime)
  const runtimeResetKey = `${app.id}:${embeddedRuntime?.appSessionId ?? ''}:${embeddedRuntime?.conversationId ?? ''}:${embeddedRuntime?.restartNonce ?? ''}:${reloadNonce}`
  const pendingSidebarRuntimeCommand =
    currentSessionId && app.experience === 'tutormeai-runtime'
      ? getSidebarAppRuntimeCommand(currentSessionId, runtimeAppId)
      : null

  const syncSidebarRuntimeSnapshot = useCallback(
    (input: {
      status: 'pending' | 'active' | 'waiting-auth' | 'waiting-user' | 'completed' | 'failed'
      summary: string
      latestStateDigest?: JsonObject
      errorMessage?: string
    }) => {
      if (!currentSessionId || app.experience !== 'tutormeai-runtime' || !embeddedRuntime) {
        return
      }

      upsertSidebarAppRuntimeSnapshot({
        hostSessionId: currentSessionId,
        approvedAppId: app.id,
        runtimeAppId,
        appSessionId: embeddedRuntime.appSessionId,
        conversationId: embeddedRuntime.conversationId,
        expectedOrigin: embeddedRuntime.expectedOrigin,
        sourceUrl: resolvedLaunchUrl,
        authState: embeddedRuntime.bootstrap?.authState ?? 'not-required',
        availableToolNames: embeddedRuntime.bootstrap?.availableTools?.map((tool) => tool.name) ?? [],
        status: input.status,
        summary: input.summary,
        latestStateDigest: input.latestStateDigest,
        updatedAt: new Date().toISOString(),
        errorMessage: input.errorMessage,
      })
    },
    [app.experience, app.id, currentSessionId, embeddedRuntime, resolvedLaunchUrl, runtimeAppId]
  )

  useEffect(() => {
    if (app.experience !== 'tutormeai-runtime' || typeof window === 'undefined' || window.top !== window) {
      return
    }

    void probeForNewerBuild().catch(() => {
      // If the probe fails, keep the current shell and let the sidebar continue.
    })
  }, [app.experience])

  useEffect(() => {
    return subscribeSidebarAppRuntimeCommands(() => {
      setSidebarCommandVersion((value) => value + 1)
    })
  }, [])

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current !== null) {
      window.clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
  }, [])

  const clearRuntimeReplayTimers = useCallback(() => {
    runtimeReplayTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    runtimeReplayTimersRef.current = []
  }, [])

  const startLoadingAttempt = useCallback(() => {
    clearLoadTimeout()

    if (usesEmbeddedRuntime) {
      setLoadState('ready')
      return
    }

    setLoadState('loading')
    loadTimeoutRef.current = window.setTimeout(() => {
      setLoadState((currentState) => (currentState === 'loading' ? 'blocked' : currentState))
      loadTimeoutRef.current = null
    }, APP_LOAD_TIMEOUT_MS)
  }, [clearLoadTimeout, usesEmbeddedRuntime])

  useEffect(() => {
    startLoadingAttempt()

    return () => {
      clearLoadTimeout()
      clearRuntimeReplayTimers()
    }
  }, [clearLoadTimeout, clearRuntimeReplayTimers, startLoadingAttempt])

  useEffect(() => {
    void runtimeResetKey
    runtimeSequenceRef.current = 0
    runtimeBootstrapKeyRef.current = null
    runtimeInvocationKeyRef.current = null
    hasRuntimeResponseRef.current = false
    lastSidebarCommandToolCallIdRef.current = null
    clearRuntimeReplayTimers()
  }, [clearRuntimeReplayTimers, runtimeResetKey])

  useEffect(() => {
    if (app.experience !== 'tutormeai-runtime' || !currentSessionId || !embeddedRuntime) {
      return
    }

    syncSidebarRuntimeSnapshot({
      status:
        embeddedRuntime.completion?.status === 'failed' || embeddedRuntime.completion?.status === 'timed-out'
          ? 'failed'
          : embeddedRuntime.completion
            ? 'completed'
            : embeddedRuntime.bootstrap?.authState === 'required' || embeddedRuntime.bootstrap?.authState === 'expired'
              ? 'waiting-auth'
              : embeddedRuntime.pendingInvocation
                ? 'pending'
                : 'waiting-user',
      summary:
        embeddedRuntime.completion?.summary ??
        (embeddedRuntime.pendingInvocation
          ? `${app.name} is preparing ${embeddedRuntime.pendingInvocation.toolName}.`
          : `${app.name} is open in the right sidebar.`),
      latestStateDigest:
        toJsonObject(embeddedRuntime.completion?.resultPayload) ?? embeddedRuntime.bootstrap?.initialState,
      errorMessage: embeddedRuntime.completion?.errorMessage,
    })

    return () => {
      clearSidebarAppRuntimeSnapshot(currentSessionId, runtimeAppId)
    }
  }, [app.experience, app.name, currentSessionId, embeddedRuntime, runtimeAppId, syncSidebarRuntimeSnapshot])

  const postDirectRuntimeHandshake = useCallback(
    (forceReplay = false) => {
      if (!usesDirectRuntimeBridge || !embeddedRuntime) {
        return
      }

      const iframeWindow = iframeRef.current?.contentWindow
      if (!iframeWindow) {
        return
      }

      const originCheck = validateRuntimeMessageOrigin(embeddedRuntime.expectedOrigin, embeddedRuntime.expectedOrigin)
      if (!originCheck.valid || !originCheck.normalizedExpectedOrigin) {
        return
      }

      const runtimeAppId = app.runtimeBridge?.appId ?? app.id
      const nextSequence = () => {
        runtimeSequenceRef.current += 1
        return runtimeSequenceRef.current
      }
      const sentAt = new Date().toISOString()

      const bootstrapKey = JSON.stringify([
        embeddedRuntime.conversationId,
        embeddedRuntime.appSessionId,
        embeddedRuntime.bootstrap?.launchReason ?? 'manual-open',
        embeddedRuntime.bootstrap?.messageId ?? '',
        embeddedRuntime.bootstrap?.correlationId ?? '',
        embeddedRuntime.bootstrap?.authState ?? 'not-required',
        embeddedRuntime.bootstrap?.grantedPermissions ?? [],
        embeddedRuntime.bootstrap?.availableTools?.map((tool) => tool.name) ?? [],
      ])

      if (forceReplay || runtimeBootstrapKeyRef.current !== bootstrapKey) {
        const bootstrapSequence = nextSequence()
        iframeWindow.postMessage(
          createHostBootstrapMessage({
            messageId:
              embeddedRuntime.bootstrap?.messageId ??
              buildRuntimeMessageId('bootstrap', runtimeAppId, embeddedRuntime.appSessionId, bootstrapSequence),
            correlationId: embeddedRuntime.bootstrap?.correlationId,
            conversationId: embeddedRuntime.conversationId,
            appSessionId: embeddedRuntime.appSessionId,
            appId: runtimeAppId,
            sequence: bootstrapSequence,
            sentAt,
            expectedOrigin: originCheck.normalizedExpectedOrigin,
            handshakeToken: embeddedRuntime.handshakeToken,
            launchReason: embeddedRuntime.bootstrap?.launchReason ?? 'manual-open',
            authState: embeddedRuntime.bootstrap?.authState ?? 'not-required',
            grantedPermissions: embeddedRuntime.bootstrap?.grantedPermissions ?? [],
            embedUrl: resolvedLaunchUrl,
            initialState: embeddedRuntime.bootstrap?.initialState,
            availableTools: embeddedRuntime.bootstrap?.availableTools ?? [],
          }),
          originCheck.normalizedExpectedOrigin
        )
        runtimeBootstrapKeyRef.current = bootstrapKey
      }

      if (!embeddedRuntime.pendingInvocation) {
        return
      }

      const invocationKey = JSON.stringify([
        embeddedRuntime.pendingInvocation.toolCallId,
        embeddedRuntime.pendingInvocation.toolName,
        embeddedRuntime.pendingInvocation.messageId ?? '',
        embeddedRuntime.pendingInvocation.correlationId ?? '',
        embeddedRuntime.pendingInvocation.timeoutMs ?? '',
        embeddedRuntime.pendingInvocation.arguments ?? {},
      ])

      if (!forceReplay && runtimeInvocationKeyRef.current === invocationKey) {
        return
      }

      const invokeSequence = nextSequence()
      iframeWindow.postMessage(
        createHostInvokeMessage({
          messageId:
            embeddedRuntime.pendingInvocation.messageId ??
            buildRuntimeMessageId('invoke', runtimeAppId, embeddedRuntime.appSessionId, invokeSequence),
          correlationId: embeddedRuntime.pendingInvocation.correlationId,
          conversationId: embeddedRuntime.conversationId,
          appSessionId: embeddedRuntime.appSessionId,
          appId: runtimeAppId,
          sequence: invokeSequence,
          sentAt,
          expectedOrigin: originCheck.normalizedExpectedOrigin,
          handshakeToken: embeddedRuntime.handshakeToken,
          toolCallId: embeddedRuntime.pendingInvocation.toolCallId,
          toolName: embeddedRuntime.pendingInvocation.toolName,
          arguments: embeddedRuntime.pendingInvocation.arguments ?? {},
          timeoutMs: embeddedRuntime.pendingInvocation.timeoutMs,
        }),
        originCheck.normalizedExpectedOrigin
      )
      runtimeInvocationKeyRef.current = invocationKey
    },
    [app.id, app.runtimeBridge?.appId, embeddedRuntime, resolvedLaunchUrl, usesDirectRuntimeBridge]
  )

  const postDirectRuntimeCommand = useCallback(
    (command: { toolCallId: string; toolName: string; arguments: JsonObject; timeoutMs?: number }) => {
      if (!usesDirectRuntimeBridge || !embeddedRuntime) {
        return false
      }

      const iframeWindow = iframeRef.current?.contentWindow
      if (!iframeWindow) {
        return false
      }

      const originCheck = validateRuntimeMessageOrigin(embeddedRuntime.expectedOrigin, embeddedRuntime.expectedOrigin)
      if (!originCheck.valid || !originCheck.normalizedExpectedOrigin) {
        return false
      }

      runtimeSequenceRef.current += 1
      const sequence = runtimeSequenceRef.current

      iframeWindow.postMessage(
        createHostInvokeMessage({
          messageId: buildRuntimeMessageId('invoke', runtimeAppId, embeddedRuntime.appSessionId, sequence),
          correlationId: `${runtimeAppId}.${command.toolCallId}`,
          conversationId: embeddedRuntime.conversationId,
          appSessionId: embeddedRuntime.appSessionId,
          appId: runtimeAppId,
          sequence,
          sentAt: new Date().toISOString(),
          expectedOrigin: originCheck.normalizedExpectedOrigin,
          handshakeToken: embeddedRuntime.handshakeToken,
          toolCallId: command.toolCallId,
          toolName: command.toolName,
          arguments: command.arguments,
          timeoutMs: command.timeoutMs,
        }),
        originCheck.normalizedExpectedOrigin
      )

      return true
    },
    [embeddedRuntime, runtimeAppId, usesDirectRuntimeBridge]
  )

  const scheduleRuntimeHandshakeReplay = useCallback(() => {
    clearRuntimeReplayTimers()
    if (!usesDirectRuntimeBridge || !embeddedRuntime) {
      return
    }

    const replayDelays = [180, 720, 1_600]
    runtimeReplayTimersRef.current = replayDelays.map((delayMs) =>
      window.setTimeout(() => {
        if (!hasRuntimeResponseRef.current) {
          postDirectRuntimeHandshake(true)
        }
      }, delayMs)
    )
  }, [clearRuntimeReplayTimers, embeddedRuntime, postDirectRuntimeHandshake, usesDirectRuntimeBridge])

  useEffect(() => {
    if (!usesDirectRuntimeBridge || !embeddedRuntime) {
      return
    }

    const runtimeAppId = app.runtimeBridge?.appId ?? app.id

    const handleMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow
      if (event.source !== iframeWindow) {
        return
      }

      const originCheck = validateRuntimeMessageOrigin(embeddedRuntime.expectedOrigin, event.origin)
      if (!originCheck.valid) {
        return
      }

      if (isSidebarDirectIframeStateMessage(event.data) && event.data.appId === runtimeAppId) {
        if (!hasRuntimeResponseRef.current) {
          hasRuntimeResponseRef.current = true
          clearRuntimeReplayTimers()
        }

        clearLoadTimeout()
        setLoadState(event.data.payload.status === 'failed' ? 'blocked' : 'ready')
        syncSidebarRuntimeSnapshot({
          status: event.data.payload.status,
          summary: event.data.payload.summary,
          latestStateDigest: event.data.payload.state,
        })
        return
      }

      const validation = validateEmbeddedAppRuntimeMessage(event.data)
      if (!validation.success) {
        return
      }

      const message = validation.data
      if (
        message.source !== 'app' ||
        message.appId !== runtimeAppId ||
        message.conversationId !== embeddedRuntime.conversationId ||
        message.appSessionId !== embeddedRuntime.appSessionId ||
        message.security.handshakeToken !== embeddedRuntime.handshakeToken ||
        message.security.expectedOrigin !== originCheck.normalizedExpectedOrigin
      ) {
        return
      }

      if (!hasRuntimeResponseRef.current) {
        hasRuntimeResponseRef.current = true
        clearRuntimeReplayTimers()
      }

      clearLoadTimeout()

      if (message.type === 'app.state') {
        setLoadState(message.payload.status === 'failed' ? 'blocked' : 'ready')
        syncSidebarRuntimeSnapshot({
          status: message.payload.status,
          summary: message.payload.summary,
          latestStateDigest: message.payload.state,
        })
        embeddedRuntime.onStateUpdate?.(message)
        return
      }

      if (message.type === 'app.heartbeat') {
        setLoadState('ready')
        return
      }

      if (message.type === 'app.complete') {
        setLoadState('ready')
        syncSidebarRuntimeSnapshot({
          status:
            message.payload.status === 'failed' || message.payload.status === 'timed-out' ? 'failed' : 'completed',
          summary: message.payload.resultSummary,
          latestStateDigest: toJsonObject(message.payload.result),
          errorMessage:
            message.payload.status === 'failed' || message.payload.status === 'timed-out'
              ? message.payload.resultSummary
              : undefined,
        })
        if (message.payload.toolCallId) {
          resolveSidebarAppRuntimeCommand(message.payload.toolCallId, message.payload)
        }
        embeddedRuntime.onCompletion?.(message.payload)
        return
      }

      if (message.type === 'app.error') {
        setLoadState('blocked')
        syncSidebarRuntimeSnapshot({
          status: 'failed',
          summary: message.payload.message,
          latestStateDigest: embeddedRuntime.bootstrap?.initialState,
          errorMessage: message.payload.message,
        })
        const erroredToolCallId =
          typeof message.payload.details?.toolCallId === 'string' ? message.payload.details.toolCallId : null
        if (erroredToolCallId) {
          rejectSidebarAppRuntimeCommand(erroredToolCallId, message.payload.message)
        }
        embeddedRuntime.onRuntimeError?.(message)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [
    app.id,
    app.runtimeBridge?.appId,
    clearLoadTimeout,
    clearRuntimeReplayTimers,
    embeddedRuntime,
    syncSidebarRuntimeSnapshot,
    usesDirectRuntimeBridge,
  ])

  useEffect(() => {
    if (!usesDirectRuntimeBridge || !pendingSidebarRuntimeCommand || !currentSessionId) {
      return
    }

    if (pendingSidebarRuntimeCommand.hostSessionId !== currentSessionId) {
      return
    }

    if (lastSidebarCommandToolCallIdRef.current === pendingSidebarRuntimeCommand.toolCallId) {
      return
    }

    const didPost = postDirectRuntimeCommand({
      toolCallId: pendingSidebarRuntimeCommand.toolCallId,
      toolName: pendingSidebarRuntimeCommand.toolName,
      arguments: pendingSidebarRuntimeCommand.arguments,
      timeoutMs: pendingSidebarRuntimeCommand.timeoutMs,
    })

    if (didPost) {
      lastSidebarCommandToolCallIdRef.current = pendingSidebarRuntimeCommand.toolCallId
      setLoadState('loading')
    }
  }, [
    currentSessionId,
    pendingSidebarRuntimeCommand,
    postDirectRuntimeCommand,
    sidebarCommandVersion,
    usesDirectRuntimeBridge,
  ])

  const handleReload = () => {
    setReloadNonce((value) => value + 1)
    startLoadingAttempt()
  }

  const handleSwitchApps = () => {
    setApprovedAppsModalOpen(true)
  }

  const handleIframeLoad = () => {
    if (usesDirectRuntimeBridge && embeddedRuntime) {
      setLoadState('loading')
      postDirectRuntimeHandshake(false)
      scheduleRuntimeHandshakeReplay()
      return
    }

    clearLoadTimeout()

    try {
      const frameHref = iframeRef.current?.contentWindow?.location?.href
      const frameDocument = iframeRef.current?.contentDocument
      const bodyText = frameDocument?.body?.textContent?.trim() ?? ''

      if (
        !frameHref ||
        frameHref === 'about:blank' ||
        (!frameDocument?.body?.children.length && bodyText.length === 0)
      ) {
        setLoadState('blocked')
        return
      }
    } catch {
      // Cross-origin vendor frames are expected. If we cannot inspect the frame, assume it loaded.
    }

    setLoadState('ready')
  }

  const handleIframeError = () => {
    clearLoadTimeout()
    setLoadState('blocked')
  }

  return (
    <Stack gap="md" className="h-full min-h-0 p-3 sm:p-4">
      <AppPanelHeader app={app} onClose={closeApprovedApp} />

      <Group gap="xs" wrap="wrap">
        <Button
          variant="light"
          color="chatbox-brand"
          leftSection={<IconLayoutGrid size={16} />}
          onClick={handleSwitchApps}
        >
          {t('Switch apps')}
        </Button>
        <ActionIcon variant="subtle" color="chatbox-secondary" onClick={handleReload} aria-label={t('Reload app')}>
          <IconReload size={17} />
        </ActionIcon>
      </Group>

      {usesEmbeddedRuntime && embeddedRuntime ? (
        <Box className="min-h-0 flex-1 overflow-hidden">
          <EmbeddedAppHost
            key={iframeInstanceKey}
            appId={app.runtimeBridge?.appId ?? app.id}
            appName={app.name}
            appSlug={app.id}
            src={resolvedLaunchUrl}
            state={undefined}
            title={`${app.name} live session`}
            subtitle="TutorMeAI sidebar runtime"
            description={`${app.name} is running inside the governed TutorMeAI sidebar runtime.`}
            loadingLabel={t('Connecting {{name}} runtime', { name: app.name })}
            errorMessage={undefined}
            className="h-full min-h-0"
            height="100%"
            sandbox={iframeSandbox}
            runtime={embeddedRuntime}
            onRetry={handleReload}
            onContinueInChat={closeApprovedApp}
          />
        </Box>
      ) : (
        <Box className="relative min-h-0 flex-1 overflow-hidden rounded-[1.5rem] border border-chatbox-border-primary/70 bg-[#0f172a]">
          <iframe
            key={iframeInstanceKey}
            ref={iframeRef}
            src={resolvedLaunchUrl}
            title={`${app.name} app panel`}
            className={cn(
              'h-full w-full border-0 bg-white transition-opacity duration-200',
              loadState === 'blocked' ? 'opacity-0' : 'opacity-100'
            )}
            sandbox={iframeSandbox}
            allow="clipboard-read; clipboard-write; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />

          {loadState === 'loading' ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/65 backdrop-blur-sm">
              <Loader color="var(--chatbox-tint-brand)" />
              <Text size="sm" c="white">
                {t('Loading {{name}}...', { name: app.name })}
              </Text>
              <Text size="xs" c="rgba(255,255,255,0.68)">
                {t('This can take a moment while the tool initializes in the panel.')}
              </Text>
            </div>
          ) : null}

          {loadState === 'blocked' ? (
            <AppLoadingFallback
              app={app}
              onRetry={handleReload}
              onSwitchApps={handleSwitchApps}
              showRetryButton={app.embedStatus !== 'needs-district-url'}
            />
          ) : null}
        </Box>
      )}
    </Stack>
  )
}

type AppIframePanelProps = {
  className?: string
}

export default function AppIframePanel({ className }: AppIframePanelProps) {
  const { t } = useTranslation()
  const isCompactScreen = useScreenDownToMD()
  const activeApprovedAppId = useUIStore((state) => state.activeApprovedAppId)
  const closeApprovedApp = useUIStore((state) => state.closeApprovedApp)

  if (!activeApprovedAppId) {
    return null
  }

  const activeApp = getApprovedAppById(activeApprovedAppId)
  const panelContent = activeApp ? <AppIframeSurface app={activeApp} /> : null

  if (isCompactScreen) {
    return (
      <Drawer
        opened={Boolean(activeApprovedAppId)}
        onClose={() => closeApprovedApp()}
        position="right"
        size="min(90vw, 32rem)"
        title={t('Apps')}
        padding={0}
        styles={{
          content: {
            background: 'var(--chatbox-background-secondary)',
          },
          body: {
            height: 'calc(100% - 60px)',
            padding: 0,
          },
        }}
      >
        {panelContent}
      </Drawer>
    )
  }

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-chatbox-border-primary/70 bg-chatbox-background-secondary shadow-[0_18px_40px_rgba(15,23,42,0.22)]',
        className
      )}
    >
      {panelContent}
    </aside>
  )
}
