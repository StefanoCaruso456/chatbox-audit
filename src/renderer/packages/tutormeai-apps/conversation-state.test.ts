import { createMessage } from '@shared/types'
import { describe, expect, it } from 'vitest'
import {
  buildEmbeddedAppConversationIndicators,
  selectConversationAppReference,
} from './conversation-state'

describe('tutormeai app conversation state helpers', () => {
  it('marks the latest active app as current and older apps as recent', () => {
    const weatherMessage = createMessage('assistant', 'Weather ready')
    weatherMessage.timestamp = Date.parse('2026-04-02T10:00:00.000Z')
    weatherMessage.contentParts = [
      {
        type: 'embedded-app',
        appId: 'weather.public',
        appName: 'Weather Lookup',
        appSessionId: 'app-session.weather.1',
        sourceUrl: 'http://localhost:1212/embedded-apps/weather',
        title: 'Weather Lookup',
        summary: 'Forecast ready for Chicago.',
        status: 'ready',
        bridge: {
          expectedOrigin: 'http://localhost:1212',
          conversationId: 'conversation.multi.1',
          appSessionId: 'app-session.weather.1',
          completion: {
            status: 'succeeded',
            resultSummary: 'Forecast ready for Chicago.',
            result: {
              location: 'Chicago, IL',
            },
          },
        },
      },
    ]

    const plannerMessage = createMessage('assistant', 'Planner active')
    plannerMessage.timestamp = Date.parse('2026-04-02T10:05:00.000Z')
    plannerMessage.contentParts = [
      {
        type: 'embedded-app',
        appId: 'planner.oauth',
        appName: 'Planner Connect',
        appSessionId: 'app-session.planner.1',
        sourceUrl: 'http://localhost:1212/embedded-apps/planner',
        title: 'Planner Connect',
        summary: 'Planner dashboard is waiting for the next action.',
        status: 'ready',
        bridge: {
          expectedOrigin: 'http://localhost:1212',
          conversationId: 'conversation.multi.1',
          appSessionId: 'app-session.planner.1',
          bootstrap: {
            launchReason: 'chat-tool',
            authState: 'connected',
          },
          pendingInvocation: {
            toolCallId: 'tool-call.planner.1',
            toolName: 'planner.open-dashboard',
          },
        },
      },
    ]

    const indicators = buildEmbeddedAppConversationIndicators([weatherMessage, plannerMessage])

    expect(indicators[`${plannerMessage.id}:0`]).toEqual({
      label: 'Current app',
      tone: 'blue',
    })
    expect(indicators[`${weatherMessage.id}:0`]).toEqual({
      label: 'Recent app',
      tone: 'gray',
    })
  })

  it('selects an explicitly referenced app even when another app is newer', () => {
    const chessMessage = createMessage('assistant', 'Chess active')
    chessMessage.timestamp = Date.parse('2026-04-02T10:00:00.000Z')
    chessMessage.contentParts = [
      {
        type: 'embedded-app',
        appId: 'chess.internal',
        appName: 'Chess Tutor',
        appSessionId: 'app-session.chess.1',
        sourceUrl: 'http://localhost:1212/embedded-apps/chess',
        title: 'Chess Tutor',
        summary: 'Board is active.',
        status: 'ready',
        bridge: {
          expectedOrigin: 'http://localhost:1212',
          conversationId: 'conversation.multi.2',
          appSessionId: 'app-session.chess.1',
          bootstrap: {
            launchReason: 'chat-tool',
            authState: 'connected',
          },
        },
      },
    ]

    const weatherMessage = createMessage('assistant', 'Weather ready')
    weatherMessage.timestamp = Date.parse('2026-04-02T10:05:00.000Z')
    weatherMessage.contentParts = [
      {
        type: 'embedded-app',
        appId: 'weather.public',
        appName: 'Weather Lookup',
        appSessionId: 'app-session.weather.1',
        sourceUrl: 'http://localhost:1212/embedded-apps/weather',
        title: 'Weather Lookup',
        summary: 'Forecast ready for Chicago.',
        status: 'ready',
        bridge: {
          expectedOrigin: 'http://localhost:1212',
          conversationId: 'conversation.multi.2',
          appSessionId: 'app-session.weather.1',
          completion: {
            status: 'succeeded',
            resultSummary: 'Forecast ready for Chicago.',
            result: {
              location: 'Chicago, IL',
            },
          },
        },
      },
    ]

    const selected = selectConversationAppReference(
      [chessMessage, weatherMessage],
      'Based on the weather app, should students bring jackets tomorrow?'
    )

    expect(selected?.appId).toBe('weather.public')
    expect(selected?.appSessionId).toBe('app-session.weather.1')
  })
})
