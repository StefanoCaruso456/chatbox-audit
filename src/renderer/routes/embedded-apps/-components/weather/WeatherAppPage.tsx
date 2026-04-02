import { Alert, Badge, Box, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useEmbeddedAppBridge } from '../useEmbeddedAppBridge'
import { buildDeterministicForecast, buildWeatherCompletionSignal, type DeterministicForecast } from './forecast'

export function WeatherAppPage() {
  const { invocationMessage, runtimeContext, sendCompletion, sendState } = useEmbeddedAppBridge('weather.public')
  const [forecast, setForecast] = useState<DeterministicForecast | null>(null)

  useEffect(() => {
    if (!runtimeContext) {
      return
    }

    sendState({
      status: 'waiting-user',
      summary: 'Weather dashboard is ready. Waiting for a location lookup.',
      state: {
        status: 'idle',
      },
      progress: {
        label: 'Ready',
        percent: 0,
      },
    })
  }, [runtimeContext, sendState])

  useEffect(() => {
    if (!invocationMessage || invocationMessage.payload.toolName !== 'weather.lookup' || !runtimeContext) {
      return
    }

    const nextForecast = buildDeterministicForecast(
      String(invocationMessage.payload.arguments.location ?? 'Chicago, IL')
    )
    setForecast(nextForecast)

    sendState({
      status: 'active',
      summary: nextForecast.summary,
      state: {
        location: nextForecast.location,
        temperatureF: nextForecast.temperatureF,
        condition: nextForecast.condition,
        windMph: nextForecast.windMph,
        precipitationChance: nextForecast.precipitationChance,
      },
      progress: {
        label: 'Forecast ready',
        percent: 100,
      },
    })

    sendCompletion(
      buildWeatherCompletionSignal({
        conversationId: runtimeContext.conversationId,
        appSessionId: runtimeContext.appSessionId,
        toolCallId: invocationMessage.payload.toolCallId,
        forecast: nextForecast,
      })
    )
  }, [invocationMessage, runtimeContext, sendCompletion, sendState])

  return (
    <Box p="md" bg="linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)" mih="100vh">
      <Stack gap="md">
        <Group justify="space-between">
          <div>
            <Title order={3}>Weather Lookup</Title>
            <Text c="dimmed" size="sm">
              Deterministic classroom-friendly forecasts surfaced directly inside chat.
            </Text>
          </div>
          <Badge color={forecast ? 'teal' : 'blue'} variant="light">
            {forecast ? 'Forecast ready' : 'Waiting'}
          </Badge>
        </Group>

        {!forecast && (
          <Alert color="blue" variant="light">
            Waiting for the host to send a location request.
          </Alert>
        )}

        {forecast && (
          <Paper withBorder radius="lg" p="md">
            <Stack gap="xs">
              <Text fw={600}>{forecast.location}</Text>
              <Text size="xl" fw={700}>
                {forecast.temperatureF}F
              </Text>
              <Text>{forecast.condition}</Text>
              <Text size="sm" c="dimmed">
                Wind {forecast.windMph} mph • Precipitation chance {forecast.precipitationChance}%
              </Text>
              <Text size="sm">{forecast.guidance}</Text>
              <Button
                variant="default"
                onClick={() => {
                  if (!forecast || !runtimeContext) {
                    return
                  }

                  sendCompletion(
                    buildWeatherCompletionSignal({
                      conversationId: runtimeContext.conversationId,
                      appSessionId: runtimeContext.appSessionId,
                      toolCallId: invocationMessage?.payload.toolCallId,
                      forecast,
                    })
                  )
                }}
              >
                Re-send forecast summary to chat
              </Button>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Box>
  )
}
