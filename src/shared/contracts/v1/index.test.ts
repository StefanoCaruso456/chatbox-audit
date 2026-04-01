import { describe, expect, it } from 'vitest'
import {
  AppManifestSchema,
  CompletionSignalSchema,
  EmbeddedAppMessageSchema,
  exampleAppManifests,
  exampleInternalChessManifest,
  examplePublicWeatherManifest,
  validateAppManifest,
  validateCompletionSignal,
  validateEmbeddedAppMessage,
} from '.'

describe('AppManifestSchema', () => {
  it('accepts the example manifests', () => {
    for (const manifest of exampleAppManifests) {
      expect(() => AppManifestSchema.parse(manifest)).not.toThrow()
    }
  })

  it('rejects an invalid authType', () => {
    const invalidManifest = {
      ...exampleInternalChessManifest,
      authType: 'magic-ticket',
    }

    const result = validateAppManifest(invalidManifest)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('authType'))).toBe(true)
    }
  })

  it('rejects missing toolDefinitions', () => {
    const invalidManifest = { ...examplePublicWeatherManifest }
    delete (invalidManifest as { toolDefinitions?: unknown[] }).toolDefinitions

    const result = validateAppManifest(invalidManifest)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('toolDefinitions'))).toBe(true)
    }
  })
})

describe('EmbeddedAppMessageSchema', () => {
  it('accepts a bootstrap message with typed tool definitions', () => {
    const message = {
      version: 'v1',
      messageId: 'msg.bootstrap.1',
      conversationId: 'conversation.1',
      appSessionId: 'app-session.1',
      appId: exampleInternalChessManifest.appId,
      sequence: 1,
      sentAt: '2026-03-31T15:00:00.000Z',
      source: 'host',
      type: 'host.bootstrap',
      security: {
        handshakeToken: 'nonce-123',
        expectedOrigin: 'https://apps.chatbridge.dev',
      },
      payload: {
        launchReason: 'chat-tool',
        authState: 'connected',
        grantedPermissions: ['session:write', 'tool:invoke'],
        embedUrl: exampleInternalChessManifest.uiEmbedConfig.entryUrl,
        initialState: {
          boardState: 'startpos',
        },
        availableTools: exampleInternalChessManifest.toolDefinitions,
      },
    }

    expect(() => EmbeddedAppMessageSchema.parse(message)).not.toThrow()
  })

  it('rejects malformed runtime messages', () => {
    const result = validateEmbeddedAppMessage({
      version: 'v1',
      messageId: 'msg.bad.1',
      conversationId: 'conversation.1',
      appSessionId: 'app-session.1',
      appId: exampleInternalChessManifest.appId,
      sequence: 0,
      sentAt: '2026-03-31T15:00:00.000Z',
      source: 'app',
      type: 'app.state',
      security: {
        handshakeToken: 'nonce-123',
        expectedOrigin: 'https://chatbridge.dev',
      },
      payload: {
        status: 'active',
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('payload.summary'))).toBe(true)
    }
  })
})

describe('CompletionSignalSchema', () => {
  it('accepts a valid completion signal', () => {
    const signal = {
      version: 'v1',
      conversationId: 'conversation.1',
      appSessionId: 'app-session.1',
      appId: 'chess.internal',
      toolCallId: 'tool-call.1',
      status: 'succeeded',
      resultSummary: 'The student finished the game and requested a summary.',
      result: {
        winner: 'white',
      },
      startedAt: '2026-03-31T15:00:00.000Z',
      completedAt: '2026-03-31T15:05:00.000Z',
      followUpContext: {
        summary: 'White won by checkmate on move 22.',
        recommendedPrompts: ['Explain the checkmate pattern.'],
        stateDigest: {
          opening: 'Italian Game',
        },
      },
    }

    expect(() => CompletionSignalSchema.parse(signal)).not.toThrow()
  })

  it('rejects a completion signal whose timestamps are out of order', () => {
    const result = validateCompletionSignal({
      version: 'v1',
      conversationId: 'conversation.1',
      appSessionId: 'app-session.1',
      appId: 'chess.internal',
      status: 'failed',
      resultSummary: 'The app timed out.',
      startedAt: '2026-03-31T15:05:00.000Z',
      completedAt: '2026-03-31T15:00:00.000Z',
      followUpContext: {
        summary: 'Ask the user if they want to retry.',
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('completedAt'))).toBe(true)
    }
  })
})
