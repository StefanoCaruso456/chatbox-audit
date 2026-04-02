import { describe, expect, it } from 'vitest'
import { inspectReviewMessage } from '@/packages/review-harness/review-message-inspector'
import {
  exampleAppHeartbeatMessage,
  exampleAppStateUpdateMessage,
  exampleHostBootstrapMessage,
} from '../../../shared/contracts/v1/runtime-messages'

const context = {
  expectedOrigin: 'https://apps.chatbridge.dev',
  conversationId: 'conversation.1',
  appSessionId: 'app-session.chess.1',
  appId: 'chess.internal',
}

describe('inspectReviewMessage', () => {
  it('rejects invalid payload shapes', () => {
    const result = inspectReviewMessage({
      ...context,
      origin: context.expectedOrigin,
      payload: {
        type: 'app.state',
        source: 'app',
      },
    })

    expect(result.decision).toBe('reject')
    expect(result.reason).toBe('invalid-shape')
    expect(result.summary).toContain('payload did not match')
    expect(result.details.length).toBeGreaterThan(0)
    expect(result.message).toBeUndefined()
  })

  it('rejects origin mismatches before envelope inspection', () => {
    const result = inspectReviewMessage({
      ...context,
      origin: 'https://malicious.example.com',
      payload: exampleAppStateUpdateMessage,
    })

    expect(result.decision).toBe('reject')
    expect(result.reason).toBe('origin-mismatch')
    expect(result.details).toEqual([
      'expectedOrigin: https://apps.chatbridge.dev',
      'actualOrigin: https://malicious.example.com',
    ])
  })

  it('rejects envelope mismatches on otherwise valid app traffic', () => {
    const result = inspectReviewMessage({
      ...context,
      origin: context.expectedOrigin,
      payload: {
        ...exampleAppHeartbeatMessage,
        conversationId: 'conversation.2',
        appSessionId: 'app-session.chess.2',
        appId: 'flashcards.public',
      },
    })

    expect(result.decision).toBe('reject')
    expect(result.reason).toBe('envelope-mismatch')
    expect(result.details).toEqual([
      'conversationId mismatch: expected "conversation.1" but received "conversation.2".',
      'appSessionId mismatch: expected "app-session.chess.1" but received "app-session.chess.2".',
      'appId mismatch: expected "chess.internal" but received "flashcards.public".',
    ])
    expect(result.message?.type).toBe('app.heartbeat')
  })

  it('flags unexpected host traffic from the embedded iframe', () => {
    const result = inspectReviewMessage({
      ...context,
      origin: context.expectedOrigin,
      payload: exampleHostBootstrapMessage,
    })

    expect(result.decision).toBe('flag')
    expect(result.reason).toBe('unexpected-source-type')
    expect(result.source).toBe('host')
    expect(result.type).toBe('host.bootstrap')
    expect(result.summary).toContain('not app traffic')
  })

  it('accepts valid app traffic that matches the review context', () => {
    const result = inspectReviewMessage({
      ...context,
      origin: context.expectedOrigin,
      payload: {
        ...exampleAppStateUpdateMessage,
        conversationId: context.conversationId,
        appSessionId: context.appSessionId,
        appId: context.appId,
      },
    })

    expect(result.decision).toBe('accept')
    expect(result.reason).toBe('accepted-traffic')
    expect(result.message?.source).toBe('app')
    expect(result.message?.type).toBe('app.state')
    expect(result.details).toEqual([
      'source: app',
      'type: app.state',
      'conversationId: conversation.1',
      'appSessionId: app-session.chess.1',
      'appId: chess.internal',
    ])
  })
})
