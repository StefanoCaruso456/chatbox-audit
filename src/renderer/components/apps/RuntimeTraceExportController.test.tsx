/**
 * @vitest-environment jsdom
 */

import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildRuntimeTraceId,
  getPendingRuntimeTraceSpans,
  recordRuntimeTraceSpan,
  resetRuntimeTraceStore,
} from '@/stores/runtimeTraceStore'
import RuntimeTraceExportController from './RuntimeTraceExportController'

const { mockBootstrapRuntimeTelemetry, mockExportRuntimeTraceSpans } = vi.hoisted(() => ({
  mockBootstrapRuntimeTelemetry: vi.fn(async () => ({
    projectName: 'ChatBridge Runtime',
  })),
  mockExportRuntimeTraceSpans: vi.fn(async ({ spans }: { spans: Array<{ spanId: string }> }) => ({
    exportedSpanIds: spans.map((span) => span.spanId),
    projectName: 'ChatBridge Runtime',
  })),
}))

vi.mock('@/packages/tutormeai-telemetry/client', () => ({
  bootstrapTutorMeAIRuntimeTelemetry: (...args: unknown[]) => mockBootstrapRuntimeTelemetry(...args),
  exportTutorMeAIRuntimeTraceSpans: (...args: unknown[]) => mockExportRuntimeTraceSpans(...args),
}))

describe('RuntimeTraceExportController', () => {
  beforeEach(() => {
    resetRuntimeTraceStore()
    mockBootstrapRuntimeTelemetry.mockClear()
    mockExportRuntimeTraceSpans.mockClear()
  })

  it('bootstraps Braintrust and exports pending spans once', async () => {
    render(<RuntimeTraceExportController />)

    const traceId = buildRuntimeTraceId({
      conversationId: 'session.test',
      appSessionId: 'app-session.chess.1',
      runtimeAppId: 'chess.internal',
    })

    recordRuntimeTraceSpan({
      traceId,
      name: 'publish chess runtime opened event',
      kind: 'runtime-open',
      status: 'succeeded',
      conversationId: 'session.test',
      sessionId: 'session.test',
      appSessionId: 'app-session.chess.1',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      actor: {
        layer: 'host',
        source: 'app-iframe-panel',
      },
    })

    await waitFor(
      () => {
        expect(mockBootstrapRuntimeTelemetry).toHaveBeenCalledTimes(1)
        expect(mockExportRuntimeTraceSpans).toHaveBeenCalledTimes(1)
      },
      { timeout: 2_500 }
    )

    expect(mockExportRuntimeTraceSpans.mock.calls[0]?.[0]).toMatchObject({
      spans: expect.arrayContaining([
        expect.objectContaining({ kind: 'trace-root' }),
        expect.objectContaining({ kind: 'runtime-open' }),
      ]),
    })
    expect(getPendingRuntimeTraceSpans().filter((span) => span.traceId === traceId)).toHaveLength(0)
  })
})
