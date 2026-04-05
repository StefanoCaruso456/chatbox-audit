import { Alert, Badge, Box, Button, Group, List, Paper, Stack, Text, Title } from '@mantine/core'
import type { CompletionSignal } from '@shared/contracts/v1'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useEmbeddedAppBridge } from '../useEmbeddedAppBridge'
import {
  buildPlannerAuthUserId,
  buildPlannerOAuthStartUrl,
  derivePlannerOAuthAuthState,
  fetchPlannerOAuthConnection,
  isPlannerOAuthCallbackMessage,
  resolvePlannerBackendOrigin,
} from './auth'

type PlannerFocus = 'today' | 'week' | 'overdue'
type PlannerAuthPhase = 'checking' | 'required' | 'connecting' | 'connected' | 'error'

const plannerTasks: Record<PlannerFocus, string[]> = {
  today: ['Finish algebra worksheet', 'Review vocabulary flashcards', 'Upload science reflection'],
  week: ['Prepare history quiz notes', 'Outline reading response', 'Plan group project checkpoints'],
  overdue: ['Turn in missing lab summary', 'Complete reading log', 'Finish late discussion reply'],
}

function buildPlannerSummary(input: {
  focus: PlannerFocus
  authPhase: PlannerAuthPhase
  connected: boolean
  authError: string | null
}) {
  if (input.connected) {
    return `Planner dashboard is focused on ${input.focus} items with ${plannerTasks[input.focus].length} suggested tasks ready.`
  }

  if (input.authPhase === 'checking') {
    return 'Planner Connect is checking whether the user already linked a Google account.'
  }

  if (input.authPhase === 'connecting') {
    return 'Planner Connect opened Google sign-in and is waiting for the account link to finish.'
  }

  if (input.authPhase === 'error' && input.authError) {
    return input.authError
  }

  return 'Planner Connect is waiting for the user to authorize their Google account.'
}

function buildPlannerCompletionSignal(input: {
  conversationId: string
  appSessionId: string
  toolCallId?: string
  focus: PlannerFocus
}): CompletionSignal {
  return {
    version: 'v1',
    conversationId: input.conversationId,
    appSessionId: input.appSessionId,
    appId: 'planner.oauth',
    toolCallId: input.toolCallId,
    status: 'succeeded',
    resultSummary: `Planner dashboard opened with ${input.focus} assignments highlighted.`,
    result: {
      focus: input.focus,
      requiresAuth: false,
      taskCount: plannerTasks[input.focus].length,
    },
    completedAt: new Date().toISOString(),
    followUpContext: {
      summary: 'Ask the student which task they want to tackle first from the connected planner dashboard.',
      userVisibleSummary: `Planner connected and focused on ${input.focus} work.`,
      recommendedPrompts: ['Which task should we tackle first?', 'Can you help me break down the first task?'],
      stateDigest: {
        focus: input.focus,
        taskCount: plannerTasks[input.focus].length,
      },
    },
  }
}

