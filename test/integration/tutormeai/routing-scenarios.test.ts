import { createMessage } from '@shared/types'
import type { Message, MessageEmbeddedAppPart } from '@shared/types/session'
import { describe, expect, it } from 'vitest'
import { routeTutorMeAiAppRequest } from '@/packages/tutormeai-apps/orchestrator'

const localOrigin = 'http://localhost:1212'

function extractEmbeddedAppPart(message: Message): MessageEmbeddedAppPart {
  const part = message.contentParts.find((candidate) => candidate.type === 'embedded-app')
  if (!part || part.type !== 'embedded-app') {
    throw new Error('Expected an embedded app message part')
  }

  return part
}

function getMessageText(message: Message): string {
  return message.contentParts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}

describe('TutorMeAI routing scenarios', () => {
  it('refuses unrelated prompts even when a prior app session exists', async () => {
    const priorLaunch = await routeTutorMeAiAppRequest({
      origin: localOrigin,
      conversationId: 'conversation.routing.1',
      userId: 'user.routing.1',
      userRequest: "let's play chess",
      requestMessageId: 'message.routing.1',
      previousMessages: [createMessage('user', 'hello')],
    })

    expect(priorLaunch.kind).toBe('invoke-tool')
    if (priorLaunch.kind !== 'invoke-tool') {
      return
    }

    const result = await routeTutorMeAiAppRequest({
      origin: localOrigin,
      conversationId: 'conversation.routing.1',
      userId: 'user.routing.1',
      userRequest: 'Tell me a joke about penguins.',
      requestMessageId: 'message.routing.2',
      previousMessages: [createMessage('user', "let's play chess"), priorLaunch.message],
    })

    expect(result.kind).toBe('pass-through')
  })

  it('asks a clarifying question when the user requests a generic app', async () => {
    const result = await routeTutorMeAiAppRequest({
      origin: localOrigin,
      conversationId: 'conversation.routing.2',
      userId: 'user.routing.2',
      userRequest: 'open an app for me',
      requestMessageId: 'message.routing.3',
      previousMessages: [createMessage('user', 'hello')],
    })

    expect(result.kind).toBe('clarify')
    if (result.kind !== 'clarify') {
      return
    }

    const messageText = getMessageText(result.message)
    expect(messageText).toContain('Chess Tutor')
    expect(messageText).toContain('Weather Lookup')
    expect(messageText).toContain('Planner Connect')
  })

  it('asks for clarification when the request explicitly conflicts across multiple apps', async () => {
    const result = await routeTutorMeAiAppRequest({
      origin: localOrigin,
      conversationId: 'conversation.routing.3',
      userId: 'user.routing.3',
      userRequest: 'Should I use chess or weather?',
      requestMessageId: 'message.routing.4',
      previousMessages: [createMessage('user', 'hello')],
    })

    expect(result.kind).toBe('clarify')
    if (result.kind !== 'clarify') {
      return
    }

    const messageText = getMessageText(result.message).toLowerCase()
    expect(messageText).toContain('chess')
    expect(messageText).toContain('weather')
  })

  it('treats the planner app as already connected once a prior connected session exists', async () => {
    const priorLaunch = await routeTutorMeAiAppRequest({
      origin: localOrigin,
      conversationId: 'conversation.routing.4',
      userId: 'user.routing.4',
      userRequest: 'open planner for overdue work',
      requestMessageId: 'message.routing.5',
      previousMessages: [createMessage('user', 'hello')],
    })

    expect(priorLaunch.kind).toBe('invoke-tool')
    if (priorLaunch.kind !== 'invoke-tool') {
      return
    }

    const connectedPlannerMessage: Message = {
      ...priorLaunch.message,
      contentParts: priorLaunch.message.contentParts.map((part) => {
        if (part.type !== 'embedded-app') {
          return part
        }

        return {
          ...part,
          status: 'ready',
          summary: 'Planner connected and focused on overdue work.',
          bridge: part.bridge
            ? {
                ...part.bridge,
                pendingInvocation: undefined,
                bootstrap: part.bridge.bootstrap
                  ? {
                      ...part.bridge.bootstrap,
                      authState: 'connected',
                    }
                  : part.bridge.bootstrap,
                completion: {
                  status: 'succeeded',
                  resultSummary: 'Planner dashboard opened with overdue assignments highlighted.',
                  result: {
                    focus: 'overdue',
                    requiresAuth: false,
                  },
                },
              }
            : part.bridge,
        }
      }),
    }

    const result = await routeTutorMeAiAppRequest({
      origin: localOrigin,
      conversationId: 'conversation.routing.4',
      userId: 'user.routing.4',
      userRequest: 'open planner for overdue work again',
      requestMessageId: 'message.routing.6',
      previousMessages: [createMessage('user', 'connect planner'), connectedPlannerMessage],
    })

    expect(result.kind).toBe('invoke-tool')
    if (result.kind !== 'invoke-tool') {
      return
    }

    const plannerPart = extractEmbeddedAppPart(result.message)
    expect(plannerPart.bridge?.bootstrap?.authState).toBe('connected')
    expect(plannerPart.summary).toContain('preparing')
  })
})
