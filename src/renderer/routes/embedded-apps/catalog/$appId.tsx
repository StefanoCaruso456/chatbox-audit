import { Anchor, Badge, Box, Button, Container, Flex, Group, Loader, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import AppCategoryBadge from '@/components/apps/AppCategoryBadge'
import AppGradeBadge from '@/components/apps/AppGradeBadge'
import AppIcon from '@/components/apps/AppIcon'
import { getApprovedAppById } from '@/data/approvedApps'
import { appIntegrationModeMeta, type ApprovedApp } from '@/types/apps'

const APP_LAUNCH_OVERRIDES_STORAGE_KEY = 'approved-app-launch-overrides:v1'
const PREVIEW_TIMEOUT_MS = 6000

export const Route = createFileRoute('/embedded-apps/catalog/$appId')({
  component: ApprovedAppPlaceholderRoute,
})

function readLaunchOverrides() {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(APP_LAUNCH_OVERRIDES_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function persistLaunchOverride(appId: string, value: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  const next = { ...readLaunchOverrides() }
  if (value) {
    next[appId] = value
  } else {
    delete next[appId]
  }
  window.localStorage.setItem(APP_LAUNCH_OVERRIDES_STORAGE_KEY, JSON.stringify(next))
}

function sanitizeAbsoluteUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return ''
    }
    return parsed.toString()
  } catch {
    return ''
  }
}

function getModeCopy(app: ApprovedApp) {
  switch (app.integrationMode) {
    case 'partner-embed':
      return {
        title: 'Partner embed surface',
        body: 'This app is expected to run through an official widget, public embed, or vendor-approved iframe inside ChatBridge.',
      }
    case 'api-adapter':
      return {
        title: 'API adapter workspace',
        body: 'This app should be rendered by a ChatBridge-owned UI backed by vendor APIs, OAuth, and structured tools rather than by the vendor homepage.',
      }
    case 'district-adapter':
      return {
        title: 'District launch workspace',
        body: 'This app usually depends on a school-specific launch URL, district SSO, or LMS setup before it can render inside ChatBridge.',
      }
    case 'browser-session':
      return {
        title: 'Browser session workspace',
        body: 'This vendor often blocks normal iframe embedding. The long-term path is a governed browser-session transport that stays inside ChatBridge.',
      }
    case 'native-replacement':
      return {
        title: 'Native replacement workspace',
        body: 'This learning workflow is better represented by a focused ChatBridge experience than by embedding the vendor product directly.',
      }
    default:
      return {
        title: 'Catalog workspace',
        body: 'This app opens through the approved app catalog surface.',
      }
  }
}

function getDefaultLaunchUrl(app: ApprovedApp) {
  return sanitizeAbsoluteUrl(app.integrationConfig?.defaultLaunchUrl ?? '')
}

function getLaunchInputLabel(app: ApprovedApp) {
  if (app.integrationConfig?.launchUrlLabel) {
    return app.integrationConfig.launchUrlLabel
  }

  switch (app.integrationMode) {
    case 'district-adapter':
      return `${app.name} district launch URL`
    case 'partner-embed':
      return `${app.name} embed URL`
    case 'browser-session':
      return `${app.name} start URL`
    default:
      return `${app.name} launch URL`
  }
}

function getLaunchInputPlaceholder(app: ApprovedApp) {
  if (app.integrationConfig?.launchUrlPlaceholder) {
    return app.integrationConfig.launchUrlPlaceholder
  }

  if (app.vendorUrl) {
    return app.vendorUrl
  }

  return 'https://example.com/launch'
}

function getResolvedPreviewUrl(app: ApprovedApp, savedUrl: string) {
  const sanitizedSavedUrl = sanitizeAbsoluteUrl(savedUrl)
  if (sanitizedSavedUrl) {
    return sanitizedSavedUrl
  }
  return getDefaultLaunchUrl(app)
}

function supportsLaunchConfig(app: ApprovedApp) {
  return (
    app.integrationMode === 'district-adapter' ||
    app.integrationMode === 'partner-embed' ||
    app.integrationMode === 'browser-session' ||
    Boolean(app.integrationConfig?.configurableLaunchUrl)
  )
}

function canPreviewUrl(app: ApprovedApp) {
  return (
    app.integrationMode === 'district-adapter' ||
    app.integrationMode === 'partner-embed' ||
    app.integrationMode === 'browser-session'
  )
}

