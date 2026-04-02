import { Alert, Badge, Code, Divider, Group, Paper, ScrollArea, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { IconAlertTriangle, IconShieldSearch } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EmbeddedAppHost from '@/components/message-parts/EmbeddedAppHost'
import type { ReviewHarnessConfig } from '../review-harness'
import {
  appendCompletionEvent,
  appendHeartbeatTimeoutEvent,
  appendIframeLoadEvent,
  appendRawMessageEvent,
  appendReviewerFindingEvent,
  appendReviewerNoteEvent,
  appendRuntimeErrorEvent,
  appendRuntimeStateEvent,
  type ReviewHarnessEvent,
  type ReviewHarnessLog,
  type ReviewHarnessReviewSeverity,
  summarizeReviewHarnessLog,
} from '../review-harness-log'
import { inspectReviewMessage, type ReviewMessageInspectionResult } from '../review-message-inspector'

type LoggedRawMessagePayload = {
  inspection: ReviewMessageInspectionResult
  payload: unknown
}

function getReviewSessionId(config: ReviewHarnessConfig) {
  return `review-harness.${config.appId}.${config.appSessionId}`
}

function isLoggedRawMessagePayload(value: unknown): value is LoggedRawMessagePayload {
  if (!value || typeof value !== 'object') {
    return false
  }

  return 'inspection' in value && 'payload' in value
}

function buildFindingTitle(reason: ReviewMessageInspectionResult['reason']) {
  switch (reason) {
    case 'origin-mismatch':
      return 'Unexpected iframe origin'
    case 'invalid-shape':
      return 'Malformed runtime message'
    case 'envelope-mismatch':
      return 'Runtime envelope mismatch'
    case 'unexpected-source-type':
      return 'Unexpected runtime message source'
    case 'accepted-traffic':
      return 'Accepted runtime traffic'
  }
}

function buildFindingSeverity(inspection: ReviewMessageInspectionResult): ReviewHarnessReviewSeverity {
  if (inspection.reason === 'origin-mismatch' || inspection.reason === 'envelope-mismatch') {
    return 'high'
  }

  if (inspection.reason === 'invalid-shape' || inspection.reason === 'unexpected-source-type') {
    return 'medium'
  }

  return 'info'
}

function formatEvent(event: ReviewHarnessEvent) {
  switch (event.type) {
    case 'iframe-load':
      return {
        badge: event.status,
        color: event.status === 'failed' ? 'red' : event.status === 'loaded' ? 'teal' : 'blue',
        title:
          event.status === 'loaded'
            ? 'Review iframe loaded'
            : event.status === 'failed'
              ? 'Review iframe failed'
              : 'Review iframe opening',
        message:
          event.status === 'loaded'
            ? `Loaded ${event.iframeUrl} from ${event.origin}${event.loadMs ? ` in ${event.loadMs}ms` : ''}.`
            : event.status === 'failed'
              ? (event.errorMessage ?? `Failed to load ${event.iframeUrl}.`)
              : `Opening ${event.iframeUrl} from ${event.origin}.`,
      }
    case 'runtime-state':
      return {
        badge: 'state',
        color: 'blue',
        title: 'Runtime state update',
        message: event.stateLabel ?? 'Embedded app reported a new runtime state.',
      }
    case 'completion':
      return {
        badge: event.status,
        color: event.status === 'succeeded' ? 'teal' : event.status === 'cancelled' ? 'yellow' : 'red',
        title: 'Runtime completion',
        message: event.resultSummary,
      }
    case 'runtime-error':
      return {
        badge: 'error',
        color: 'red',
        title: event.errorName ?? 'Runtime error',
        message: event.message,
      }
    case 'heartbeat-timeout':
      return {
        badge: 'timeout',
        color: 'orange',
        title: 'Heartbeat timeout',
        message: event.reason ?? `No heartbeat was received for ${Math.round(event.timeoutMs / 1000)} seconds.`,
      }
    case 'raw-message': {
      const inspection = isLoggedRawMessagePayload(event.message) ? event.message.inspection : null

      return {
        badge: inspection?.decision ?? 'raw',
        color: inspection?.decision === 'reject' ? 'red' : inspection?.decision === 'flag' ? 'yellow' : 'gray',
        title: inspection ? buildFindingTitle(inspection.reason) : 'Raw runtime message',
        message: inspection
          ? `${inspection.summary} ${event.messageType ? `Observed ${event.messageType}.` : ''}`.trim()
          : 'Captured raw message traffic from the embedded iframe.',
      }
    }
    case 'reviewer-note':
      return {
        badge: event.severity,
        color: event.severity === 'info' ? 'gray' : 'yellow',
        title: 'Review note',
        message: event.note,
      }
    case 'reviewer-finding':
      return {
        badge: event.severity,
        color: event.severity === 'high' || event.severity === 'critical' ? 'red' : 'yellow',
        title: event.title,
        message: event.summary,
      }
  }
}

export function ReviewHarnessPage({ config }: { config: ReviewHarnessConfig }) {
  const [log, setLog] = useState<ReviewHarnessLog>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const iframeLoadStartedAtRef = useRef<number>(Date.now())
  const sessionId = useMemo(() => getReviewSessionId(config), [config])

  const appendLog = useCallback((updater: (current: ReviewHarnessLog) => ReviewHarnessLog) => {
    setLog((current) => updater(current).slice(-100))
  }, [])

  useEffect(() => {
    iframeLoadStartedAtRef.current = Date.now()
    setLog(() => {
      let next: ReviewHarnessLog = []

      next = appendReviewerNoteEvent(next, {
        sessionId,
        conversationId: config.conversationId,
        appId: config.appId,
        appSessionId: config.appSessionId,
        actor: 'platform',
        note: `Opened review harness for ${config.appName} (${config.appId}) at ${config.entryUrl}.`,
        severity: 'info',
        tags: ['phase-3-review-harness', config.authState],
      })

      next = appendIframeLoadEvent(next, {
        sessionId,
        conversationId: config.conversationId,
        appId: config.appId,
        appSessionId: config.appSessionId,
        actor: 'platform',
        iframeUrl: config.entryUrl,
        origin: config.targetOrigin,
        status: 'loading',
      })

      for (const warning of config.runtimeWarnings) {
        next = appendReviewerFindingEvent(next, {
          sessionId,
          conversationId: config.conversationId,
          appId: config.appId,
          appSessionId: config.appSessionId,
          actor: 'platform',
          title: 'Harness configuration warning',
          summary: warning,
          severity: 'medium',
          recommendation: 'Correct the declared target origin and allowlist before reviewer approval.',
        })
      }

      return next
    })
  }, [
    config.appId,
    config.appName,
    config.appSessionId,
    config.authState,
    config.conversationId,
    config.entryUrl,
    config.runtimeWarnings,
    config.targetOrigin,
    sessionId,
  ])

  const runtimeWarnings = useMemo(() => config.runtimeWarnings, [config.runtimeWarnings])
  const summary = useMemo(() => summarizeReviewHarnessLog(log), [log])
  const timelineEvents = useMemo(() => [...log].reverse(), [log])

  useEffect(() => {
    const iframe = containerRef.current?.querySelector('iframe')
    if (!iframe) {
      return
    }

    const handleMessage = (event: MessageEvent) => {
      const iframeWindow = (iframe as HTMLIFrameElement).contentWindow
      if (!iframeWindow || event.source !== iframeWindow) {
        return
      }

      const inspection = inspectReviewMessage({
        expectedOrigin: config.targetOrigin,
        conversationId: config.conversationId,
        appSessionId: config.appSessionId,
        appId: config.appId,
        origin: event.origin,
        payload: event.data,
      })

      appendLog((current) => {
        let next = appendRawMessageEvent(current, {
          sessionId,
          conversationId: config.conversationId,
          appId: config.appId,
          appSessionId: config.appSessionId,
          direction: 'iframe-to-host',
          message: {
            inspection,
            payload: event.data,
          },
          messageType: inspection.type,
          origin: event.origin,
          correlationId:
            inspection.message?.correlationId ??
            (typeof event.data === 'object' && event.data && 'correlationId' in event.data
              ? String((event.data as { correlationId?: unknown }).correlationId ?? '')
              : undefined),
        })

        if (inspection.decision !== 'accept') {
          next = appendReviewerFindingEvent(next, {
            sessionId,
            conversationId: config.conversationId,
            appId: config.appId,
            appSessionId: config.appSessionId,
            actor: 'platform',
            title: buildFindingTitle(inspection.reason),
            summary: inspection.summary,
            severity: buildFindingSeverity(inspection),
            recommendation:
              inspection.decision === 'reject'
                ? 'Do not approve this app version until the runtime contract and origin behavior are corrected.'
                : 'Review the message source and confirm the app only sends declared runtime traffic.',
            evidence: inspection.details,
          })
        }

        return next
      })
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [appendLog, config.appId, config.appSessionId, config.conversationId, config.targetOrigin, sessionId])

  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap="xs">
              <IconShieldSearch size={18} />
              <Title order={3}>App Review Harness</Title>
            </Group>
            <Text c="dimmed" size="sm">
              Review mode for candidate third-party apps. This page is for evidence collection, not production approval.
            </Text>
          </Stack>
          <Badge variant="light" color="yellow">
            staging only
          </Badge>
        </Group>

        {runtimeWarnings.length > 0 ? (
          <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title="Harness warnings">
            <Stack gap={4}>
              {runtimeWarnings.map((warning) => (
                <Text key={warning} size="sm">
                  {warning}
                </Text>
              ))}
            </Stack>
          </Alert>
        ) : null}

        <Paper withBorder p="md">
          <Stack gap="xs">
            <Title order={5}>Review summary</Title>
            <Text size="sm">
              <strong>Total events:</strong> {summary.totalEvents}
            </Text>
            <Text size="sm">
              <strong>Raw messages:</strong> {summary.eventCounts['raw-message']}
            </Text>
            <Text size="sm">
              <strong>Open findings:</strong> {summary.openFindings.length}
            </Text>
            {summary.latestRuntimeError ? (
              <Text size="sm">
                <strong>Latest error:</strong> {summary.latestRuntimeError.message}
              </Text>
            ) : null}
            {summary.openFindings.length > 0 ? (
              <Stack gap={4} mt="xs">
                {summary.openFindings.map((finding) => (
                  <Alert
                    key={finding.id}
                    color={finding.severity === 'high' || finding.severity === 'critical' ? 'red' : 'yellow'}
                  >
                    <Text size="sm" fw={600}>
                      {finding.title}
                    </Text>
                    <Text size="sm">{finding.summary}</Text>
                  </Alert>
                ))}
              </Stack>
            ) : null}
          </Stack>
        </Paper>

        <Paper withBorder p="md">
          <Stack gap="xs">
            <Title order={5}>Candidate</Title>
            <Text size="sm">
              <strong>App:</strong> {config.appName}
            </Text>
            <Text size="sm">
              <strong>App ID:</strong> <Code>{config.appId}</Code>
            </Text>
            <Text size="sm">
              <strong>Entry URL:</strong> <Code>{config.entryUrl}</Code>
            </Text>
            <Text size="sm">
              <strong>Target origin:</strong> <Code>{config.targetOrigin}</Code>
            </Text>
            <Text size="sm">
              <strong>Allowed origins:</strong> <Code>{config.allowedOrigins.join(', ')}</Code>
            </Text>
            <Text size="sm">
              <strong>Conversation:</strong> <Code>{config.conversationId}</Code>
            </Text>
            <Text size="sm">
              <strong>App session:</strong> <Code>{config.appSessionId}</Code>
            </Text>
            <Text size="sm">
              <strong>Auth state:</strong> <Code>{config.authState}</Code>
            </Text>
            {config.reviewerNotes ? (
              <Text size="sm">
                <strong>Reviewer notes:</strong> {config.reviewerNotes}
              </Text>
            ) : null}
          </Stack>
        </Paper>

        <Paper withBorder p="md">
          <Stack gap="sm">
            <Title order={5}>Review timeline</Title>
            <Divider />
            <ScrollArea.Autosize mah={420}>
              <Stack gap="xs">
                {timelineEvents.map((event) => {
                  const formatted = formatEvent(event)

                  return (
                    <Paper key={event.id} withBorder p="sm">
                      <Group justify="space-between" align="center">
                        <Badge variant="light" color={formatted.color}>
                          {formatted.badge}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {event.timestamp}
                        </Text>
                      </Group>
                      <Text size="sm" fw={600} mt={6}>
                        {formatted.title}
                      </Text>
                      <Text size="sm" mt={4}>
                        {formatted.message}
                      </Text>
                      {event.type === 'raw-message' && isLoggedRawMessagePayload(event.message) ? (
                        <Stack gap={2} mt={6}>
                          {event.message.inspection.details.map((detail) => (
                            <Text key={detail} size="xs" c="dimmed">
                              {detail}
                            </Text>
                          ))}
                        </Stack>
                      ) : null}
                    </Paper>
                  )
                })}
              </Stack>
            </ScrollArea.Autosize>
          </Stack>
        </Paper>
      </Stack>

      <Paper withBorder p="md" ref={containerRef}>
        <EmbeddedAppHost
          appId={config.appId}
          appName={config.appName}
          src={config.entryUrl}
          title={`${config.appName} review session`}
          subtitle="Sandboxed staging harness"
          description="Candidate app is loading in review mode."
          runtime={{
            expectedOrigin: config.targetOrigin,
            conversationId: config.conversationId,
            appSessionId: config.appSessionId,
            handshakeToken: config.handshakeToken,
            bootstrap: {
              launchReason: 'manual-open',
              authState: config.authState,
              grantedPermissions: [],
            },
            onStateUpdate: (message) => {
              appendLog((current) =>
                appendRuntimeStateEvent(current, {
                  sessionId,
                  conversationId: config.conversationId,
                  appId: config.appId,
                  appSessionId: config.appSessionId,
                  state: message.payload.state ?? {},
                  stateLabel: `${message.payload.status}: ${message.payload.summary}`,
                  sequence: message.sequence,
                })
              )
            },
            onCompletion: (signal) => {
              appendLog((current) =>
                appendCompletionEvent(current, {
                  sessionId,
                  conversationId: config.conversationId,
                  appId: config.appId,
                  appSessionId: config.appSessionId,
                  status: signal.status,
                  resultSummary: signal.resultSummary,
                  result: signal.followUpContext,
                })
              )
            },
            onRuntimeError: (error) => {
              appendLog((current) =>
                appendRuntimeErrorEvent(current, {
                  sessionId,
                  conversationId: config.conversationId,
                  appId: config.appId,
                  appSessionId: config.appSessionId,
                  errorName: 'type' in error ? error.type : undefined,
                  message: error.message,
                  recoverable: 'payload' in error ? error.payload.recoverable : error.recoverable,
                })
              )
            },
            onHeartbeatTimeout: (error) => {
              appendLog((current) =>
                appendHeartbeatTimeoutEvent(current, {
                  sessionId,
                  conversationId: config.conversationId,
                  appId: config.appId,
                  appSessionId: config.appSessionId,
                  timeoutMs: error.details.timeoutMs,
                  reason: error.message,
                })
              )
            },
          }}
          sandbox={config.sandbox}
          onLoad={() => {
            appendLog((current) =>
              appendIframeLoadEvent(current, {
                sessionId,
                conversationId: config.conversationId,
                appId: config.appId,
                appSessionId: config.appSessionId,
                actor: 'platform',
                iframeUrl: config.entryUrl,
                origin: config.targetOrigin,
                status: 'loaded',
                loadMs: Date.now() - iframeLoadStartedAtRef.current,
              })
            )
          }}
        />
      </Paper>
    </SimpleGrid>
  )
}
