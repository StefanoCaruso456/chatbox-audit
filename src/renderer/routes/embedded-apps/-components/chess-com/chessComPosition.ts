import { Chess } from 'chess.js'

export type ImportedChessComPosition =
  | {
      ok: true
      chess: Chess
      source: 'fen' | 'pgn'
      historySan: string[]
    }
  | {
      ok: false
      error: string
    }

function tryLoadFen(value: string) {
  try {
    return new Chess(value)
  } catch {
    return null
  }
}

function tryLoadPgn(value: string) {
  try {
    const chess = new Chess()
    chess.loadPgn(value)
    return chess
  } catch {
    return null
  }
}

export function importChessComPosition(value: string): ImportedChessComPosition {
  const trimmed = value.trim()
  if (!trimmed) {
    return {
      ok: false,
      error: 'Paste a FEN or PGN before importing the mirrored board.',
    }
  }

  const fenChess = tryLoadFen(trimmed)
  if (fenChess) {
    return {
      ok: true,
      chess: fenChess,
      source: 'fen',
      historySan: fenChess.history(),
    }
  }

  const pgnChess = tryLoadPgn(trimmed)
  if (pgnChess) {
    return {
      ok: true,
      chess: pgnChess,
      source: 'pgn',
      historySan: pgnChess.history(),
    }
  }

  return {
    ok: false,
    error: 'That position was not a valid FEN or PGN.',
  }
}
