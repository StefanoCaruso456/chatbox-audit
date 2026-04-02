import { Alert, Badge, Box, Button, Group, List, Paper, Stack, Text, Title } from '@mantine/core'
import type { CompletionSignal } from '@shared/contracts/v1'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEmbeddedAppBridge } from '../useEmbeddedAppBridge'

type PlannerFocus = 'today' | 'week' | 'overdue'

const plannerTasks: Record<PlannerFocus, string[]> = {
  today: ['Finish algebra worksheet', 'Review vocabulary flashcards', 'Upload science reflection'],
  week: ['Prepare history quiz notes', 'Outline reading response', 'Plan group project checkpoints'],
  overdue: ['Turn in missing lab summary', 'Complete reading log', 'Finish late discussion reply'],
}

function buildPlannerSummary(focus: PlannerFocus, connected: boolean) {
  if (!connected) {
    return 'Planner Connect is waiting for the user to authorize their account.'
  }

  return `Planner dashboard is focused on ${focus} items with ${plannerTasks[focus].length} suggested tasks ready.`
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
  const [connected, setConnected] = useState(false)
  const [focus, setFocus] = useState<PlannerFocus>('today')

  useEffect(() => {
    if (!runtimeContext) {
      return
    }

    setConnected(runtimeContext.authState === 'connected')
    const bootstrapFocus: PlannerFocus = 'today'
    sendState({
      status: runtimeContext.authState === 'required' ? 'waiting-auth' : 'waiting-user',
      summary: buildPlannerSummary(bootstrapFocus, runtimeContext.authState === 'connected'),
      state: {
        authState: runtimeContext.authState,
        focus: bootstrapFocus,
      },
      progress: {
        label: runtimeContext.authState === 'required' ? 'Connect account' : 'Planner ready',
        percent: runtimeContext.authState === 'required' ? 20 : 60,
      },
    })
  }, [runtimeContext, sendState])

  useEffect(() => {
    if (!invocationMessage) {
      return
    }

    const requestedFocus = String(invocationMessage.payload.arguments.focus ?? 'today')
    if (requestedFocus === 'today' || requestedFocus === 'week' || requestedFocus === 'overdue') {
      setFocus(requestedFocus)
    }
  }, [invocationMessage])

  const tasks = useMemo(() => plannerTasks[focus], [focus])

  const handleConnect = useCallback(() => {
    setConnected(true)
    sendState({
      status: 'active',
      summary: buildPlannerSummary(focus, true),
      state: {
        authState: 'connected',
        focus,
        taskCount: tasks.length,
      },
      progress: {
        label: 'Connected',
        percent: 80,
      },
    })
  }, [focus, sendState, tasks.length])

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
            This app requires a user-level OAuth connection. Use the host-managed connect flow to continue.
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
              {connected && (
                <Button
                  variant="default"
                  onClick={() => {
                    sendState({
                      status: 'active',
                      summary: buildPlannerSummary(focus, true),
                      state: {
                        authState: 'connected',
                        focus,
                        taskCount: tasks.length,
                      },
                      progress: {
                        label: 'Dashboard refreshed',
                        percent: 85,
                      },
                    })
                  }}
                >
                  Refresh dashboard state
                </Button>
              )}
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  )
}
