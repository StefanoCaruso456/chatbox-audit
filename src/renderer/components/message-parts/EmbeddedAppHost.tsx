import { ActionIcon, Badge, Box, Button, Group, Loader, Paper, Stack, Text } from '@mantine/core'
import {
  IconAlertTriangle,
  IconExternalLink,
  IconPlayerPlayFilled,
  IconRefresh,
  IconShieldLock,
} from '@tabler/icons-react'
import { type FC, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { ScalableIcon } from '../common/ScalableIcon'
import {
  type EmbeddedAppHostProps,
  type EmbeddedAppHostState,
  getEmbeddedAppStatusCopy,
  normalizeEmbeddedAppSrc,
} from './embedded-app-host'

function getStateTone(state: EmbeddedAppHostState) {
  if (state === 'error') {
    return {
      accent: 'var(--chatbox-tint-error)',
      background: 'linear-gradient(135deg, rgba(255, 245, 245, 0.96) 0%, rgba(255, 255, 255, 0.98) 100%)',
    }
  }

  if (state === 'ready') {
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

function buildSandboxAttribute(sandbox?: string): string {
  return sandbox?.trim() || 'allow-scripts allow-forms allow-popups allow-downloads'
}

export const EmbeddedAppHost: FC<EmbeddedAppHostProps> = (props) => {
  const normalizedSrc = useMemo(() => normalizeEmbeddedAppSrc(props.src), [props.src])
  const effectiveState: EmbeddedAppHostState = props.state ?? (normalizedSrc ? 'loading' : 'idle')
  const statusCopy = getEmbeddedAppStatusCopy(normalizedSrc ? effectiveState : 'error')
  const tone = getStateTone(normalizedSrc ? effectiveState : 'error')
  const [hasLoaded, setHasLoaded] = useState(false)
  const hasError = !normalizedSrc || effectiveState === 'error'

  const iframeTitle = props.iframeTitle || `${props.appName} embedded app`
  const displayTitle = props.title || props.appName
  const displaySubtitle = props.subtitle || props.appSlug || props.appId
  const displayDescription = props.description || statusCopy.description

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
                  color={hasError ? 'red' : effectiveState === 'ready' ? 'teal' : 'blue'}
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
              {props.onRetry && (
                <ActionIcon variant="subtle" radius="md" aria-label="Retry embedded app" onClick={props.onRetry}>
                  <ScalableIcon icon={IconRefresh} />
                </ActionIcon>
              )}
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
              data-testid="embedded-app-host-iframe"
              title={iframeTitle}
              src={normalizedSrc}
              sandbox={buildSandboxAttribute(props.sandbox)}
              allow={props.allow}
              className={cn('absolute inset-0 h-full w-full border-0 transition-opacity duration-300', {
                'opacity-100': hasLoaded || effectiveState === 'ready',
                'opacity-0': !hasLoaded && effectiveState !== 'ready',
              })}
              onLoad={() => {
                setHasLoaded(true)
                props.onLoad?.()
              }}
              onError={() => {
                props.onError?.()
              }}
            />
          )}

          {(!hasLoaded || effectiveState !== 'ready' || hasError) && (
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
                    {hasError
                      ? props.errorMessage ||
                        'The embedded app could not be loaded. Retry the launch or continue the conversation in chat.'
                      : props.loadingLabel || statusCopy.description}
                  </Text>
                </Stack>
                {hasError ? (
                  <Group gap="xs" justify="center">
                    {props.onRetry && (
                      <Button radius="md" onClick={props.onRetry}>
                        Retry app
                      </Button>
                    )}
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
          )}
        </Box>
      </Stack>
    </Paper>
  )
}

export default EmbeddedAppHost
