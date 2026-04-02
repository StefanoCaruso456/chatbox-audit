import {
  EmbeddedAppMessageSchema,
  exampleAppHeartbeatMessage,
  exampleHostBootstrapMessage,
  exampleHostInvokeMessage,
} from '@shared/contracts/v1/runtime-messages'
import { exampleChessLaunchToolSchema } from '@shared/contracts/v1/tool-schema'
import { describe, expect, it } from 'vitest'
import {
  computeHeartbeatTimeout,
  createHostBootstrapMessage,
  createHostInvokeMessage,
  isHeartbeatExpired,
  isRuntimeMessageOriginAllowed,
  normalizeRuntimeMessageOrigin,
  parseEmbeddedAppRuntimeMessage,
  validateEmbeddedAppRuntimeMessage,
  validateRuntimeMessageOrigin,
} from './embedded-app-runtime'

describe('embedded app runtime helpers', () => {
  it('normalizes safe origins and rejects invalid origins', () => {
    expect(normalizeRuntimeMessageOrigin(' https://apps.chatbridge.dev/ ')).toBe('https://apps.chatbridge.dev')
    expect(normalizeRuntimeMessageOrigin('https://apps.chatbridge.dev/chess')).toBeNull()
    expect(normalizeRuntimeMessageOrigin('javascript:alert(1)')).toBeNull()
  })

  it('validates origin pairs deterministically', () => {
    const match = validateRuntimeMessageOrigin('https://apps.chatbridge.dev', 'https://apps.chatbridge.dev/')

    expect(match.valid).toBe(true)
    expect(match.reason).toBe('match')
    expect(isRuntimeMessageOriginAllowed('https://apps.chatbridge.dev', 'https://apps.chatbridge.dev')).toBe(true)

    const mismatch = validateRuntimeMessageOrigin('https://apps.chatbridge.dev', 'https://other.example.com')
    expect(mismatch.valid).toBe(false)
    expect(mismatch.reason).toBe('mismatch')

    const missing = validateRuntimeMessageOrigin('https://apps.chatbridge.dev', null)
    expect(missing.valid).toBe(false)
    expect(missing.reason).toBe('missing-actual-origin')
  })

  it('parses and validates runtime messages through the shared schema', () => {
    const parsed = parseEmbeddedAppRuntimeMessage(exampleHostBootstrapMessage)
    expect(parsed.type).toBe('host.bootstrap')
    expect(EmbeddedAppMessageSchema.parse(exampleHostInvokeMessage).type).toBe('host.invoke')

    const validation = validateEmbeddedAppRuntimeMessage(exampleAppHeartbeatMessage)
    expect(validation.success).toBe(true)
  })

  it('creates a bootstrap message that matches the shared runtime contract', () => {
    const message = createHostBootstrapMessage({
      messageId: 'msg.runtime.bootstrap.1',
      conversationId: 'conversation.42',
      appSessionId: 'app-session.chess.42',
      appId: 'chess.internal',
      sequence: 1,
      sentAt: '2026-03-31T20:00:00.000Z',
      expectedOrigin: 'https://apps.chatbridge.dev',
      handshakeToken: 'nonce-bootstrap-42',
      launchReason: 'chat-tool',
      authState: 'connected',
      grantedPermissions: ['session:write', 'tool:invoke'],
      embedUrl: 'https://apps.chatbridge.dev/chess',
      initialState: {
        boardState: 'startpos',
      },
      availableTools: [exampleChessLaunchToolSchema],
    })

    expect(message.type).toBe('host.bootstrap')
    expect(message.security.expectedOrigin).toBe('https://apps.chatbridge.dev')
    expect(message.payload.availableTools).toHaveLength(1)
    expect(() => EmbeddedAppMessageSchema.parse(message)).not.toThrow()
  })

  it('rejects a bootstrap message when the embed origin does not match', () => {
    expect(() =>
      createHostBootstrapMessage({
        messageId: 'msg.runtime.bootstrap.2',
        conversationId: 'conversation.42',
        appSessionId: 'app-session.chess.42',
        appId: 'chess.internal',
        sequence: 1,
        sentAt: '2026-03-31T20:00:00.000Z',
        expectedOrigin: 'https://apps.chatbridge.dev',
        handshakeToken: 'nonce-bootstrap-42',
        launchReason: 'chat-tool',
        authState: 'connected',
        grantedPermissions: ['session:write', 'tool:invoke'],
        embedUrl: 'https://other.example.com/chess',
      })
    ).toThrow('embedUrl origin must match expectedOrigin')
  })

  it('creates a host invoke message that matches the shared runtime contract', () => {
    const message = createHostInvokeMessage({
      messageId: 'msg.runtime.invoke.1',
      conversationId: 'conversation.42',
      appSessionId: 'app-session.chess.42',
      appId: 'chess.internal',
      sequence: 2,
      sentAt: '2026-03-31T20:00:02.000Z',
      expectedOrigin: 'https://apps.chatbridge.dev',
      handshakeToken: 'nonce-invoke-42',
      toolCallId: 'tool-call.chess.42',
      toolName: 'chess.launch-game',
      arguments: {
        mode: 'practice',
      },
      timeoutMs: 30_000,
    })

    expect(message.type).toBe('host.invoke')
    expect(message.payload.timeoutMs).toBe(30_000)
    expect(() => EmbeddedAppMessageSchema.parse(message)).not.toThrow()
  })

  it('computes heartbeat deadlines from explicit expiry and fallback timeout windows', () => {
    const explicitExpiry = computeHeartbeatTimeout({
      sentAt: '2026-03-31T20:00:00.000Z',
      timeoutMs: 30_000,
      heartbeatExpiresAt: '2026-03-31T20:00:15.000Z',
      now: '2026-03-31T20:00:10.000Z',
    })

    expect(explicitExpiry.source).toBe('heartbeat.expiresAt')
    expect(explicitExpiry.expired).toBe(false)
    expect(explicitExpiry.remainingMs).toBe(5_000)

    const fallbackTimeout = computeHeartbeatTimeout({
      sentAt: '2026-03-31T20:00:00.000Z',
      timeoutMs: 30_000,
      now: '2026-03-31T20:00:31.000Z',
    })

    expect(fallbackTimeout.source).toBe('sentAt+timeoutMs')
    expect(fallbackTimeout.expired).toBe(true)
    expect(fallbackTimeout.remainingMs).toBe(0)
    expect(
      isHeartbeatExpired({
        sentAt: '2026-03-31T20:00:00.000Z',
        timeoutMs: 30_000,
        now: '2026-03-31T20:00:31.000Z',
      })
    ).toBe(true)
  })
})
