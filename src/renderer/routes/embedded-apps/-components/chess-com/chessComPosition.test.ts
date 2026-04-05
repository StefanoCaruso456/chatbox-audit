import { describe, expect, it } from 'vitest'
import { importChessComPosition } from './chessComPosition'

describe('importChessComPosition', () => {
  it('loads a fen snapshot into the mirrored board', () => {
    const result = importChessComPosition('rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1')

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.source).toBe('fen')
    expect(result.chess.fen()).toContain('b KQkq')
    expect(result.historySan).toEqual([])
  })

  it('loads a pgn game into the mirrored board', () => {
    const result = importChessComPosition('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6')

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.source).toBe('pgn')
    expect(result.historySan).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'])
    expect(result.chess.turn()).toBe('w')
  })

  it('rejects invalid input', () => {
    expect(importChessComPosition('not a chess position')).toEqual({
      ok: false,
      error: 'That position was not a valid FEN or PGN.',
    })
  })
})