export function PlannerAppPage() {
  const { invocationMessage, runtimeContext, sendCompletion, sendState } = useEmbeddedAppBridge('planner.oauth')
  const tutorMeAIProfile = useSettingsStore((state) => state.tutorMeAIProfile)
  const [connected, setConnected] = useState(false)
  const [focus, setFocus] = useState<PlannerFocus>('today')
  const [authPhase, setAuthPhase] = useState<PlannerAuthPhase>('checking')
  const [authError, setAuthError] = useState<string | null>(null)
  const popupRef = useRef<Window | null>(null)
  const pollTimerRef = useRef<number | null>(null)

  const authUserId = useMemo(
    () =>
      buildPlannerAuthUserId({
        email: tutorMeAIProfile.email,
        name: tutorMeAIProfile.name,
      }),
    [tutorMeAIProfile.email, tutorMeAIProfile.name]
  )

  const backendOrigin = useMemo(() => resolvePlannerBackendOrigin(), [])
  const tasks = useMemo(() => plannerTasks[focus], [focus])

  const clearConnectPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const lookupConnection = useCallback(async () => {
    try {
      const connection = await fetchPlannerOAuthConnection({
        backendOrigin,
        userId: authUserId,
      })
      const authState = derivePlannerOAuthAuthState(connection)

      if (authState === 'connected') {
        return {
          state: 'connected' as const,
        }
      }

      if (authState === 'expired') {
        return {
          state: 'expired' as const,
          error: 'Your Google planner connection expired. Connect the account again to continue.',
        }
      }

      return {
        state: 'required' as const,
      }
    } catch (error) {
      return {
        state: 'error' as const,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }, [authUserId, backendOrigin])

  const applyLookupResult = useCallback(
    (result: Awaited<ReturnType<typeof lookupConnection>>) => {
      if (result.state === 'connected') {
        clearConnectPolling()
        popupRef.current?.close()
        popupRef.current = null
        setConnected(true)
        setAuthPhase('connected')
        setAuthError(null)
        return
      }

      setConnected(false)

      if (result.state === 'expired') {
        clearConnectPolling()
        popupRef.current = null
        setAuthPhase('error')
        setAuthError(result.error)
        return
      }

      if (result.state === 'error') {
        clearConnectPolling()
        popupRef.current = null
        setAuthPhase('error')
        setAuthError(result.error)
        return
      }

      setAuthPhase('required')
      setAuthError(null)
    },
    [clearConnectPolling, lookupConnection]
  )

  useEffect(() => {
    if (!runtimeContext) {
      return
    }

    let cancelled = false
    setAuthPhase('checking')

    void lookupConnection().then((result) => {
      if (!cancelled) {
        applyLookupResult(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [applyLookupResult, lookupConnection, runtimeContext])

  useEffect(() => {
    if (!runtimeContext) {
      return
    }

    const currentAuthState =
      connected || authPhase === 'connected' ? 'connected' : authPhase === 'error' && authError?.includes('expired') ? 'expired' : 'required'

    sendState({
      status: currentAuthState === 'connected' ? 'active' : 'waiting-auth',
      summary: buildPlannerSummary({
        focus,
        authPhase,
        connected,
        authError,
      }),
      state: {
        authState: currentAuthState,
        focus,
        taskCount: tasks.length,
        backendOrigin,
        authUserId,
        ...(authError ? { authError } : {}),
      },
      progress: {
        label:
          currentAuthState === 'connected'
            ? 'Connected'
            : authPhase === 'checking'
              ? 'Checking connection'
              : authPhase === 'connecting'
                ? 'Waiting for Google sign-in'
                : 'Connect account',
        percent:
          currentAuthState === 'connected'
            ? 80
            : authPhase === 'checking'
              ? 30
              : authPhase === 'connecting'
                ? 50
                : 20,
      },
    })
  }, [authError, authPhase, authUserId, backendOrigin, connected, focus, runtimeContext, sendState, tasks.length])

  useEffect(() => {
    if (!invocationMessage) {
      return
    }

    const requestedFocus = String(invocationMessage.payload.arguments.focus ?? 'today')
    if (requestedFocus === 'today' || requestedFocus === 'week' || requestedFocus === 'overdue') {
      setFocus(requestedFocus)
    }
  }, [invocationMessage])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isPlannerOAuthCallbackMessage(event, backendOrigin)) {
        return
      }

      if (event.data.ok) {
        void lookupConnection().then((result) => {
          applyLookupResult(result)
        })
        return
      }

      clearConnectPolling()
      popupRef.current = null
      setConnected(false)
      setAuthPhase('error')
      setAuthError(event.data.message)
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [applyLookupResult, backendOrigin, clearConnectPolling, lookupConnection])

  useEffect(() => {
    return () => {
      clearConnectPolling()
      popupRef.current = null
    }
  }, [clearConnectPolling])

  const handleConnect = useCallback(() => {
    clearConnectPolling()
    setConnected(false)
    setAuthPhase('connecting')
    setAuthError(null)

    const startUrl = buildPlannerOAuthStartUrl({
      backendOrigin,
      clientOrigin: window.location.origin,
      userId: authUserId,
    })

    popupRef.current = window.open(startUrl, 'planner-google-oauth', 'popup=yes,width=640,height=760')
    if (!popupRef.current) {
      setAuthPhase('error')
      setAuthError('The Google sign-in window was blocked. Allow pop-ups and try again.')
      return
    }

    pollTimerRef.current = window.setInterval(() => {
      const popupClosed = popupRef.current?.closed ?? false
      void lookupConnection().then((result) => {
        if (result.state === 'connected' || result.state === 'expired' || result.state === 'error') {
          applyLookupResult(result)
          return
        }

        if (popupClosed) {
          clearConnectPolling()
          popupRef.current = null
          setAuthPhase('required')
          setAuthError('Google sign-in was closed before the planner account connected.')
        }
      })
    }, 1000)
  }, [applyLookupResult, authUserId, backendOrigin, clearConnectPolling, lookupConnection])

  const handleShare = useCallback(() => {
    if (!runtimeContext) {
      return
    }

    sendCompletion(
      buildPlannerCompletionSignal({
        conversationId: runtimeContext.conversationId,
        appSessionId: runtimeContext.appSessionId,
        toolCallId: invocationMessage?.payload.toolCallId,
        focus,
      })
    )
  }, [focus, invocationMessage?.payload.toolCallId, runtimeContext, sendCompletion])

  const handleRefresh = useCallback(() => {
    setAuthPhase('checking')
    setAuthError(null)
    void lookupConnection().then((result) => {
      applyLookupResult(result)
    })
  }, [applyLookupResult, lookupConnection])

  return (
    <Box p="md" bg="linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)" mih="100vh">
      <Stack gap="md">
        <Group justify="space-between">
          <div>
            <Title order={3}>Planner Connect</Title>
            <Text c="dimmed" size="sm">
              Authenticated assignment dashboard routed through the host platform.
            </Text>
          </div>
          <Badge color={connected ? 'teal' : 'yellow'} variant="light">
            {connected ? 'Connected' : 'Needs auth'}
          </Badge>
        </Group>

        {!connected && (
          <Alert color="yellow" variant="light">
            {authError ??
              'This app requires a user-level OAuth connection. Use the host-managed Google sign-in flow to continue.'}
          </Alert>
        )}

        <Paper withBorder radius="lg" p="md">
          <Stack gap="sm">
            <Text fw={600}>Current focus: {focus}</Text>
            <Group>
              <Button variant={focus === 'today' ? 'filled' : 'default'} onClick={() => setFocus('today')}>
                Today
              </Button>
              <Button variant={focus === 'week' ? 'filled' : 'default'} onClick={() => setFocus('week')}>
                This week
              </Button>
              <Button variant={focus === 'overdue' ? 'filled' : 'default'} onClick={() => setFocus('overdue')}>
                Overdue
              </Button>
            </Group>
            <List spacing="xs" size="sm">
              {tasks.map((task) => (
                <List.Item key={task}>{task}</List.Item>
              ))}
            </List>
            <Group>
              {!connected ? (
                <Button onClick={handleConnect}>Connect account</Button>
              ) : (
                <Button onClick={handleShare}>Send planner summary to chat</Button>
              )}
              {(connected || authPhase === 'error') && (
                <Button
                  variant="default"
                  onClick={handleRefresh}
                >
                  {connected ? 'Refresh dashboard state' : 'Retry connection check'}
                </Button>
              )}
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  )
}
