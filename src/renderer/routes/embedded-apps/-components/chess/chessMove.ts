import { Chess, type Square } from 'chess.js'

type ParsedCoordinateMove = {
  kind: 'coordinate'
  normalized: string
  from: Square
  to: Square
  promotion?: 'q' | 'r' | 'b' | 'n'
}

type ParsedSanMove = {
  kind: 'san'
  normalized: string
}

export type ParsedChessMove = ParsedCoordinateMove | ParsedSanMove

const COORDINATE_MOVE_PATTERN = /\b([a-h][1-8])\s*(?:to|-)\s*([a-h][1-8])(?:\s*=?\s*([qrbnQRBN]))?\b/u
const COMPACT_COORDINATE_MOVE_PATTERN = /\b([a-h][1-8])([a-h][1-8])([qrbnQRBN]?)\b/u
const SAN_MOVE_PATTERN =
  /\b(O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[KQRBN][a-h]?[1-8]?[+#]?|[a-h][1-8])\b/giu

export function extractRequestedChessMove(userRequest: string): string | null {
  const coordinateMatch = userRequest.match(COORDINATE_MOVE_PATTERN)
  if (coordinateMatch) {
    const [, from, to, promotion = ''] = coordinateMatch
    return `${from}${to}${promotion}`.toLowerCase()
  }

  const compactCoordinateMatch = userRequest.match(COMPACT_COORDINATE_MOVE_PATTERN)
  if (compactCoordinateMatch) {
    const [, from, to, promotion = ''] = compactCoordinateMatch
    return `${from}${to}${promotion}`.toLowerCase()
  }

  const sanMatches = [...userRequest.matchAll(SAN_MOVE_PATTERN)]
  const lastSanMatch = sanMatches.at(-1)?.[1]
  return lastSanMatch ? lastSanMatch.trim() : null
}

export function parseRequestedChessMove(move: string): ParsedChessMove | null {
  const trimmed = move.trim()
  if (!trimmed) {
    return null
  }

  const coordinateMatch = trimmed.match(/^([a-h][1-8])([a-h][1-8])([qrbnQRBN]?)$/u)
  if (coordinateMatch) {
    const [, from, to, promotion = ''] = coordinateMatch
    return {
      kind: 'coordinate',
      normalized: `${from}${to}${promotion}`.toLowerCase(),
      from: from.toLowerCase() as Square,
      to: to.toLowerCase() as Square,
      ...(promotion
        ? {
            promotion: promotion.toLowerCase() as 'q' | 'r' | 'b' | 'n',
          }
        : {}),
    }
  }

  return {
    kind: 'san',
    normalized: trimmed,
  }
}

export function applyRequestedChessMove(chess: Chess, requestedMove: string) {
  const parsedMove = parseRequestedChessMove(requestedMove)
  if (!parsedMove) {
    return null
  }

  if (parsedMove.kind === 'coordinate') {
    return chess.move({
      from: parsedMove.from,
      to: parsedMove.to,
      promotion: parsedMove.promotion ?? 'q',
    })
  }

  return chess.move(parsedMove.normalized)
}
