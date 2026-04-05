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
    })
    expect(mockStartSpan.mock.calls[1]?.[0]).toMatchObject({
      name: exampleRuntimeTraceSpans[1]?.name,
      spanId: exampleRuntimeTraceSpans[1]?.spanId,
      parentSpanIds: {
        rootSpanId: exampleRuntimeTraceSpans[0]?.spanId,
        spanId: exampleRuntimeTraceSpans[0]?.spanId,
      },
    })
    expect(mockEnd).toHaveBeenCalledTimes(2)
    expect(mockFlush).toHaveBeenCalledTimes(1)
  })
})
