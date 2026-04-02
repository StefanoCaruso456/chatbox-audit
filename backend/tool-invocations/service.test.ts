import { exampleInternalChessManifest } from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { InMemoryToolInvocationRepository } from './repository'
import { ToolInvocationLoggingService } from './service'

function createService() {
  return new ToolInvocationLoggingService(new InMemoryToolInvocationRepository(), {
    now: () => '2026-04-01T12:00:00.000Z',
  })
}

describe('ToolInvocationLoggingService', () => {
  it('queues tool invocations with the required audit fields', async () => {
    const service = createService()

    const result = await service.queueInvocation({
      toolCallId: 'tool-call.chess.1',
      conversationId: 'conversation.1',
      userId: 'user.1',
      appId: exampleInternalChessManifest.appId,
      toolName: 'chess.launch-game',
      invocationMode: 'embedded-bridge',
      authRequirement: 'platform-session',
      requestPayloadJson: {
        mode: 'practice',
      },
      appSessionId: 'app-session.chess.1',
      requestMessageId: 'message.1',
      correlationId: 'corr.1',
      metadata: {
        source: 'chat-router',
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.status).toBe('queued')
      expect(result.value.toolName).toBe('chess.launch-game')
      expect(result.value.requestPayloadJson).toEqual({ mode: 'practice' })
      expect(result.value.metadata.transitionLog).toEqual([
        {
          status: 'queued',
          at: '2026-04-01T12:00:00.000Z',
        },
      ])
    }
  })

  it('supports the full queued-to-running-to-succeeded lifecycle', async () => {
    const service = createService()

    await service.queueInvocation({
      toolCallId: 'tool-call.chess.2',
      conversationId: 'conversation.1',
      userId: 'user.1',
      appId: exampleInternalChessManifest.appId,
      toolName: 'chess.launch-game',
      invocationMode: 'embedded-bridge',
      authRequirement: 'platform-session',
      requestPayloadJson: {
        mode: 'analysis',
      },
    })

    const started = await service.startInvocation({
      toolCallId: 'tool-call.chess.2',
    })

    expect(started.ok).toBe(true)
    if (started.ok) {
      expect(started.value.status).toBe('running')
      expect(started.value.startedAt).toBe('2026-04-01T12:00:00.000Z')
    }

    const completed = await service.completeInvocation({
      toolCallId: 'tool-call.chess.2',
      responsePayloadJson: {
        appSessionId: 'app-session.chess.2',
        boardState: 'checkmate',
      },
      resultSummary: 'The game ended in checkmate.',
      completedAt: '2026-04-01T12:00:05.000Z',
    })

    expect(completed.ok).toBe(true)
    if (completed.ok) {
      expect(completed.value.status).toBe('succeeded')
      expect(completed.value.latencyMs).toBe(5000)
      expect(completed.value.responsePayloadJson).toEqual({
        appSessionId: 'app-session.chess.2',
        boardState: 'checkmate',
      })
    }
  })

  it('supports fail, cancel, and timeout transitions', async () => {
    const service = createService()

    await service.queueInvocation({
      toolCallId: 'tool-call.weather.1',
      conversationId: 'conversation.2',
      userId: 'user.2',
      appId: 'weather.public',
      toolName: 'weather.lookup',
      invocationMode: 'platform-proxy',
      authRequirement: 'none',
      requestPayloadJson: {
        location: 'Chicago, IL',
      },
    })

    const failed = await service.failInvocation({
      toolCallId: 'tool-call.weather.1',
      errorPayloadJson: {
        code: 'upstream-unavailable',
        message: 'Weather API returned 503.',
      },
    })

    expect(failed.ok).toBe(true)
    if (failed.ok) {
      expect(failed.value.status).toBe('failed')
      expect(failed.value.resultSummary).toBe('Tool invocation failed.')
    }

    await service.queueInvocation({
      toolCallId: 'tool-call.weather.2',
      conversationId: 'conversation.2',
      userId: 'user.2',
      appId: 'weather.public',
      toolName: 'weather.lookup',
      invocationMode: 'platform-proxy',
      authRequirement: 'none',
      requestPayloadJson: {
        location: 'Chicago, IL',
      },
    })

    const cancelled = await service.cancelInvocation({
      toolCallId: 'tool-call.weather.2',
      resultSummary: 'The user cancelled the forecast lookup.',
    })

    expect(cancelled.ok).toBe(true)
    if (cancelled.ok) {
      expect(cancelled.value.status).toBe('cancelled')
    }

    await service.queueInvocation({
      toolCallId: 'tool-call.weather.3',
      conversationId: 'conversation.2',
      userId: 'user.2',
      appId: 'weather.public',
      toolName: 'weather.lookup',
      invocationMode: 'platform-proxy',
      authRequirement: 'none',
      requestPayloadJson: {
        location: 'Chicago, IL',
      },
    })

    const timedOut = await service.timeoutInvocation({
      toolCallId: 'tool-call.weather.3',
    })

    expect(timedOut.ok).toBe(true)
    if (timedOut.ok) {
      expect(timedOut.value.status).toBe('timed-out')
      expect(timedOut.value.resultSummary).toBe('Tool invocation timed out.')
    }
  })

  it('queries by conversation, session, status, and app/tool', async () => {
    const service = createService()

    await service.queueInvocation({
      toolCallId: 'tool-call.chess.3',
      conversationId: 'conversation.1',
      appSessionId: 'app-session.chess.1',
      userId: 'user.1',
      appId: exampleInternalChessManifest.appId,
      toolName: 'chess.launch-game',
      invocationMode: 'embedded-bridge',
      authRequirement: 'platform-session',
      requestPayloadJson: { mode: 'practice' },
    })
    await service.queueInvocation({
      toolCallId: 'tool-call.weather.4',
      conversationId: 'conversation.2',
      appSessionId: 'app-session.weather.1',
      userId: 'user.2',
      appId: 'weather.public',
      toolName: 'weather.lookup',
      invocationMode: 'platform-proxy',
      authRequirement: 'none',
      requestPayloadJson: { location: 'Chicago, IL' },
    })

    const byConversation = await service.listByConversation('conversation.1')
    expect(byConversation.map((record) => record.toolCallId)).toEqual(['tool-call.chess.3'])

    const bySession = await service.listBySession('app-session.weather.1')
    expect(bySession.map((record) => record.toolCallId)).toEqual(['tool-call.weather.4'])

    const byStatus = await service.listByStatus('queued')
    expect(byStatus).toHaveLength(2)

    const byAppTool = await service.listByAppTool('weather.public', 'weather.lookup')
    expect(byAppTool.map((record) => record.toolCallId)).toEqual(['tool-call.weather.4'])
  })

  it('rejects duplicate tool call ids', async () => {
    const service = createService()

    await service.queueInvocation({
      toolCallId: 'tool-call.chess.4',
      conversationId: 'conversation.3',
      userId: 'user.3',
      appId: exampleInternalChessManifest.appId,
      toolName: 'chess.launch-game',
      invocationMode: 'embedded-bridge',
      authRequirement: 'platform-session',
      requestPayloadJson: { mode: 'practice' },
    })

    const duplicate = await service.queueInvocation({
      toolCallId: 'tool-call.chess.4',
      conversationId: 'conversation.3',
      userId: 'user.3',
      appId: exampleInternalChessManifest.appId,
      toolName: 'chess.launch-game',
      invocationMode: 'embedded-bridge',
      authRequirement: 'platform-session',
      requestPayloadJson: { mode: 'analysis' },
    })

    expect(duplicate).toEqual({
      ok: false,
      domain: 'tool-invocation',
      code: 'duplicate-tool-call',
      message: 'Tool call "tool-call.chess.4" already exists.',
      details: undefined,
      retryable: false,
    })
  })

  it('rejects invalid transitions after completion', async () => {
    const service = createService()

    await service.queueInvocation({
      toolCallId: 'tool-call.chess.5',
      conversationId: 'conversation.4',
      userId: 'user.4',
      appId: exampleInternalChessManifest.appId,
      toolName: 'chess.launch-game',
      invocationMode: 'embedded-bridge',
      authRequirement: 'platform-session',
      requestPayloadJson: { mode: 'practice' },
    })

    await service.completeInvocation({
      toolCallId: 'tool-call.chess.5',
      responsePayloadJson: { boardState: 'startpos' },
      resultSummary: 'The game launched successfully.',
    })

    const retryStart = await service.startInvocation({
      toolCallId: 'tool-call.chess.5',
    })

    expect(retryStart).toEqual({
      ok: false,
      domain: 'tool-invocation',
      code: 'invalid-transition',
      message: 'Tool call "tool-call.chess.5" cannot transition from "succeeded" to "running".',
      details: undefined,
      retryable: false,
    })
  })
})
