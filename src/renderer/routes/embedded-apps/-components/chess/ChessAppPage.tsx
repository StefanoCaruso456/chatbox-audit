import { Alert, Badge, Box, Group, Paper, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import type { CompletionSignal, RuntimeAppStatus } from '@shared/contracts/v1'
import { Chess, type Square } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { postSidebarDirectIframeStateMessage } from '@/components/apps/sidebarDirectIframeState'
import {
  applyChessSessionMove,
  getChessSessionSnapshot,
  initializeChessSession,
  resetChessSession,
  subscribeChessSession,
  type ChessMode,
} from '@/stores/chessSessionStore'
import { useEmbeddedAppBridge } from '../useEmbeddedAppBridge'

type SelectionState = {
  from: Square | null
}

const CHESS_SYMBOL_FONT_STACK = '"Noto Sans Symbols 2", "Segoe UI Symbol", "Apple Symbols", "Arial Unicode MS", serif'

function formatTurn(turn: 'w' | 'b') {
  return turn === 'w' ? 'White' : 'Black'
}

function formatSummary(chess: Chess) {
  const history = chess.history()
  const recentMoves = history.slice(-6).join(', ') || 'No moves yet'
  return `Current board FEN: ${chess.fen()}. ${formatTurn(chess.turn())} to move. Recent moves: ${recentMoves}.`
}

function buildSidebarRuntimeSnapshot(chess: Chess, mode?: 'practice' | 'analysis'): {
  status: RuntimeAppStatus
  summary: string
  state: {
    fen: string
    turn: 'w' | 'b'
    moveCount: number
    lastMove?: string
    mode?: 'practice' | 'analysis'
  }
} {
  const history = chess.history()

  return {
    status: chess.isGameOver() ? 'completed' : 'active',
    summary: formatSummary(chess),
    state: {
      fen: chess.fen(),
      turn: chess.turn(),
      moveCount: history.length,
      ...(history.at(-1) ? { lastMove: history.at(-1) } : {}),
      ...(mode ? { mode } : {}),
    },
  }
}

function buildCompletionSignal(input: {
  conversationId: string
  appSessionId: string
  toolCallId?: string
  chess: Chess
  historySan?: string[]
}): CompletionSignal {
  const history = input.historySan ?? input.chess.history()
  const ended = input.chess.isGameOver()
  const ending = input.chess.isCheckmate()
    ? 'checkmate'
    : input.chess.isStalemate()
      ? 'stalemate'
      : input.chess.isDraw()
        ? 'draw'
        : 'lesson snapshot'

  const winner = input.chess.isCheckmate() ? (input.chess.turn() === 'w' ? 'black' : 'white') : 'undecided'
  const resultSummary = ended
    ? `Chess session ended by ${ending} after ${history.length} moves.`
    : `Shared the current chess position after ${history.length} moves for chat follow-up.`

  return {
    version: 'v1',
    conversationId: input.conversationId,
    appSessionId: input.appSessionId,
    appId: 'chess.internal',
    toolCallId: input.toolCallId,
    status: 'succeeded',
    resultSummary,
    result: {
      fen: input.chess.fen(),
      moveCount: history.length,
      ending,
      winner,
      history,
    },
    completedAt: new Date().toISOString(),
    followUpContext: {
      summary: `Use the chess board state and move history to explain the next best idea from this position.`,
      userVisibleSummary: resultSummary,
      recommendedPrompts: ['What is the best move from this position?', 'What tactical idea should I look for here?'],
      stateDigest: {
        fen: input.chess.fen(),
        moveCount: history.length,
        ending,
      },
    },
  }
}

function buildMoveCompletionSignal(input: {
  conversationId: string
  appSessionId: string
  toolCallId: string
  requestedMove: string
  chess: Chess
  appliedMoveSan: string
  moveCount?: number
}) {
  const candidateMoves = input.chess.moves().slice(0, 6)
  const turn = input.chess.turn() === 'w' ? 'white' : 'black'
  const moveCount = input.moveCount ?? input.chess.history().length
  const explanation =
    input.appliedMoveSan === 'd4' || input.appliedMoveSan === 'e4'
      ? 'It claims central space and opens lines for your pieces.'
      : input.appliedMoveSan === 'Nf3' || input.appliedMoveSan === 'Nc3'
        ? 'It develops a knight toward the center while keeping options flexible.'
        : input.appliedMoveSan === 'O-O' || input.appliedMoveSan === 'O-O-O'
          ? 'It improves king safety and helps coordinate the rooks.'
          : 'It is a legal move that improves the position.'

  const resultSummary = `Move played: ${input.appliedMoveSan}. ${turn === 'white' ? 'White' : 'Black'} to move.`

  return {
    version: 'v1' as const,
    conversationId: input.conversationId,
    appSessionId: input.appSessionId,
    appId: 'chess.internal',
    toolCallId: input.toolCallId,
    status: 'succeeded' as const,
    resultSummary,
    result: {
      appSessionId: input.appSessionId,
      requestedMove: input.requestedMove,
      appliedMove: input.appliedMoveSan,
      fen: input.chess.fen(),
      turn,
      moveCount,
      lastMove: input.appliedMoveSan,
      legalMoveCount: input.chess.moves().length,
      candidateMoves,
      summary: resultSummary,
      explanation,
      moveExecutionAvailable: true,
    },
    completedAt: new Date().toISOString(),
    followUpContext: {
      summary: `Use the updated live chess board to recommend the best next move from this position.`,
      userVisibleSummary: resultSummary,
      recommendedPrompts: ['What should the other side play next?', 'Explain the best plan from this position.'],
      stateDigest: {
        fen: input.chess.fen(),
        turn,
        moveCount,
        lastMove: input.appliedMoveSan,
      },
    },
  } satisfies CompletionSignal
}

function asChessMode(value: unknown): ChessMode | undefined {
  return value === 'practice' || value === 'analysis' ? value : undefined
}

function useSharedChessSessionSnapshot(conversationId: string | null, appSessionId: string | null) {
  return useSyncExternalStore(
    useCallback(
      (listener) => {
        if (!conversationId || !appSessionId) {
          return () => {}
        }

        return subscribeChessSession(conversationId, appSessionId, listener)
      },
      [appSessionId, conversationId]
    ),
    useCallback(() => {
      if (!conversationId || !appSessionId) {
        return null
      }

      return getChessSessionSnapshot(conversationId, appSessionId)
    }, [appSessionId, conversationId]),
    () => null
  )
}

function isLightSquare(square: Square) {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  return (file + rank) % 2 === 0
}

function getSquareColor(square: Square) {
  return isLightSquare(square) ? '#dfe7f5' : '#7a8db4'
}

function getCoordinatePalette(isLightSquare: boolean) {
  return isLightSquare
    ? {
        text: '#f8fafc',
        background: 'rgba(15,23,42,0.92)',
        border: 'rgba(15,23,42,0.96)',
      }
    : {
        text: '#0f172a',
        background: 'rgba(248,250,252,0.92)',
        border: 'rgba(15,23,42,0.24)',
      }
}

function getPiecePalette(color: 'w' | 'b') {
  return color === 'w'
    ? {
        fill: '#fffdf8',
        shadow: '0 1px 1px rgba(15,23,42,0.92), 0 0 6px rgba(15,23,42,0.6)',
        stroke: '1.35px rgba(15, 23, 42, 0.92)',
      }
    : {
        fill: '#172033',
        shadow: '0 1px 0 rgba(248,250,252,0.28), 0 0 2px rgba(15,23,42,0.3)',
        stroke: '0.45px rgba(248, 250, 252, 0.18)',
      }
}

const boardSquares = (['8', '7', '6', '5', '4', '3', '2', '1'] as const).flatMap((rank) =>
  (['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const).map((file) => `${file}${rank}` as Square)
)

const pieceGlyphs: Record<string, string> = {
  wp: '♙',
  wr: '♖',
  wn: '♘',
  wb: '♗',
  wq: '♕',
  wk: '♔',
  bp: '♟',
  br: '♜',
  bn: '♞',
  bb: '♝',
  bq: '♛',
  bk: '♚',
}

export function ChessAppPage() {
  const { runtimeContext, invocationMessage, sendCompletion, sendError, sendState } =
    useEmbeddedAppBridge('chess.internal')
  const [fallbackChess, setFallbackChess] = useState(() => new Chess())
  const [selection, setSelection] = useState<SelectionState>({ from: null })
  const [feedback, setFeedback] = useState<string | null>(null)
  const handledToolCallIdsRef = useRef<Set<string>>(new Set())
  const sharedChessSnapshot = useSharedChessSessionSnapshot(
    runtimeContext?.conversationId ?? null,
    runtimeContext?.appSessionId ?? null
  )

  useEffect(() => {
    if (!runtimeContext) {
      return
    }

    initializeChessSession({
      conversationId: runtimeContext.conversationId,
      appSessionId: runtimeContext.appSessionId,
      fen: typeof runtimeContext.initialState?.fen === 'string' ? runtimeContext.initialState.fen : undefined,
      moveCount:
        typeof runtimeContext.initialState?.moveCount === 'number' ? runtimeContext.initialState.moveCount : undefined,
      lastMove:
        typeof runtimeContext.initialState?.lastMove === 'string' ? runtimeContext.initialState.lastMove : undefined,
      mode: asChessMode(runtimeContext.initialState?.mode),
      status: 'waiting-user',
    })
    setFeedback(null)
  }, [runtimeContext])

  const currentMode =
    invocationMessage?.payload.toolName === 'chess.launch-game' ? invocationMessage.payload.arguments.mode : undefined
  const chess = useMemo(
    () => new Chess(sharedChessSnapshot?.fen ?? fallbackChess.fen()),
    [fallbackChess, sharedChessSnapshot?.fen]
  )
  const activeSidebarSnapshot = useMemo(() => {
    if (sharedChessSnapshot) {
      return {
        status: sharedChessSnapshot.status,
        summary: sharedChessSnapshot.summary,
        state: {
          fen: sharedChessSnapshot.fen,
          turn: sharedChessSnapshot.turn,
          moveCount: sharedChessSnapshot.moveCount,
          ...(sharedChessSnapshot.lastMove !== 'No moves yet' ? { lastMove: sharedChessSnapshot.lastMove } : {}),
          ...(sharedChessSnapshot.mode ? { mode: sharedChessSnapshot.mode } : {}),
        },
      }
    }

    return buildSidebarRuntimeSnapshot(chess, asChessMode(currentMode))
  }, [chess, currentMode, sharedChessSnapshot])

  const publishSidebarSnapshot = useCallback(() => {
    postSidebarDirectIframeStateMessage({
      appId: 'chess.internal',
      status: activeSidebarSnapshot.status,
      summary: activeSidebarSnapshot.summary,
      state: activeSidebarSnapshot.state,
    })
  }, [activeSidebarSnapshot])

  useEffect(() => {
    if (!runtimeContext) {
      return
    }

    sendState({
      status: activeSidebarSnapshot.status,
      summary: activeSidebarSnapshot.summary,
      state: activeSidebarSnapshot.state,
      progress: {
        label: activeSidebarSnapshot.state.moveCount === 0 ? 'Opening position' : `Move ${activeSidebarSnapshot.state.moveCount}`,
        percent:
          activeSidebarSnapshot.state.moveCount === 0
            ? 0
            : Math.min(95, 5 + activeSidebarSnapshot.state.moveCount * 5),
      },
    })
  }, [activeSidebarSnapshot, runtimeContext, sendState])

  useEffect(() => {
    if (!invocationMessage || invocationMessage.payload.toolName !== 'chess.launch-game') {
      return
    }

    if (handledToolCallIdsRef.current.has(invocationMessage.payload.toolCallId)) {
      return
    }

    if (!runtimeContext) {
      return
    }

    handledToolCallIdsRef.current.add(invocationMessage.payload.toolCallId)
    resetChessSession({
      conversationId: runtimeContext.conversationId,
      appSessionId: runtimeContext.appSessionId,
      mode: asChessMode(invocationMessage.payload.arguments.mode),
      status: 'active',
    })
    setSelection({ from: null })
    setFeedback(null)
  }, [invocationMessage, runtimeContext])

  useEffect(() => {
    if (!invocationMessage || invocationMessage.payload.toolName !== 'chess.make-move') {
      return
    }

    const { toolCallId } = invocationMessage.payload

    if (handledToolCallIdsRef.current.has(toolCallId)) {
      return
    }

    const requestedMove =
      typeof invocationMessage.payload.arguments.move === 'string' ? invocationMessage.payload.arguments.move.trim() : ''
    const expectedFen =
      typeof invocationMessage.payload.arguments.expectedFen === 'string'
        ? invocationMessage.payload.arguments.expectedFen.trim()
        : ''

    if (!runtimeContext) {
      setFeedback('The chess runtime is not connected yet.')
      return
    }

    handledToolCallIdsRef.current.add(toolCallId)

    if (!requestedMove) {
      sendError({
        code: 'chess.invalid-move-request',
        message: 'A chess move request must include a move string.',
        recoverable: true,
        details: {
          toolCallId,
        },
      })
      return
    }

    if (expectedFen && expectedFen !== chess.fen()) {
      sendError({
        code: 'chess.stale-board-state',
        message: 'The chess board changed before the requested move could be applied.',
        recoverable: true,
        details: {
          toolCallId,
          expectedFen,
          currentFen: chess.fen(),
        },
      })
      return
    }

    const moveResult = applyChessSessionMove({
      conversationId: runtimeContext.conversationId,
      appSessionId: runtimeContext.appSessionId,
      requestedMove,
      expectedFen,
    })
    if (!moveResult.ok) {
      sendError({
        code: moveResult.code,
        message: moveResult.message,
        recoverable: true,
        details: {
          toolCallId,
          requestedMove,
        },
      })
      return
    }

    setSelection({ from: null })
    setFeedback(`Played ${moveResult.appliedMoveSan}. ${formatTurn(moveResult.snapshot.turn)} to move.`)
    const nextChess = new Chess(moveResult.snapshot.fen)
    sendCompletion(
      buildMoveCompletionSignal({
        conversationId: runtimeContext.conversationId,
        appSessionId: runtimeContext.appSessionId,
        toolCallId,
        requestedMove,
        chess: nextChess,
        appliedMoveSan: moveResult.appliedMoveSan,
        moveCount: moveResult.snapshot.moveCount,
      })
    )
  }, [invocationMessage, runtimeContext, sendCompletion, sendError])

  useEffect(() => {
    publishSidebarSnapshot()

    const replayTimers = [120, 480, 1500].map((delayMs) => window.setTimeout(publishSidebarSnapshot, delayMs))
    return () => {
      replayTimers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [publishSidebarSnapshot])

  const pieces = useMemo(() => {
    const board = chess.board()
    const map = new Map<Square, { label: string; glyph: string; color: 'w' | 'b' }>()

    board.forEach((rank, rankIndex) => {
      rank.forEach((piece, fileIndex) => {
        if (!piece) {
          return
        }

        const square = `${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}` as Square
        map.set(square, {
          label: `${piece.color === 'w' ? 'White' : 'Black'} ${piece.type.toUpperCase()}`,
          glyph: pieceGlyphs[`${piece.color}${piece.type}`] ?? piece.type.toUpperCase(),
          color: piece.color,
        })
      })
    })

    return map
  }, [chess])

  const selectableMoves = useMemo(() => {
    if (!selection.from) {
      return []
    }

    return chess
      .moves({ verbose: true })
      .filter((move) => move.from === selection.from)
      .map((move) => ({
        square: move.to.toUpperCase(),
        san: move.san,
      }))
  }, [chess, selection.from])

  const handleSquareClick = useCallback(
    (square: Square) => {
      const piece = chess.get(square)
      if (!selection.from) {
        if (!piece) {
          setFeedback('Select a piece first.')
          return
        }

        if (piece.color !== chess.turn()) {
          setFeedback(`It is ${formatTurn(chess.turn())}'s turn.`)
          return
        }

        setSelection({ from: square })
        setFeedback(`Selected ${square.toUpperCase()}. Choose a destination square.`)
        return
      }

      if (runtimeContext) {
        const moveResult = applyChessSessionMove({
          conversationId: runtimeContext.conversationId,
          appSessionId: runtimeContext.appSessionId,
          requestedMove: `${selection.from}${square}`,
          expectedFen: chess.fen(),
        })
        if (!moveResult.ok) {
          setFeedback(
            moveResult.code === 'chess.illegal-move'
              ? `That move from ${selection.from.toUpperCase()} to ${square.toUpperCase()} is not legal.`
              : moveResult.message
          )
          setSelection({ from: null })
          return
        }

        setSelection({ from: null })
        setFeedback(`Played ${moveResult.appliedMoveSan}. ${formatTurn(moveResult.snapshot.turn)} to move.`)

        const nextChess = new Chess(moveResult.snapshot.fen)
        if (nextChess.isGameOver()) {
          sendCompletion(
            buildCompletionSignal({
              conversationId: runtimeContext.conversationId,
              appSessionId: runtimeContext.appSessionId,
              toolCallId: invocationMessage?.payload.toolCallId,
              chess: nextChess,
              historySan: moveResult.historySan,
            })
          )
        }
        return
      }

      const nextChess = new Chess(chess.fen())
      const move = nextChess.move({ from: selection.from, to: square, promotion: 'q' })
      if (!move) {
        setFeedback(`That move from ${selection.from.toUpperCase()} to ${square.toUpperCase()} is not legal.`)
        setSelection({ from: null })
        return
      }

      setFallbackChess(nextChess)
      setSelection({ from: null })
      setFeedback(`Played ${move.san}. ${formatTurn(nextChess.turn())} to move.`)
    },
    [chess, invocationMessage?.payload.toolCallId, runtimeContext, selection.from, sendCompletion]
  )

  return (
    <Box
      p="sm"
      mih="100%"
      c="#e5eefb"
      style={{
        background: 'linear-gradient(180deg, #020617 0%, #0f172a 46%, #111827 100%)',
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      <Stack gap="sm">
        <Group justify="space-between">
          <div>
            <Title order={3} c="white">
              Chess Tutor
            </Title>
          </div>
          <Badge color={chess.isGameOver() ? 'teal' : 'blue'} variant="light">
            {chess.isGameOver() ? 'Game Over' : `${formatTurn(chess.turn())} to move`}
          </Badge>
        </Group>

        {feedback && (
          <Alert color="blue" variant="light">
            {feedback}
          </Alert>
        )}

        <Paper
          withBorder
          radius="xl"
          p="sm"
          shadow="sm"
          style={{
            background: 'linear-gradient(180deg, rgba(15,23,42,0.94) 0%, rgba(15,23,42,0.86) 100%)',
            borderColor: 'rgba(148, 163, 184, 0.22)',
          }}
        >
          <Box
            data-testid="chess-board-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
              gap: '4px',
              aspectRatio: '1 / 1',
              width: '100%',
            }}
          >
            {boardSquares.map((square) => {
              const isSelected = selection.from === square
              const piece = pieces.get(square)
              const lightSquare = isLightSquare(square)
              const coordinatePalette = getCoordinatePalette(lightSquare)
              const piecePalette = piece ? getPiecePalette(piece.color) : null

              return (
                <UnstyledButton
                  key={square}
                  type="button"
                  onClick={() => handleSquareClick(square)}
                  aria-label={
                    piece ? `${piece.label} on ${square.toUpperCase()}` : `Empty square ${square.toUpperCase()}`
                  }
                  data-testid={`chess-square-${square}`}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: '12px',
                    border: isSelected ? '2px solid rgba(96, 165, 250, 0.98)' : '1px solid rgba(15, 23, 42, 0.18)',
                    background: isSelected ? '#bfdbfe' : getSquareColor(square),
                    boxShadow: isSelected ? '0 0 0 2px rgba(59,130,246,0.18)' : 'none',
                    color: piecePalette?.fill ?? '#0f172a',
                    overflow: 'hidden',
                  }}
                >
                  <Text
                    data-testid={`chess-piece-${square}`}
                    component="span"
                    style={{
                      fontFamily: CHESS_SYMBOL_FONT_STACK,
                      fontSize: 'clamp(1.42rem, 3.15vw, 2.08rem)',
                      fontWeight: 700,
                      lineHeight: 1,
                      textShadow: piecePalette?.shadow,
                      WebkitTextStroke: piecePalette?.stroke,
                    }}
                  >
                    {piece?.glyph ?? ''}
                  </Text>
                  <Text
                    data-testid={`chess-coordinate-${square}`}
                    component="span"
                    size="11px"
                    fw={700}
                    style={{
                      position: 'absolute',
                      right: 6,
                      bottom: 5,
                      color: coordinatePalette.text,
                      background: coordinatePalette.background,
                      border: `1px solid ${coordinatePalette.border}`,
                      borderRadius: 999,
                      padding: '2px 6px',
                      lineHeight: 1.1,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {square.toUpperCase()}
                  </Text>
                </UnstyledButton>
              )
            })}
          </Box>
        </Paper>
        <Paper
          withBorder
          radius="xl"
          p="sm"
          style={{
            background: 'rgba(15, 23, 42, 0.64)',
            borderColor: 'rgba(148, 163, 184, 0.18)',
          }}
        >
          <Stack gap={6}>
            <Text size="sm" fw={600} c="white">
              Live board only
            </Text>
            <Text size="sm" c="rgba(226,232,240,0.72)">
              Ask the chat to analyze this position, recommend the next move, or explain what changed on the board.
            </Text>
            {selection.from ? (
              <Text size="xs" c="rgba(148,163,184,0.9)">
                Selected {selection.from.toUpperCase()}. Click a destination square to make a manual board move.
              </Text>
            ) : null}
            {selectableMoves.length > 0 ? (
              <Text size="xs" c="rgba(148,163,184,0.9)">
                Legal destinations: {selectableMoves.map((move) => move.square).join(', ')}
              </Text>
            ) : null}
          </Stack>
        </Paper>
      </Stack>
    </Box>
  )
}
