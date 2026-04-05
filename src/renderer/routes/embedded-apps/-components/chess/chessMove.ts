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

const COORDINATE_MOVE_PATTERN = /\b(?:from\s+)?([a-h][1-8])\s*(?:to|-)\s*([a-h][1-8])(?:\s*=?\s*([qrbnQRBN]))?\b/iu
const COMPACT_COORDINATE_MOVE_PATTERN = /\b([a-h][1-8])([a-h][1-8])([qrbnQRBN]?)\b/iu
const SAN_MOVE_PATTERN =
  /\b(O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[KQRBN][a-h]?[1-8]?[+#]?|[a-h][1-8])\b/giu

function normalizeComparableSanMove(move: string) {
  return move.replace(/0/g, 'O').replace(/\s+/g, '').toLowerCase()
}

function normalizeRequestedSanMove(move: string) {
  const trimmed = move.trim().replace(/0/g, 'O')
  if (!trimmed) {
    return trimmed
  }

  if (/^o-o(?:-o)?[+#]?$/iu.test(trimmed)) {
    return trimmed.toUpperCase()
  }

  const normalized =
    /^[kqrbn]/iu.test(trimmed) ? `${trimmed[0].toUpperCase()}${trimmed.slice(1).toLowerCase()}` : trimmed.toLowerCase()

  return normalized.replace(/=([qrbn])/giu, (_match, piece: string) => `=${piece.toUpperCase()}`)
}

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
  return lastSanMatch ? normalizeRequestedSanMove(lastSanMatch) : null
}

export function parseRequestedChessMove(move: string): ParsedChessMove | null {
  const trimmed = move.trim()
  if (!trimmed) {
    return null
  }

  const coordinateMatch = trimmed.toLowerCase().match(/^([a-h][1-8])([a-h][1-8])([qrbn]?)$/u)
  if (coordinateMatch) {
    const [, from, to, promotion = ''] = coordinateMatch
    return {
      kind: 'coordinate',
      normalized: `${from}${to}${promotion}`,
      from: from as Square,
      to: to as Square,
      ...(promotion
        ? {
            promotion: promotion as 'q' | 'r' | 'b' | 'n',
          }
        : {}),
    }
  }

  return {
    kind: 'san',
    normalized: normalizeRequestedSanMove(trimmed),
  }
}

export function applyRequestedChessMove(chess: Chess, requestedMove: string) {
  const parsedMove = parseRequestedChessMove(requestedMove)
  if (!parsedMove) {
    return null
  }

  if (parsedMove.kind === 'coordinate') {
    try {
      return chess.move({
        from: parsedMove.from,
        to: parsedMove.to,
        promotion: parsedMove.promotion ?? 'q',
      })
    } catch {
      return null
    }
  }

  let directMove = null
  try {
    directMove = chess.move(parsedMove.normalized)
  } catch {
    directMove = null
  }
  if (directMove) {
    return directMove
  }

  const comparableRequestedMove = normalizeComparableSanMove(parsedMove.normalized)
  const matchingSanMove = chess.moves().find((move) => normalizeComparableSanMove(move) === comparableRequestedMove)
  if (!matchingSanMove) {
    return null
  }

  try {
    return chess.move(matchingSanMove)
  } catch {
    return null
  }
}
