import { exampleInternalChessManifest } from '@shared/contracts/v1'
import { createMessage } from '@shared/types'
import { beforeEach, describe, expect, it } from 'vitest'
import { recordAssistantModelTrace } from './runtimeTraceGeneration'
import { buildRuntimeTraceId, getRuntimeTraceSpans, resetRuntimeTraceStore } from './runtimeTraceStore'
import { resetSidebarAppRuntimeSnapshots, upsertSidebarAppRuntimeSnapshot } from './sidebarAppRuntimeStore'

describe('runtimeTraceGeneration', () => {
  beforeEach(() => {
    resetRuntimeTraceStore()
    resetSidebarAppRuntimeSnapshots()
  })

  it('records model, retry, and tool spans inside the active app trace tree', () => {
    const previousUser = createMessage('user', 'why did black play c6')
    const appMessage = createMessage('assistant', '')
    appMessage.contentParts.push({
      type: 'embedded-app',
      appId: exampleInternalChessManifest.appId,
      appName: 'Chess Tutor',
      appSessionId: 'app-session.chess.1',
      sourceUrl: 'https://chatbox-audit.vercel.app/embedded-apps/chess',
      status: 'ready',
      bridge: {
        expectedOrigin: 'https://chatbox-audit.vercel.app',
        conversationId: 'session.1',
        appSessionId: 'app-session.chess.1',
      },
    })

    upsertSidebarAppRuntimeSnapshot({
      hostSessionId: 'session.1',
      approvedAppId: 'chess-tutor',
      runtimeAppId: exampleInternalChessManifest.appId,
      appSessionId: 'app-session.chess.1',
      conversationId: 'session.1',
      expectedOrigin: 'https://chatbox-audit.vercel.app',
      sourceUrl: 'https://chatbox-audit.vercel.app/embedded-apps/chess',
      authState: 'not-required',
      availableToolNames: ['chess.get-board-state', 'chess.make-move'],
      status: 'active',
      summary: 'Black played c6. White to move.',
      updatedAt: '2026-04-05T08:00:00.000Z',
    })

    recordAssistantModelTrace({
      conversationId: 'session.1',
      sessionId: 'session.1',
      previousMessages: [previousUser, appMessage],
      userRequest: 'why did black play c6',
      provider: 'openai',
      modelId: 'gpt-5.1',
      messageId: 'msg.assistant.1',
      promptMessageCount: 6,
      webBrowsingEnabled: false,
      startedAt: '2026-04-05T08:00:00.000Z',
      endedAt: '2026-04-05T08:00:01.240Z',
      firstTokenLatencyMs: 320,
      retryEvents: [
        {
          attempt: 2,
          maxAttempts: 5,
          error: 'upstream 502',
          recordedAt: '2026-04-05T08:00:00.420Z',
        },
      ],
      contentParts: [
        { type: 'tool-call', state: 'call', toolCallId: 'tool-1', toolName: 'query_knowledge_base', args: { q: 'c6' } },
        {
          type: 'tool-call',
          state: 'result',
          toolCallId: 'tool-1',
          toolName: 'query_knowledge_base',
          args: { q: 'c6' },
          result: { hits: 2 },
        },
        { type: 'text', text: 'Black played c6 to reinforce d5 and prepare ...' },
      ],
      usage: {
        inputTokens: 812,
        inputTokenDetails: {
          noCacheTokens: 492,
          cacheReadTokens: 320,
          cacheWriteTokens: 24,
        },
        outputTokens: 164,
        outputTokenDetails: {
          textTokens: 102,
          reasoningTokens: 62,
        },
        totalTokens: 976,
        reasoningTokens: 62,
        cachedInputTokens: 320,
        raw: {
          cost_usd: 0.0031,
        },
      },
      finishReason: 'stop',
      trace: {
        stepCount: 2,
        providerMetadata: {
          openai: {
            response_id: 'resp_123',
          },
        },
        steps: [
          {
            stepNumber: 1,
            finishReason: 'tool-calls',
            toolCallCount: 1,
            toolResultCount: 0,
            warningCount: 0,
            responseId: 'resp_step_1',
            responseModelId: 'gpt-5.1',
          },
          {
            stepNumber: 2,
            finishReason: 'stop',
            toolCallCount: 0,
            toolResultCount: 1,
            warningCount: 0,
            responseId: 'resp_step_2',
            responseModelId: 'gpt-5.1',
          },
        ],
      },
    })

    const traceId = buildRuntimeTraceId({
      conversationId: 'session.1',
      appSessionId: 'app-session.chess.1',
      runtimeAppId: exampleInternalChessManifest.appId,
    })
    const spans = getRuntimeTraceSpans().filter((span) => span.traceId === traceId)
    const modelSpan = spans.find((span) => span.kind === 'model-call')
    const retrySpan = spans.find((span) => span.kind === 'model-retry')
    const toolSpans = spans.filter((span) => span.kind === 'tool-call')

    expect(spans.map((span) => span.kind)).toEqual([
      'trace-root',
      'model-call',
      'model-retry',
      'tool-call',
      'tool-call',
    ])
    expect(modelSpan).toMatchObject({
      approvedAppId: 'chess-tutor',
      runtimeAppId: exampleInternalChessManifest.appId,
      model: {
        provider: 'openai',
        modelId: 'gpt-5.1',
        tokenCountInput: 812,
        tokenCountOutput: 164,
        totalTokens: 976,
        reasoningTokens: 62,
        cachedInputTokens: 320,
        cacheWriteTokens: 24,
        textOutputTokens: 102,
        costUsd: 0.0031,
        firstTokenLatencyMs: 320,
      },
      metadata: expect.objectContaining({
        retryCount: 1,
        stepCount: 2,
        toolCallCount: 1,
        toolEventCount: 2,
        toolResultCount: 1,
        toolErrorCount: 0,
      }),
    })
    expect(retrySpan?.parentSpanId).toBe(modelSpan?.spanId)
    expect(toolSpans.every((span) => span.parentSpanId === modelSpan?.spanId)).toBe(true)
  })

  it('falls back to the host trace when no embedded app session is active', () => {
    const previousUser = createMessage('user', 'summarize this')

    recordAssistantModelTrace({
      conversationId: 'session.host',
      sessionId: 'session.host',
      previousMessages: [previousUser],
      userRequest: 'summarize this',
      provider: 'openai',
      modelId: 'gpt-5-mini',
      promptMessageCount: 2,
      webBrowsingEnabled: true,
      startedAt: '2026-04-05T09:00:00.000Z',
      endedAt: '2026-04-05T09:00:00.600Z',
      contentParts: [{ type: 'text', text: 'Here is the summary.' }],
      finishReason: 'stop',
    })

    const traceId = buildRuntimeTraceId({
      conversationId: 'session.host',
    })
    const spans = getRuntimeTraceSpans().filter((span) => span.traceId === traceId)
    expect(spans.some((span) => span.kind === 'model-call')).toBe(true)
    expect(spans.find((span) => span.kind === 'model-call')).toMatchObject({
      appSessionId: undefined,
      approvedAppId: undefined,
      runtimeAppId: undefined,
    })
  })
})
