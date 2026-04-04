import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { applyRequestedChessMove, extractRequestedChessMove } from './chessMove'

describe('chessMove helpers', () => {
  it('normalizes uppercase pawn SAN extracted from chat requests', () => {
    expect(extractRequestedChessMove('okay make that next move of the D4')).toBe('d4')
  })

  it('accepts uppercase SAN when applying a requested chess move', () => {
    const chess = new Chess()
    const move = applyRequestedChessMove(chess, 'D4')

    expect(move?.san).toBe('d4')
    expect(chess.fen()).toBe('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1')
  })
})
