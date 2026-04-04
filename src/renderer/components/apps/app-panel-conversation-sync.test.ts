/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import { getApprovedAppById } from '@/data/approvedApps'
import { selectLatestApprovedAppConversationPart } from './app-panel-conversation-sync'

describe('app-panel conversation sync', () => {
  it('selects the latest active runtime part for the approved app', () => {
    const app = getApprovedAppById('chess-tutor')
    if (!app) {
      throw new Error('Missing chess-tutor fixture')
    }

    const ref = selectLatestApprovedAppConversationPart(
      {
        id: 'session.1',
        messages: [
          {
            id: 'message.completed',
            timestamp: Date.parse('2026-04-03T20:00:00.000Z'),
            role: 'assistant',
            contentParts: [
              {
                type: 'embedded-app',
                appId: 'chess.internal',
                appName: 'Chess Tutor',
                appSessionId: 'app-session.old',
                sourceUrl: 'http://localhost:3000/embedded-apps/chess',
                status: 'ready',
                bridge: {
                  expectedOrigin: 'http://localhost:3000',
                  conversationId: 'conversation.1',
                  appSessionId: 'app-session.old',
                  completion: {
                    status: 'succeeded',
                    resultSummary: 'Old game finished.',
                    result: {},
                  },
                },
              },
            ],
          },
          {
            id: 'message.active',
            timestamp: Date.parse('2026-04-03T20:05:00.000Z'),
            role: 'assistant',
            contentParts: [
              {
                type: 'embedded-app',
                appId: 'chess.internal',
                appName: 'Chess Tutor',
                appSessionId: 'app-session.active',
                sourceUrl: 'http://localhost:3000/embedded-apps/chess',
                summary: 'White to move.',
                status: 'ready',
                bridge: {
                  expectedOrigin: 'http://localhost:3000',
                  conversationId: 'conversation.1',
                  appSessionId: 'app-session.active',
                  pendingInvocation: {
                    toolCallId: 'tool-call.1',
                    toolName: 'chess.launch-game',
                  },
                },
              },
            ],
          },
        ],
        threads: [],
      } as never,
      app
    )

    expect(ref?.messageId).toBe('message.active')
    expect(ref?.part.appSessionId).toBe('app-session.active')
  })
})
