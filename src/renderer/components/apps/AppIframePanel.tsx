import { ActionIcon, Box, Button, Drawer, Flex, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { IconLayoutGrid, IconReload, IconX } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import EmbeddedAppHost from '@/components/message-parts/EmbeddedAppHost'
import { getApprovedAppById } from '@/data/approvedApps'
import { useScreenDownToMD } from '@/hooks/useScreenChange'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { appIntegrationModeMeta, type ApprovedApp } from '@/types/apps'
import AppIcon from './AppIcon'
import { buildSidebarEmbeddedAppRuntime, resolveAppPanelLaunchUrl } from './app-panel-runtime'

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

type AppLoadState = 'loading' | 'ready' | 'blocked'

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
            {app.experience === 'tutormeai-runtime' ? t('TutorMeAI runtime') : appIntegrationModeMeta[app.integrationMode].label}
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

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const loadTimeoutRef = useRef<number | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [loadState, setLoadState] = useState<AppLoadState>('loading')

  const iframeInstanceKey = `${app.id}:${reloadNonce}`
  const resolvedLaunchUrl = useMemo(() => resolveAppPanelLaunchUrl(app.launchUrl), [app.launchUrl])
  const embeddedRuntime = useMemo(
    () => buildSidebarEmbeddedAppRuntime(app, resolvedLaunchUrl, reloadNonce),
    [app, reloadNonce, resolvedLaunchUrl]
  )
  const usesEmbeddedRuntime = app.experience === 'tutormeai-runtime' && Boolean(embeddedRuntime)

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current !== null) {
      window.clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
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
    }
  }, [startLoadingAttempt, clearLoadTimeout])

  const handleReload = () => {
    setReloadNonce((value) => value + 1)
    startLoadingAttempt()
  }

  const handleSwitchApps = () => {
    setApprovedAppsModalOpen(true)
  }

  const handleIframeLoad = () => {
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
            title={`${app.name} live session`}
            subtitle="TutorMeAI sidebar runtime"
            description={`${app.name} is running inside the governed TutorMeAI sidebar runtime.`}
            loadingLabel={t('Connecting {{name}} runtime', { name: app.name })}
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
