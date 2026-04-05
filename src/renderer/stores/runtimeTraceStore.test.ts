import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildRuntimeTraceId,
  getRuntimeTraceTree,
  getRuntimeTraceSpans,
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
})
