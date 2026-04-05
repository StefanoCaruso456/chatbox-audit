import { exampleRuntimeTraceSpans } from '@shared/contracts/v1'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockEnd, mockFlush, mockLoggerId, mockStartSpan, mockInitLogger } = vi.hoisted(() => {
  const mockEnd = vi.fn()
  const mockFlush = vi.fn(async () => undefined)
  const mockLoggerId = Promise.resolve('braintrust-logger-id')
  const mockStartSpan = vi.fn(() => ({
    end: mockEnd,
  }))
  const mockInitLogger = vi.fn(() => ({
    id: mockLoggerId,
    startSpan: mockStartSpan,
    flush: mockFlush,
  }))

  return {
    mockEnd,
    mockFlush,
    mockLoggerId,
    mockStartSpan,
    mockInitLogger,
  }
})

vi.mock('braintrust', () => ({
  initLogger: (...args: unknown[]) => mockInitLogger(...args),
}))

import {
  DEFAULT_BRAINTRUST_APP_URL,
  DEFAULT_BRAINTRUST_PROJECT_NAME,
  ensureBraintrustRuntimeProject,
  exportRuntimeTraceSpansToBraintrust,
  resolveBraintrustRuntimeTelemetryConfig,
} from './braintrust'

describe('braintrust runtime telemetry', () => {
  beforeEach(() => {
    mockEnd.mockReset()
    mockFlush.mockReset()
    mockStartSpan.mockReset()
    mockStartSpan.mockImplementation(() => ({
      end: mockEnd,
    }))
    mockInitLogger.mockClear()
  })

  it('returns null when the Braintrust API key is missing', () => {
    expect(resolveBraintrustRuntimeTelemetryConfig({})).toBeNull()
  })

  it('resolves the default Braintrust runtime configuration from env', () => {
    expect(
      resolveBraintrustRuntimeTelemetryConfig({
        BRAINTRUST_API_KEY: 'test-api-key',
      })
    ).toEqual({
      apiKey: 'test-api-key',
      appUrl: DEFAULT_BRAINTRUST_APP_URL,
      projectName: DEFAULT_BRAINTRUST_PROJECT_NAME,
    })
  })

  it('bootstraps the Braintrust project through initLogger', async () => {
    const result = await ensureBraintrustRuntimeProject({
      env: {
        BRAINTRUST_API_KEY: 'test-api-key',
      },
    })

    expect(result).toEqual({
      projectName: DEFAULT_BRAINTRUST_PROJECT_NAME,
    })
    expect(mockInitLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-api-key',
        appUrl: DEFAULT_BRAINTRUST_APP_URL,
        projectName: DEFAULT_BRAINTRUST_PROJECT_NAME,
      })
    )
  })

  it('exports runtime trace spans into Braintrust spans and flushes them', async () => {
    const result = await exportRuntimeTraceSpansToBraintrust({
      spans: exampleRuntimeTraceSpans.slice(0, 2),
      env: {
        BRAINTRUST_API_KEY: 'test-api-key',
        BRAINTRUST_PROJECT_NAME: 'Chess Runtime Debug',
      },
    })

    expect(result).toEqual({
      exportedSpanIds: exampleRuntimeTraceSpans.slice(0, 2).map((span) => span.spanId),
      projectName: 'Chess Runtime Debug',
    })
    expect(mockStartSpan).toHaveBeenCalledTimes(2)
    expect(mockStartSpan.mock.calls[0]?.[0]).toMatchObject({
      name: exampleRuntimeTraceSpans[0]?.name,
      spanId: exampleRuntimeTraceSpans[0]?.spanId,
      event: expect.objectContaining({
        input: 'Initialize chess tutor runtime trace',
        output: 'Runtime trace opened for chess tutor sidebar session.',
        tags: ['trace-root', 'host', 'chess-tutor', 'chess.internal'],
      }),
    })
    expect(mockStartSpan.mock.calls[1]?.[0]).toMatchObject({
      name: exampleRuntimeTraceSpans[1]?.name,
      spanId: exampleRuntimeTraceSpans[1]?.spanId,
      parentSpanIds: {
        rootSpanId: exampleRuntimeTraceSpans[0]?.spanId,
        spanId: exampleRuntimeTraceSpans[0]?.spanId,
      },
      event: expect.objectContaining({
        input: 'Sync latest chess runtime snapshot from app.state',
        output: 'Played c6. White to move.',
        tags: ['runtime-snapshot', 'host', 'chess-tutor', 'chess.internal'],
      }),
    })
    expect(mockEnd).toHaveBeenCalledTimes(2)
    expect(mockFlush).toHaveBeenCalledTimes(1)
  })

  it('synthesizes row-friendly fields for spans that only carry metadata and state', async () => {
    const rootSpan = exampleRuntimeTraceSpans[0]
    const snapshotSpan = exampleRuntimeTraceSpans[1]
    if (!rootSpan || !snapshotSpan) {
      throw new Error('Missing runtime trace fixtures for Braintrust tests.')
    }

    await exportRuntimeTraceSpansToBraintrust({
      spans: [
        {
          ...rootSpan,
          input: undefined,
          output: undefined,
          tags: undefined,
        },
        {
          ...snapshotSpan,
          input: undefined,
          output: undefined,
          tags: undefined,
          expected: undefined,
        },
      ],
      env: {
        BRAINTRUST_API_KEY: 'test-api-key',
      },
    })

    expect(mockStartSpan.mock.calls[0]?.[0]).toMatchObject({
      event: expect.objectContaining({
        input: 'Initialize runtime trace for chess-tutor',
        output: 'Runtime trace opened.',
        tags: ['trace-root', 'host', 'chess-tutor', 'chess.internal'],
      }),
    })
    expect(mockStartSpan.mock.calls[1]?.[0]).toMatchObject({
      event: expect.objectContaining({
        input: 'Sync runtime snapshot for chess-tutor',
        output: 'Played c6. White to move.',
        tags: ['runtime-snapshot', 'host', 'chess-tutor', 'chess.internal'],
      }),
    })
  })

  it('exports model usage, retry, and tool metrics into queryable Braintrust fields', async () => {
    const modelSpan = exampleRuntimeTraceSpans.find((span) => span.kind === 'model-call')
    if (!modelSpan) {
      throw new Error('Missing model-call fixture for Braintrust tests.')
    }

    await exportRuntimeTraceSpansToBraintrust({
      spans: [exampleRuntimeTraceSpans[0]!, modelSpan],
      env: {
        BRAINTRUST_API_KEY: 'test-api-key',
      },
    })

    expect(mockStartSpan.mock.calls[1]?.[0]).toMatchObject({
      event: expect.objectContaining({
        metadata: expect.objectContaining({
          modelProvider: 'openai',
          modelId: 'gpt-5.1',
          finishReason: 'stop',
          retryCount: 1,
          stepCount: 2,
          toolCallCount: 1,
          toolResultCount: 1,
          toolErrorCount: 0,
        }),
        metrics: expect.objectContaining({
          latencyMs: 1240,
          firstTokenLatencyMs: 380,
          tokenCountInput: 812,
          tokenCountOutput: 164,
          totalTokens: 976,
          reasoningTokens: 62,
          cachedInputTokens: 320,
          textOutputTokens: 102,
          retryCount: 1,
          stepCount: 2,
          toolCallCount: 1,
          toolResultCount: 1,
          toolErrorCount: 0,
        }),
      }),
    })
  })
})
