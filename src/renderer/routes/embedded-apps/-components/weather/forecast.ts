import type { CompletionSignal } from '@shared/contracts/v1'

export type DeterministicForecast = {
  location: string
  temperatureF: number
  condition: string
  windMph: number
  precipitationChance: number
  summary: string
  guidance: string
}

function hashLocation(location: string) {
  return Array.from(location).reduce((total, character) => total + character.charCodeAt(0), 0)
}

export function buildDeterministicForecast(rawLocation: string): DeterministicForecast {
  const location = rawLocation.trim() || 'Chicago, IL'
  const hash = hashLocation(location)
  const temperatureF = 48 + (hash % 35)
  const windMph = 4 + (hash % 12)
  const precipitationChance = (hash * 7) % 80
  const conditions = ['Partly cloudy', 'Sunny breaks', 'Light rain', 'Breezy clouds', 'Cool and clear']
  const condition = conditions[hash % conditions.length]
  const summary = `${location} is ${temperatureF}F with ${condition.toLowerCase()} and ${windMph} mph winds.`
  const guidance =
    precipitationChance >= 50
      ? 'Plan for indoor transitions or rain gear.'
      : temperatureF <= 55
        ? 'A light jacket is a safe recommendation.'
        : 'Outdoor activities look comfortable.'

  return {
    location,
    temperatureF,
    condition,
    windMph,
    precipitationChance,
    summary,
    guidance,
  }
}

export function buildWeatherCompletionSignal(input: {
  conversationId: string
  appSessionId: string
  toolCallId?: string
  forecast: DeterministicForecast
}): CompletionSignal {
  return {
    version: 'v1',
    conversationId: input.conversationId,
    appSessionId: input.appSessionId,
    appId: 'weather.public',
    toolCallId: input.toolCallId,
    status: 'succeeded',
    resultSummary: `Forecast ready for ${input.forecast.location}: ${input.forecast.summary}`,
    result: {
      location: input.forecast.location,
      summary: input.forecast.summary,
      temperatureF: input.forecast.temperatureF,
      condition: input.forecast.condition,
      windMph: input.forecast.windMph,
      precipitationChance: input.forecast.precipitationChance,
    },
    completedAt: new Date().toISOString(),
    followUpContext: {
      summary: 'Use the forecast details to answer classroom planning or clothing questions.',
      userVisibleSummary: input.forecast.guidance,
      recommendedPrompts: ['Should students bring jackets?', 'Would an outdoor activity still work?'],
      stateDigest: {
        temperatureF: input.forecast.temperatureF,
        precipitationChance: input.forecast.precipitationChance,
      },
    },
  }
}
