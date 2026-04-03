import { Alert, Badge, Box, Button, Group, Paper, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import type { CompletionSignal } from '@shared/contracts/v1'
import { Chess, type Square } from 'chess.js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEmbeddedAppBridge } from '../useEmbeddedAppBridge'

type SelectionState = {
  from: Square | null
}

function formatTurn(turn: 'w' | 'b') {
  return turn === 'w' ? 'White' : 'Black'
}

function formatSummary(chess: Chess) {
  const history = chess.history()
  const recentMoves = history.slice(-6).join(', ') || 'No moves yet'
  return `Current board FEN: ${chess.fen()}. ${formatTurn(chess.turn())} to move. Recent moves: ${recentMoves}.`
}

function buildCompletionSignal(input: {
  conversationId: string
  appSessionId: string
  toolCallId?: string
  chess: Chess
}): CompletionSignal {
  const history = input.chess.history()
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

function getSquareColor(square: Square) {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  return (file + rank) % 2 === 0 ? '#f1f5f9' : '#cbd5e1'
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
  const [chess, setChess] = useState(() => new Chess())
  const [selection, setSelection] = useState<SelectionState>({ from: null })
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!runtimeContext) {
      return
    }

    const bootstrapChess = new Chess()
    setFeedback(null)
    sendState({
      status: 'waiting-user',
      summary: formatSummary(bootstrapChess),
      state: {
        fen: bootstrapChess.fen(),
        turn: bootstrapChess.turn(),
        moveCount: bootstrapChess.history().length,
      },
      progress: {
        label: 'Opening position',
        percent: 0,
      },
    })
  }, [runtimeContext, sendState])

  useEffect(() => {
    if (!invocationMessage || invocationMessage.payload.toolName !== 'chess.launch-game') {
      return
    }

    const nextChess = new Chess()
    setChess(nextChess)
    setSelection({ from: null })
    setFeedback(
      invocationMessage.payload.arguments.mode === 'analysis'
        ? 'Analysis board ready. Click a piece and then a destination square.'
        : 'Practice board ready. Click a piece and then a destination square.'
    )

    sendState({
      status: 'active',
      summary: formatSummary(nextChess),
      state: {
        fen: nextChess.fen(),
        turn: nextChess.turn(),
        moveCount: nextChess.history().length,
        mode: invocationMessage.payload.arguments.mode,
      },
      progress: {
        label: 'Move 1',
        percent: 5,
      },
    })
  }, [invocationMessage, sendState])

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

      const nextChess = new Chess(chess.fen())
      const move = nextChess.move({ from: selection.from, to: square, promotion: 'q' })
      if (!move) {
        setFeedback(`That move from ${selection.from.toUpperCase()} to ${square.toUpperCase()} is not legal.`)
        setSelection({ from: null })
        return
      }

      setChess(nextChess)
      setSelection({ from: null })
      setFeedback(`Played ${move.san}. ${formatTurn(nextChess.turn())} to move.`)

      sendState({
        status: nextChess.isGameOver() ? 'completed' : 'active',
        summary: formatSummary(nextChess),
        state: {
          fen: nextChess.fen(),
          turn: nextChess.turn(),
          moveCount: nextChess.history().length,
          lastMove: move.san,
        },
        progress: {
          label: `Move ${Math.max(1, nextChess.history().length)}`,
          percent: Math.min(95, 5 + nextChess.history().length * 5),
        },
      })

      if (nextChess.isGameOver() && runtimeContext) {
        sendCompletion(
          buildCompletionSignal({
            conversationId: runtimeContext.conversationId,
            appSessionId: runtimeContext.appSessionId,
            toolCallId: invocationMessage?.payload.toolCallId,
            chess: nextChess,
          })
        )
      }
    },
    [chess, invocationMessage?.payload.toolCallId, runtimeContext, selection.from, sendCompletion, sendState]
  )

  const handleShareBoard = useCallback(() => {
    if (!runtimeContext) {
      sendError({
        code: 'app.runtime-missing',
        message: 'The chess runtime context is not available yet.',
        recoverable: true,
      })
      return
    }

    sendCompletion(
      buildCompletionSignal({
        conversationId: runtimeContext.conversationId,
        appSessionId: runtimeContext.appSessionId,
        toolCallId: invocationMessage?.payload.toolCallId,
        chess,
      })
    )
  }, [chess, invocationMessage?.payload.toolCallId, runtimeContext, sendCompletion, sendError])

  return (
    <Box
      p="md"
      mih="100vh"
      c="#e5eefb"
      style={{
        background: 'linear-gradient(180deg, #020617 0%, #0f172a 46%, #111827 100%)',
        overflowX: 'hidden',
      }}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <div>
            <Title order={3} c="white">
              Chess Tutor
            </Title>
            <Text c="rgba(226,232,240,0.78)" size="sm">
              Practice or analyze a live chess board without leaving the chat.
            </Text>
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
              const isLightSquare = getSquareColor(square) === '#f1f5f9'

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
                    border: isSelected ? '2px solid rgba(96, 165, 250, 0.98)' : '1px solid rgba(15, 23, 42, 0.08)',
                    background: isSelected ? '#bfdbfe' : isLightSquare ? '#f8fafc' : '#94a3b8',
                    boxShadow: isSelected ? '0 0 0 2px rgba(59,130,246,0.18)' : 'none',
                    color: piece?.color === 'w' ? '#f8fafc' : '#0f172a',
                    overflow: 'hidden',
                  }}
                >
                  <Text
                    component="span"
                    style={{
                      fontSize: 'clamp(1.15rem, 3vw, 1.9rem)',
                      lineHeight: 1,
                      textShadow: piece?.color === 'w' ? '0 1px 1px rgba(15,23,42,0.55)' : 'none',
                    }}
                  >
                    {piece?.glyph ?? ''}
                  </Text>
                  <Text
                    component="span"
                    size="10px"
                    fw={700}
                    style={{
                      position: 'absolute',
                      right: 6,
                      bottom: 4,
                      color: isLightSquare ? 'rgba(15,23,42,0.52)' : 'rgba(248,250,252,0.8)',
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
          p="md"
          style={{
            background: 'rgba(15, 23, 42, 0.64)',
            borderColor: 'rgba(148, 163, 184, 0.18)',
          }}
        >
          <Stack gap="xs">
            <Text fw={600} c="white">
              Board state for the chat
            </Text>
            <Text size="sm" c="rgba(226,232,240,0.82)">
              {formatSummary(chess)}
            </Text>
            <Group>
              <Button onClick={handleShareBoard}>Send board summary to chat</Button>
              <Button
                variant="default"
                color="gray"
                onClick={() => {
                  const nextChess = new Chess()
                  setChess(nextChess)
                  setSelection({ from: null })
                  setFeedback('Board reset to the starting position.')
                  sendState({
                    status: 'active',
                    summary: formatSummary(nextChess),
                    state: {
                      fen: nextChess.fen(),
                      turn: nextChess.turn(),
                      moveCount: 0,
                    },
                    progress: {
                      label: 'Move 1',
                      percent: 5,
                    },
                  })
                }}
              >
                Reset board
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  )
}
