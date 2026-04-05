import type { RuntimeAppStatus } from '@shared/contracts/v1'
import { Chess } from 'chess.js'
import { applyRequestedChessMove } from '@/routes/embedded-apps/-components/chess/chessMove'

export type ChessMode = 'practice' | 'analysis'
export type ChessSessionUpdateSource = 'initialize' | 'launch' | 'tool-move' | 'manual-board-move'

export interface ChessSessionSnapshot {
  conversationId: string
  appSessionId: string
  fen: string
  turn: 'w' | 'b'
  moveCount: number
  lastMove: string
  status: RuntimeAppStatus
  summary: string
  updatedAt: string
  lastUpdateSource: ChessSessionUpdateSource
  mode?: ChessMode
}

type ChessSessionRecord = {
  snapshot: ChessSessionSnapshot
  historySan: string[]
}

type BuildChessSessionRecordInput = {
  conversationId: string
  appSessionId: string
  chess: Chess
  updateSource: ChessSessionUpdateSource
  status?: RuntimeAppStatus
  mode?: ChessMode
  historySan?: string[]
  moveCount?: number
  lastMove?: string
  updatedAt?: string
}

type ChessMoveSuccess = {
  ok: true
  snapshot: ChessSessionSnapshot
  appliedMoveSan: string
  historySan: string[]
}

type ChessMoveFailure = {
  ok: false
  code: 'chess.session-not-found' | 'chess.stale-board-state' | 'chess.illegal-move'
  message: string
}

export type ChessSessionMoveResult = ChessMoveSuccess | ChessMoveFailure

const chessSessions = new Map<string, ChessSessionRecord>()
const latestConversationSessions = new Map<string, string>()
const chessSessionListeners = new Map<string, Set<() => void>>()

function buildSessionKey(conversationId: string, appSessionId: string) {
  return `${conversationId}::${appSessionId}`
}

function formatTurn(turn: 'w' | 'b') {
  return turn === 'w' ? 'White' : 'Black'
}

function buildSummary(fen: string, turn: 'w' | 'b', lastMove: string) {
  return `Current board FEN: ${fen}. ${formatTurn(turn)} to move. Last move: ${lastMove}.`
}

function notifyChessSessionListeners(key: string) {
  chessSessionListeners.get(key)?.forEach((listener) => listener())
}

function setChessSessionRecord(record: ChessSessionRecord) {
  const key = buildSessionKey(record.snapshot.conversationId, record.snapshot.appSessionId)
  chessSessions.set(key, record)
  latestConversationSessions.set(record.snapshot.conversationId, record.snapshot.appSessionId)
  notifyChessSessionListeners(key)
  return record.snapshot
}

function buildChessSessionRecord(input: BuildChessSessionRecordInput): ChessSessionRecord {
  const historySan = input.historySan ?? input.chess.history()
  const lastMove = input.lastMove ?? historySan.at(-1) ?? 'No moves yet'
  const moveCount = input.moveCount ?? historySan.length
  const fen = input.chess.fen()
  const turn = input.chess.turn()

  return {
    historySan,
    snapshot: {
      conversationId: input.conversationId,
      appSessionId: input.appSessionId,
      fen,
      turn,
      moveCount,
      lastMove,
      status: input.status ?? (input.chess.isGameOver() ? 'completed' : 'active'),
      summary: buildSummary(fen, turn, lastMove),
      updatedAt: input.updatedAt ?? new Date().toISOString(),
      lastUpdateSource: input.updateSource,
      ...(input.mode ? { mode: input.mode } : {}),
    },
  }
}

export function subscribeChessSession(conversationId: string, appSessionId: string, listener: () => void) {
  const key = buildSessionKey(conversationId, appSessionId)
  const listeners = chessSessionListeners.get(key) ?? new Set<() => void>()
  listeners.add(listener)
  chessSessionListeners.set(key, listeners)

  return () => {
    const existing = chessSessionListeners.get(key)
    if (!existing) {
      return
    }

    existing.delete(listener)
    if (existing.size === 0) {
      chessSessionListeners.delete(key)
    }
  }
}

export function getChessSessionSnapshot(conversationId: string, appSessionId: string) {
  return chessSessions.get(buildSessionKey(conversationId, appSessionId))?.snapshot ?? null
}