function EmbeddedPreviewFrame({
  appName,
  url,
  blockedCopy,
}: {
  appName: string
  url: string
  blockedCopy: string
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'blocked'>('loading')

  useEffect(() => {
    setStatus('loading')
    const timeout = window.setTimeout(() => {
      setStatus((current) => (current === 'loading' ? 'blocked' : current))
    }, PREVIEW_TIMEOUT_MS)

    return () => window.clearTimeout(timeout)
  }, [url])

  return (
    <Box className="relative min-h-[30rem] overflow-hidden rounded-[1.5rem] border border-white/12 bg-[#0f172a]">
      <iframe
        src={url}
        title={`${appName} integration preview`}
        className={`h-[30rem] w-full border-0 bg-white transition-opacity duration-200 ${status === 'blocked' ? 'opacity-0' : 'opacity-100'}`}
        sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        allow="clipboard-read; clipboard-write; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('blocked')}
      />

      {status === 'loading' ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/72 backdrop-blur-sm">
          <Loader color="var(--chatbox-tint-brand)" />
          <Text size="sm" c="white">
            Loading {appName} preview...
          </Text>
        </div>
      ) : null}

      {status === 'blocked' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/82 p-6">
          <Stack gap="sm" maw={420}>
            <Title order={4} c="white">
              Preview blocked
            </Title>
            <Text size="sm" c="rgba(255,255,255,0.74)">
              {blockedCopy}
            </Text>
          </Stack>
        </div>
      ) : null}
    </Box>
  )
}

