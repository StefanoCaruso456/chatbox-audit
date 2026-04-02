import { ActionIcon, Box, Button, Drawer, Flex, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { IconExternalLink, IconLayoutGrid, IconReload, IconX } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getApprovedAppById } from '@/data/approvedApps'
import { useScreenDownToMD } from '@/hooks/useScreenChange'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import type { ApprovedApp } from '@/types/apps'
import AppIcon from './AppIcon'

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

function resolveLaunchUrl(launchUrl: string) {
  const trimmed = launchUrl.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (!trimmed.startsWith('/')) {
    return trimmed
  }

  if (typeof window === 'undefined') {
    return trimmed
  }

  if (window.location.protocol === 'file:') {
    return `${window.location.href.split('#')[0]}#${trimmed}`
  }

  return new URL(trimmed, window.location.origin).toString()
}

function getFallbackCopy(app: ApprovedApp, t: ReturnType<typeof useTranslation>['t']) {
  if (app.embedStatus === 'needs-district-url') {
    return {
      title: t('This app needs a school-specific launch link'),
      description: t(
        'Canvas and similar district-managed tools often need a verified school launch URL before they can open beside chat. You can open it in a new tab for now or switch to a different app.'
      ),
    }
  }

  if (app.experience === 'tutormeai-runtime') {
    return {
      title: t('Need to open {{name}} outside the panel?', { name: app.name }),
      description: t(
        'This TutorMeAI runtime is still booting. You can reload the panel, switch tools, or open it in a new tab while the embedded session finishes loading.'
      ),
    }
  }

  return {
    title: t('Need to open {{name}} outside the panel?', { name: app.name }),
    description: t(
      'Some approved tools block iframe embedding or take longer to initialize. You can reload the panel, switch tools, or open this app in a new tab right now.'
    ),
  }
}

function AppPanelHeader({ app, onClose }: { app: ApprovedApp; onClose: () => void }) {
  const { t } = useTranslation()

  return (
    <Flex justify="space-between" align="center" gap="sm">
      <Flex align="center" gap="sm" className="min-w-0">
        <AppIcon app={app} w={34} h={34} radius="lg" />
        <Title order={4} fz="md" className="truncate">
          {app.name}
        </Title>
      </Flex>

      <ActionIcon variant="subtle" color="chatbox-secondary" onClick={onClose} aria-label={t('Close app')}>
        <IconX size={18} />
      </ActionIcon>
    </Flex>
  )
}

function AppIframeSurface({ app }: { app: ApprovedApp }) {
  const { t } = useTranslation()
  const closeApprovedApp = useUIStore((state) => state.closeApprovedApp)
  const setApprovedAppsModalOpen = useUIStore((state) => state.setApprovedAppsModalOpen)

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const loadTimeoutRef = useRef<number | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [loadState, setLoadState] = useState<AppLoadState>(
    app.embedStatus === 'needs-district-url' ? 'blocked' : 'loading'
  )

  const iframeInstanceKey = `${app.id}:${reloadNonce}`
  const resolvedLaunchUrl = useMemo(() => resolveLaunchUrl(app.launchUrl), [app])
  const resolvedVendorUrl = useMemo(() => resolveLaunchUrl(app.vendorUrl ?? app.launchUrl), [app])
  const fallbackCopy = useMemo(() => getFallbackCopy(app, t), [app, t])

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current !== null) {
      window.clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
  }, [])

  const startLoadingAttempt = useCallback(() => {
    clearLoadTimeout()

    if (app.embedStatus === 'needs-district-url') {
      setLoadState('blocked')
      return
    }

    setLoadState('loading')
    loadTimeoutRef.current = window.setTimeout(() => {
      setLoadState((currentState) => (currentState === 'loading' ? 'blocked' : currentState))
      loadTimeoutRef.current = null
    }, APP_LOAD_TIMEOUT_MS)
  }, [app, clearLoadTimeout])

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

  const handleOpenInNewTab = () => {
    window.open(resolvedVendorUrl, '_blank', 'noopener,noreferrer')
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
    <Stack gap="xs" className="h-full min-h-0 p-2.5 sm:p-3">
      <AppPanelHeader app={app} onClose={closeApprovedApp} />

      <Group gap={6} wrap="wrap">
        <Button
          size="xs"
          variant="light"
          color="chatbox-brand"
          leftSection={<IconLayoutGrid size={16} />}
          onClick={handleSwitchApps}
        >
          {t('Switch apps')}
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="chatbox-secondary"
          leftSection={<IconExternalLink size={16} />}
          onClick={handleOpenInNewTab}
        >
          {t('Open in new tab')}
        </Button>
        <ActionIcon
          size="md"
          variant="subtle"
          color="chatbox-secondary"
          onClick={handleReload}
          aria-label={t('Reload app')}
        >
          <IconReload size={17} />
        </ActionIcon>
      </Group>

      <Box className="relative min-h-0 flex-1 overflow-hidden rounded-[1.25rem] border border-chatbox-border-primary/70 bg-[#0f172a]">
        {app.embedStatus !== 'needs-district-url' ? (
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
        ) : null}

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
          <div
            data-testid="app-iframe-panel-fallback"
            className="absolute inset-0 flex items-end justify-center bg-slate-950/52 p-3 backdrop-blur-[2px] sm:items-center sm:p-4"
          >
            <Stack
              gap="sm"
              className="w-full max-w-sm rounded-[1.25rem] border border-white/12 bg-slate-950/92 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.4)]"
            >
              <Text size="sm" fw={700} c="white">
                {fallbackCopy.title}
              </Text>
              <Text size="xs" c="rgba(255,255,255,0.74)">
                {fallbackCopy.description}
              </Text>
              <Group gap={6} wrap="wrap">
                <Button
                  size="xs"
                  variant="light"
                  color="chatbox-brand"
                  leftSection={<IconExternalLink size={14} />}
                  onClick={handleOpenInNewTab}
                >
                  {t('Open in new tab')}
                </Button>
                {app.embedStatus !== 'needs-district-url' ? (
                  <Button
                    size="xs"
                    variant="default"
                    color="gray"
                    leftSection={<IconReload size={14} />}
                    onClick={handleReload}
                  >
                    {t('Reload panel')}
                  </Button>
                ) : null}
                <Button
                  size="xs"
                  variant="subtle"
                  color="chatbox-secondary"
                  leftSection={<IconLayoutGrid size={14} />}
                  onClick={handleSwitchApps}
                >
                  {t('Switch apps')}
                </Button>
              </Group>
            </Stack>
          </div>
        ) : null}
      </Box>
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
        'flex h-full min-h-0 w-[20rem] min-w-[20rem] max-w-[22rem] flex-col overflow-hidden rounded-[1.75rem] border border-chatbox-border-primary/70 bg-chatbox-background-secondary shadow-[0_18px_40px_rgba(15,23,42,0.22)] lg:w-[22rem] lg:min-w-[22rem] lg:max-w-[24rem] xl:w-[24rem] xl:min-w-[24rem] xl:max-w-[26rem] 2xl:w-[26rem] 2xl:min-w-[26rem] 2xl:max-w-[28rem]',
        className
      )}
    >
      {panelContent}
    </aside>
  )
}
