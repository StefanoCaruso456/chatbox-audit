import { ActionIcon, Badge, Box, Button, Divider, Drawer, Flex, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { IconExternalLink, IconLayoutGrid, IconReload, IconX } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getApprovedAppById } from '@/data/approvedApps'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { type ApprovedApp, formatAppTagLabel } from '@/types/apps'
import AppCategoryBadge from './AppCategoryBadge'
import AppGradeBadge from './AppGradeBadge'
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

function AppPanelHeader({ app, onClose }: { app: ApprovedApp; onClose: () => void }) {
  const { t } = useTranslation()

  return (
    <Flex justify="space-between" align="start" gap="sm">
      <Flex align="center" gap="sm" className="min-w-0">
        <AppIcon app={app} w={42} h={42} radius="lg" />
        <Stack gap={2} className="min-w-0">
          <Group gap={8}>
            <Title order={4} fz="lg" className="truncate">
              {app.name}
            </Title>
            <Badge radius="xl" variant="light" color="chatbox-success">
              {t('Approved Apps')}
            </Badge>
          </Group>
          <Text size="sm" c="chatbox-secondary" className="line-clamp-2">
            {app.shortSummary}
          </Text>
        </Stack>
      </Flex>

      <ActionIcon variant="subtle" color="chatbox-secondary" onClick={onClose} aria-label={t('Close app')}>
        <IconX size={18} />
      </ActionIcon>
    </Flex>
  )
}

function AppPanelBadges({ app }: { app: ApprovedApp }) {
  return (
    <Flex wrap="wrap" gap="xs">
      <AppCategoryBadge category={app.category} />
      {app.gradeRanges.map((gradeRange) => (
        <AppGradeBadge key={`${app.id}:${gradeRange}`} gradeRange={gradeRange} />
      ))}
      {app.tags.slice(0, 2).map((tag) => (
        <Badge key={`${app.id}:${tag}`} radius="xl" variant="outline" color="chatbox-secondary">
          {formatAppTagLabel(tag)}
        </Badge>
      ))}
    </Flex>
  )
}

function AppTrustNotice() {
  const { t } = useTranslation()

  return (
    <div className="rounded-2xl border border-chatbox-border-primary/70 bg-chatbox-background-primary/85 px-4 py-3">
      <Stack gap={4}>
        <Text size="sm" fw={600}>
          {t('Curated for K-12 classrooms')}
        </Text>
        <Text size="sm" c="chatbox-secondary">
          {t('This approved tool opens beside chat when the vendor supports secure classroom embedding.')}
        </Text>
      </Stack>
    </div>
  )
}

function AppIframeSurface({ app }: { app: ApprovedApp }) {
  const { t } = useTranslation()
  const closeApprovedApp = useUIStore((state) => state.closeApprovedApp)
  const setApprovedAppsModalOpen = useUIStore((state) => state.setApprovedAppsModalOpen)

  const [reloadNonce, setReloadNonce] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [showLoadNotice, setShowLoadNotice] = useState(false)
  const resolvedLaunchUrl = useMemo(() => (app ? resolveLaunchUrl(app.launchUrl) : ''), [app])

  useEffect(() => {
    if (!app) {
      return
    }

    setIsLoading(true)
    setShowLoadNotice(false)
    const timeoutId = window.setTimeout(() => {
      setShowLoadNotice(true)
    }, 7000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [app])

  const handleReload = () => {
    setIsLoading(true)
    setShowLoadNotice(false)
    setReloadNonce((value) => value + 1)
  }

  return (
    <Stack gap="md" className="h-full min-h-0 p-3 sm:p-4">
      <AppPanelHeader app={app} onClose={closeApprovedApp} />
      <AppPanelBadges app={app} />
      <AppTrustNotice />

      <Group gap="xs">
        <Button
          variant="light"
          color="chatbox-brand"
          leftSection={<IconLayoutGrid size={16} />}
          onClick={() => setApprovedAppsModalOpen(true)}
        >
          {t('Switch apps')}
        </Button>
        <Button
          variant="subtle"
          color="chatbox-secondary"
          leftSection={<IconExternalLink size={16} />}
          onClick={() => window.open(resolvedLaunchUrl, '_blank', 'noopener,noreferrer')}
        >
          {t('Open in new tab')}
        </Button>
        <ActionIcon variant="subtle" color="chatbox-secondary" onClick={handleReload} aria-label={t('Reload app')}>
          <IconReload size={17} />
        </ActionIcon>
      </Group>

      <Divider />

      <Box className="relative min-h-0 flex-1 overflow-hidden rounded-[1.5rem] border border-chatbox-border-primary/70 bg-[#0f172a]">
        <iframe
          key={`${app.id}:${reloadNonce}`}
          src={resolvedLaunchUrl}
          title={`${app.name} app panel`}
          className="h-full w-full border-0 bg-white"
          sandbox={iframeSandbox}
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => {
            setIsLoading(false)
            setShowLoadNotice(false)
          }}
        />

        {isLoading ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/65 backdrop-blur-sm">
            <Loader color="var(--chatbox-tint-brand)" />
            <Text size="sm" c="white">
              {t('Loading {{name}}...', { name: app.name })}
            </Text>
          </div>
        ) : null}

        {showLoadNotice ? (
          <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/12 bg-slate-950/88 p-3 shadow-xl">
            <Stack gap={6}>
              <Text size="sm" fw={600} c="white">
                {t('Still loading?')}
              </Text>
              <Text size="xs" c="rgba(255,255,255,0.72)">
                {t(
                  'Some approved tools need vendor iframe access enabled. You can keep waiting or open this app in a new tab while the district embed URL is finalized.'
                )}
              </Text>
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
  const isSmallScreen = useIsSmallScreen()
  const activeApprovedAppId = useUIStore((state) => state.activeApprovedAppId)
  const closeApprovedApp = useUIStore((state) => state.closeApprovedApp)

  if (!activeApprovedAppId) {
    return null
  }

  const activeApp = getApprovedAppById(activeApprovedAppId)
  const panelContent = activeApp ? <AppIframeSurface app={activeApp} /> : null

  if (isSmallScreen) {
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
        'hidden h-full min-h-0 w-[22rem] min-w-[22rem] max-w-[24rem] flex-col overflow-hidden rounded-[1.75rem] border border-chatbox-border-primary/70 bg-chatbox-background-secondary shadow-[0_18px_40px_rgba(15,23,42,0.22)] xl:flex',
        className
      )}
    >
      {panelContent}
    </aside>
  )
}