function ApprovedAppPlaceholderRoute() {
  const { appId } = Route.useParams()
  const app = getApprovedAppById(appId)
  const [savedUrl, setSavedUrl] = useState('')
  const [draftUrl, setDraftUrl] = useState('')

  useEffect(() => {
    if (!app) {
      return
    }
    const savedValue = readLaunchOverrides()[app.id] ?? ''
    setSavedUrl(savedValue)
    setDraftUrl(savedValue || getDefaultLaunchUrl(app))
  }, [appId, app])

  if (!app) {
    return (
      <Box h="100%" bg="#0f172a" c="white">
        <Container size="sm" py="xl">
          <Stack gap="sm">
            <Title order={2}>App not found</Title>
            <Text c="rgba(255,255,255,0.76)">The requested approved app workspace could not be loaded.</Text>
          </Stack>
        </Container>
      </Box>
    )
  }

  const modeMeta = appIntegrationModeMeta[app.integrationMode]
  const modeCopy = getModeCopy(app)
  const resolvedPreviewUrl = useMemo(() => getResolvedPreviewUrl(app, savedUrl), [app, savedUrl])
  const launchConfigEnabled = supportsLaunchConfig(app)
  const showPreview = canPreviewUrl(app) && Boolean(resolvedPreviewUrl)

  const handleSaveLaunchUrl = () => {
    const sanitized = sanitizeAbsoluteUrl(draftUrl)
    persistLaunchOverride(app.id, sanitized || null)
    setSavedUrl(sanitized)
    setDraftUrl(sanitized)
  }

  const handleClearLaunchUrl = () => {
    persistLaunchOverride(app.id, null)
    setSavedUrl('')
    setDraftUrl(getDefaultLaunchUrl(app))
  }

  return (
    <Box
      h="100%"
      style={{
        background:
          'radial-gradient(circle at top, rgba(59,130,246,0.25), transparent 38%), linear-gradient(180deg, #0f172a 0%, #111827 100%)',
      }}
    >
      <Container size="sm" py="xl">
        <Stack gap="lg">
          <Group gap="xs">
            <Badge radius="xl" size="lg" variant="light" color="green">
              {modeMeta.label}
            </Badge>
            <Badge radius="xl" size="lg" variant="light" color="blue">
              Approved app workspace
            </Badge>
          </Group>

          <Flex align="center" gap="md">
            <AppIcon app={app} w={64} h={64} radius="xl" />
            <Stack gap={4}>
              <Title order={1} c="white">
                {app.name}
              </Title>
              <Text c="rgba(255,255,255,0.72)" maw={560}>
                {app.shortSummary}
              </Text>
            </Stack>
          </Flex>

          <Flex wrap="wrap" gap="xs">
            <AppCategoryBadge category={app.category} />
            {app.gradeRanges.map((gradeRange) => (
              <AppGradeBadge key={`${app.id}:${gradeRange}`} gradeRange={gradeRange} />
            ))}
            {app.tags.map((tag) => (
              <Badge key={`${app.id}:${tag}`} variant="outline" radius="xl" color="gray">
                {tag}
              </Badge>
            ))}
          </Flex>

          <Paper radius="xl" p="xl" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <Stack gap="sm">
              <Title order={3} c="white">
                {modeCopy.title}
              </Title>
              <Text c="rgba(255,255,255,0.76)">{modeCopy.body}</Text>
              <Text c="rgba(255,255,255,0.66)">
                This route is the governed in-product launch surface for {app.name}. It keeps the catalog inside the
                ChatBridge experience while each app moves toward the right integration pattern.
              </Text>
              {app.vendorUrl ? (
                <Text c="rgba(255,255,255,0.72)">
                  Vendor destination:{' '}
                  <Anchor href={app.vendorUrl} target="_blank" rel="noreferrer" c="white" underline="always">
                    {app.vendorUrl}
                  </Anchor>
                </Text>
              ) : null}
              {app.integrationConfig?.helpUrl ? (
                <Text c="rgba(255,255,255,0.72)">
                  Reference:{' '}
                  <Anchor href={app.integrationConfig.helpUrl} target="_blank" rel="noreferrer" c="white" underline="always">
                    {app.integrationConfig.helpLabel ?? app.integrationConfig.helpUrl}
                  </Anchor>
                </Text>
              ) : null}
            </Stack>
          </Paper>

          {launchConfigEnabled ? (
            <Paper radius="xl" p="xl" style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <Stack gap="md">
                <Title order={3} c="white">
                  Launch configuration
                </Title>
                <Text c="rgba(255,255,255,0.72)">
                  Save an app-specific launch URL here to keep testing this integration inside ChatBridge without editing the catalog data each time.
                </Text>
                <TextInput
                  label={getLaunchInputLabel(app)}
                  placeholder={getLaunchInputPlaceholder(app)}
                  value={draftUrl}
                  onChange={(event) => setDraftUrl(event.currentTarget.value)}
                />
                <Group>
                  <Button onClick={handleSaveLaunchUrl}>Save launch URL</Button>
                  <Button variant="subtle" color="gray" onClick={handleClearLaunchUrl}>
                    Reset
                  </Button>
                </Group>
                <Text size="sm" c="rgba(255,255,255,0.68)">
                  Saved value: <code>{savedUrl || getDefaultLaunchUrl(app) || 'not configured yet'}</code>
                </Text>
              </Stack>
            </Paper>
          ) : null}

          {showPreview ? (
            <EmbeddedPreviewFrame
              appName={app.name}
              url={resolvedPreviewUrl}
              blockedCopy={
                app.integrationMode === 'browser-session'
                  ? 'This vendor is still blocking a normal iframe preview. The next implementation step is a governed browser-session transport.'
                  : 'This destination is not rendering yet. If the URL is correct, the vendor may still be blocking embed access or expecting district-specific auth.'
              }
            />
          ) : null}

          {app.integrationMode === 'api-adapter' ? (
            <Paper radius="xl" p="xl" style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <Stack gap="sm">
                <Title order={3} c="white">
                  Adapter implementation path
                </Title>
                <Text c="rgba(255,255,255,0.72)">
                  {app.name} should be implemented as a ChatBridge-owned UI that handles auth, structured tool calls,
                  and API-backed state instead of embedding the vendor homepage.
                </Text>
                <Text c="rgba(255,255,255,0.68)">
                  Use this app card as the governed shell while the adapter backend and OAuth flow are being built.
                </Text>
              </Stack>
            </Paper>
          ) : null}

          {app.integrationMode === 'native-replacement' ? (
            <Paper radius="xl" p="xl" style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <Stack gap="sm">
                <Title order={3} c="white">
                  Native replacement path
                </Title>
                <Text c="rgba(255,255,255,0.72)">
                  {app.name} is better represented by a focused ChatBridge-built learning experience than by embedding
                  the vendor product itself.
                </Text>
                <Text c="rgba(255,255,255,0.68)">
                  This route keeps the app discoverable now while the native experience is built out.
                </Text>
              </Stack>
            </Paper>
          ) : null}
        </Stack>
      </Container>
    </Box>
  )
}
