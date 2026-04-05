import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildRuntimeTraceId,
  getPendingRuntimeTraceSpans,
  getRuntimeTraceTree,
  getRuntimeTraceSpans,
  markRuntimeTraceSpansExported,
  recordRuntimeTraceSpan,
  resetRuntimeTraceStore,
} from './runtimeTraceStore'

describe('runtimeTraceStore', () => {
  beforeEach(() => {
    resetRuntimeTraceStore()
  })

  it('auto-creates a root span and returns a parseable trace tree', () => {
    const traceId = buildRuntimeTraceId({
      conversationId: 'session.test',
      appSessionId: 'app-session.chess.1',
      runtimeAppId: 'chess.internal',
    })

    const span = recordRuntimeTraceSpan({
      traceId,
      name: 'sync chess runtime snapshot',
      kind: 'runtime-snapshot',
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
      state: {
        source: 'runtime.message.app.state',
        fen: 'rnbqkbnr/pp1ppppp/2p5/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
        moveCount: 2,
        lastMove: 'c6',
      },
    })

    const spans = getRuntimeTraceSpans().filter((item) => item.traceId === traceId)
    expect(spans).toHaveLength(2)
    expect(spans.some((item) => item.kind === 'trace-root')).toBe(true)
    expect(spans.some((item) => item.spanId === span.spanId)).toBe(true)

    const tree = getRuntimeTraceTree(traceId)
    expect(tree).not.toBeNull()
    expect(tree?.rootSpanId).toBe(spans.find((item) => item.kind === 'trace-root')?.spanId)
    expect(tree?.spans).toHaveLength(2)
  })

  it('tracks pending spans until they are marked as exported', () => {
    const traceId = buildRuntimeTraceId({
      conversationId: 'session.test',
      appSessionId: 'app-session.chess.2',
      runtimeAppId: 'chess.internal',
    })

    const span = recordRuntimeTraceSpan({
      traceId,
      name: 'publish chess runtime opened event',
      kind: 'runtime-open',
      status: 'succeeded',
      conversationId: 'session.test',
      sessionId: 'session.test',
      appSessionId: 'app-session.chess.2',
      approvedAppId: 'chess-tutor',
      runtimeAppId: 'chess.internal',
      actor: {
        layer: 'host',
        source: 'app-iframe-panel',
      },
    })

    const pendingBeforeExport = getPendingRuntimeTraceSpans().filter((item) => item.traceId === traceId)
    expect(pendingBeforeExport.map((item) => item.kind)).toEqual(['trace-root', 'runtime-open'])

    markRuntimeTraceSpansExported([span.spanId, pendingBeforeExport[0]!.spanId])

    const pendingAfterExport = getPendingRuntimeTraceSpans().filter((item) => item.traceId === traceId)
    expect(pendingAfterExport).toHaveLength(0)
  })
})