export function getLatestChessSessionSnapshotForConversation(conversationId: string) {
  const appSessionId = latestConversationSessions.get(conversationId)
  if (!appSessionId) {
    return null
  }

  return getChessSessionSnapshot(conversationId, appSessionId)
}

export function getChessSessionHistory(conversationId: string, appSessionId: string) {
  return chessSessions.get(buildSessionKey(conversationId, appSessionId))?.historySan ?? []
}

export function initializeChessSession(input: {
  conversationId: string
  appSessionId: string
  fen?: string
  moveCount?: number
  lastMove?: string
  mode?: ChessMode
  status?: RuntimeAppStatus
}) {
  const existing = getChessSessionSnapshot(input.conversationId, input.appSessionId)
  if (existing) {
    return existing
  }

  const chess = input.fen ? new Chess(input.fen) : new Chess()
  return setChessSessionRecord(
    buildChessSessionRecord({
      conversationId: input.conversationId,
      appSessionId: input.appSessionId,
      chess,
      updateSource: 'initialize',
      moveCount: input.moveCount,
      lastMove: input.lastMove,
      mode: input.mode,
      status: input.status ?? 'waiting-user',
    })
  )
}

export function activateChessSession(input: {
  conversationId: string
  appSessionId: string
  mode?: ChessMode
  status?: RuntimeAppStatus
}) {
  const existing = chessSessions.get(buildSessionKey(input.conversationId, input.appSessionId))
  if (!existing) {
    return resetChessSession(input)
  }

  const nextMode = input.mode ?? existing.snapshot.mode

  return setChessSessionRecord({
    historySan: existing.historySan,
    snapshot: {
      ...existing.snapshot,
      status: input.status ?? 'active',
      summary: buildSummary(existing.snapshot.fen, existing.snapshot.turn, existing.snapshot.lastMove),
      updatedAt: new Date().toISOString(),
      lastUpdateSource: 'launch',
      ...(nextMode ? { mode: nextMode } : {}),
    },
  })
}

export function resetChessSession(input: {
  conversationId: string
  appSessionId: string
  mode?: ChessMode
  status?: RuntimeAppStatus
}) {
  return setChessSessionRecord(
    buildChessSessionRecord({
      conversationId: input.conversationId,
      appSessionId: input.appSessionId,
      chess: new Chess(),
      updateSource: 'launch',
      historySan: [],
      moveCount: 0,
      lastMove: 'No moves yet',
      mode: input.mode,
      status: input.status ?? 'active',
    })
  )
}

export function applyChessSessionMove(input: {
  conversationId: string
  appSessionId: string
  requestedMove: string
  expectedFen?: string
  source?: Extract<ChessSessionUpdateSource, 'tool-move' | 'manual-board-move'>
}): ChessSessionMoveResult {
  const key = buildSessionKey(input.conversationId, input.appSessionId)
  const existing = chessSessions.get(key)
  if (!existing) {
    return {
      ok: false,
      code: 'chess.session-not-found',
      message: 'The live chess session is not available yet.',
    }
  }

  if (input.expectedFen && input.expectedFen !== existing.snapshot.fen) {
    return {
      ok: false,
      code: 'chess.stale-board-state',
      message: 'The chess board changed before the requested move could be applied.',
    }
  }

  const chess = new Chess(existing.snapshot.fen)
  const move = applyRequestedChessMove(chess, input.requestedMove)
  if (!move) {
    return {
      ok: false,
      code: 'chess.illegal-move',
      message: `"${input.requestedMove}" is not a legal move from the current position.`,
    }
  }

  const canExtendKnownHistory = existing.historySan.length === existing.snapshot.moveCount
  const historySan = canExtendKnownHistory ? [...existing.historySan, move.san] : [...existing.historySan]

  const snapshot = setChessSessionRecord(
    buildChessSessionRecord({
      conversationId: existing.snapshot.conversationId,
      appSessionId: existing.snapshot.appSessionId,
      chess,
      updateSource: input.source ?? 'manual-board-move',
      historySan,
      moveCount: existing.snapshot.moveCount + 1,
      lastMove: move.san,
      mode: existing.snapshot.mode,
      status: chess.isGameOver() ? 'completed' : 'active',
    })
  )

  return {
    ok: true,
    snapshot,
    appliedMoveSan: move.san,
    historySan,
  }
}

export function resetChessSessions() {
  chessSessions.clear()
  latestConversationSessions.clear()
  chessSessionListeners.clear()
}
