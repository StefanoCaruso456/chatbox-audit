import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { applyRequestedChessMove, extractRequestedChessMove } from './chessMove'

describe('chessMove helpers', () => {
  it('normalizes uppercase pawn SAN extracted from chat requests', () => {
    expect(extractRequestedChessMove('okay make that next move of the D4')).toBe('d4')
  })

  it('extracts uppercase natural-language coordinate moves', () => {
    expect(extractRequestedChessMove('can you move the black piece from D4 to E5')).toBe('d4e5')
    expect(extractRequestedChessMove('move B8-C6')).toBe('b8c6')
  })

  it('accepts uppercase SAN when applying a requested chess move', () => {
    const chess = new Chess()
    const move = applyRequestedChessMove(chess, 'D4')

    expect(move?.san).toBe('d4')
    expect(chess.fen()).toBe('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1')
  })
})
