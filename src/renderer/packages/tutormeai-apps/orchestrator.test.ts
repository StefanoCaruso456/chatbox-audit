import { createMessage } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { routeTutorMeAiAppRequest } from './orchestrator'

describe('routeTutorMeAiAppRequest', () => {
  it('launches chess for a clear play request', async () => {
    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.1',
      userId: 'user.1',
      userRequest: "let's play chess",
      requestMessageId: 'message.1',
      previousMessages: [createMessage('user', 'Hello')],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    expect(
      result.message.contentParts.some((part) => part.type === 'embedded-app' && part.appId === 'chess.internal')
    ).toBe(true)
  })

  it('launches weather for explicit forecast requests', async () => {
    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.2',
      userId: 'user.2',
      userRequest: 'show me the weather in Austin, TX',
      requestMessageId: 'message.2',
      previousMessages: [createMessage('user', 'Hello')],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    expect(
      result.message.contentParts.some((part) => part.type === 'embedded-app' && part.appId === 'weather.public')
    ).toBe(true)
  })

  it('opens the authenticated planner app in connect-required mode when auth is missing', async () => {
    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.3',
      userId: 'user.3',
      userRequest: 'open planner for overdue work',
      requestMessageId: 'message.3',
      previousMessages: [createMessage('user', 'Hello')],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    const plannerPart = result.message.contentParts.find(
      (part) => part.type === 'embedded-app' && part.appId === 'planner.oauth'
    )

    expect(plannerPart && plannerPart.type === 'embedded-app' ? plannerPart.bridge?.bootstrap?.authState : null).toBe(
      'required'
    )
  })

  it('asks a clarifying question for generic app requests', async () => {
    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.4',
      userId: 'user.4',
      userRequest: 'open an app for me',
      requestMessageId: 'message.4',
      previousMessages: [createMessage('user', 'Hello')],
    })

    expect(result.kind).toBe('clarify')
  })

  it('passes through normal chat follow-ups without relaunching an app', async () => {
    const priorAssistant = createMessage('assistant', 'Launching Chess Tutor inside chat.')
    priorAssistant.contentParts = [
      {
        type: 'embedded-app',
        appId: 'chess.internal',
        appName: 'Chess Tutor',
        appSessionId: 'app-session.chess.1',
        sourceUrl: 'http://localhost:1212/embedded-apps/chess',
        title: 'Chess Tutor',
        summary: 'Current board FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w',
        status: 'ready',
        allowedOrigin: 'http://localhost:1212',
        bridge: {
          expectedOrigin: 'http://localhost:1212',
          conversationId: 'conversation.5',
          appSessionId: 'app-session.chess.1',
          bootstrap: {
            launchReason: 'chat-tool',
            authState: 'connected',
            grantedPermissions: ['session:write', 'tool:invoke'],
            availableTools: [],
          },
        },
      },
    ]

    const result = await routeTutorMeAiAppRequest({
      origin: 'http://localhost:1212',
      conversationId: 'conversation.5',
      userId: 'user.5',
      userRequest: 'what should I do here?',
      requestMessageId: 'message.5',
      previousMessages: [createMessage('user', "let's play chess"), priorAssistant],
    })

    expect(result.kind).toBe('pass-through')
  })
})
