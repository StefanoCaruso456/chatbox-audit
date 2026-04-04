import { Alert, Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core'
import type { CompletionSignal, RuntimeAppStatus } from '@shared/contracts/v1'
import { Chess, type Square } from 'chess.js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { postSidebarDirectIframeStateMessage } from '@/components/apps/sidebarDirectIframeState'
import { useEmbeddedAppBridge } from '../useEmbeddedAppBridge'

type SelectionState = {
  from: Square | null
}

type CandidateMove = {
  san: string
  label: string
  reason: string
}

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

function formatMaterialAdvantage(balance: number) {
  if (balance === 0) {
    return 'Material is even.'
  }

  const side = balance > 0 ? 'White' : 'Black'
  const swing = Math.abs(balance)
  return `${side} is ahead by ${swing} point${swing === 1 ? '' : 's'}.`
}

function inferGamePhase(chess: Chess) {
  const historyLength = chess.history().length
  const pieces = chess.board().flat().filter(Boolean).length

  if (pieces <= 12) {
    return 'Endgame'
  }

  if (historyLength < 12) {
    return 'Opening'
  }

  return 'Middlegame'
}

function buildCandidateMoves(chess: Chess): CandidateMove[] {
  const legalMoves = chess.moves({ verbose: true })

  return legalMoves
    .map((move) => {
      let score = 0
      let reason = 'Solid developing move.'

      if (move.san.includes('#')) {
        score += 100
        reason = 'Checkmate threat or finish.'
      } else if (move.san.includes('+')) {
        score += 24
        reason = 'Checks the king immediately.'
      } else if (move.flags.includes('k') || move.flags.includes('q')) {
        score += 16
        reason = 'Improves king safety by castling.'
      } else if (move.flags.includes('c')) {
        score += 14
        reason = 'Wins material or changes the balance.'
      } else if (move.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(move.to)) {
        score += 10
        reason = 'Claims central space.'
      } else if ((move.piece === 'n' || move.piece === 'b') && ['c3', 'f3', 'c6', 'f6'].includes(move.to)) {
        score += 8
        reason = 'Develops a minor piece to an active square.'
      }

      return {
        san: move.san,
        label: move.san,
        reason,
        score,
      }
    })
    .sort((left, right) => right.score - left.score || left.san.localeCompare(right.san))
    .slice(0, 6)
    .map(({ label, reason, san }) => ({ san, label, reason }))
}

function getBoardAnalysis(chess: Chess) {
  const history = chess.history()
  const legalMoves = chess.moves({ verbose: true })
  const pieceValues: Record<string, number> = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0,
  }

  const materialBalance = chess
    .board()
    .flat()
    .filter(Boolean)
    .reduce((total, piece) => total + (piece!.color === 'w' ? 1 : -1) * pieceValues[piece!.type], 0)

  return {
    phase: inferGamePhase(chess),
    status: chess.isCheckmate()
      ? 'Checkmate'
      : chess.isStalemate()
        ? 'Stalemate'
        : chess.isDraw()
          ? 'Draw'
          : chess.inCheck()
            ? `${formatTurn(chess.turn())} is in check`
            : 'Position is stable',
    recentMoves: history.slice(-6).join(', ') || 'No moves yet',
    legalMoveCount: legalMoves.length,
    lastMove: history.at(-1) ?? 'No moves yet',
    material: formatMaterialAdvantage(materialBalance),
    candidateMoves: buildCandidateMoves(chess),
  }
}

function parseTypedMove(input: string, chess: Chess) {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  try {
    const compact = trimmed.replace(/\s+/g, '').toLowerCase()
    const uciMatch = compact.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/)
    if (uciMatch) {
      return chess.move({
        from: uciMatch[1] as Square,
        to: uciMatch[2] as Square,
        promotion: (uciMatch[3] ?? 'q') as 'q' | 'r' | 'b' | 'n',
      })
    }

    return chess.move(trimmed)
  } catch {
    return null
  }
}

function recreateChessFromHistory(history: string[]) {
  const nextChess = new Chess()

  for (const move of history) {
    nextChess.move(move)
  }

  return nextChess
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
  return (file + rank) % 2 === 0 ? '#d9e2f1' : '#8091b3'
}

function getCoordinatePalette(isLightSquare: boolean) {
  return isLightSquare
    ? {
        text: '#0f172a',
        background: 'rgba(255,255,255,0.88)',
        border: 'rgba(15,23,42,0.14)',
      }
    : {
        text: '#f8fafc',
        background: 'rgba(15,23,42,0.44)',
        border: 'rgba(248,250,252,0.16)',
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
  const [chess, setChess] = useState(() => new Chess())
  const [selection, setSelection] = useState<SelectionState>({ from: null })
  const [feedback, setFeedback] = useState<string | null>(null)
  const [moveInput, setMoveInput] = useState('')

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

  const currentMode =
    invocationMessage?.payload.toolName === 'chess.launch-game' ? invocationMessage.payload.arguments.mode : undefined

  useEffect(() => {
    if (!invocationMessage || invocationMessage.payload.toolName !== 'chess.launch-game') {
      return
    }

    const nextChess = new Chess()
    setChess(nextChess)
    setSelection({ from: null })
    setFeedback(null)

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

  useEffect(() => {
    const snapshot = buildSidebarRuntimeSnapshot(chess, currentMode)
    postSidebarDirectIframeStateMessage({
      appId: 'chess.internal',
      status: snapshot.status,
      summary: snapshot.summary,
      state: snapshot.state,
    })
  }, [chess, currentMode])

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

  const analysis = useMemo(() => getBoardAnalysis(chess), [chess])
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

  const commitMoveState = useCallback(
    (nextChess: Chess, message: string, lastMove?: string) => {
      setChess(nextChess)
      setSelection({ from: null })
      setMoveInput('')
      setFeedback(message)

      sendState({
        status: nextChess.isGameOver() ? 'completed' : 'active',
        summary: formatSummary(nextChess),
        state: {
          fen: nextChess.fen(),
          turn: nextChess.turn(),
          moveCount: nextChess.history().length,
          lastMove,
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
    [invocationMessage?.payload.toolCallId, runtimeContext, sendCompletion, sendState]
  )

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

      commitMoveState(nextChess, `Played ${move.san}. ${formatTurn(nextChess.turn())} to move.`, move.san)
    },
    [chess, commitMoveState, selection.from]
  )

  const handleNotationMove = useCallback(() => {
    const nextChess = new Chess(chess.fen())
    const move = parseTypedMove(moveInput, nextChess)

    if (!move) {
      setFeedback('That move notation is not legal for the current position. Try e2e4 or Nf3.')
      return
    }

    commitMoveState(nextChess, `Played ${move.san}. ${formatTurn(nextChess.turn())} to move.`, move.san)
  }, [chess, commitMoveState, moveInput])

  const handleUndoMove = useCallback(() => {
    const history = chess.history()
    if (history.length === 0) {
      setFeedback('There are no moves to undo yet.')
      return
    }

    const nextChess = recreateChessFromHistory(history.slice(0, -1))
    commitMoveState(nextChess, 'Undid the last move. Review the new position.', nextChess.history().at(-1))
  }, [chess, commitMoveState])

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
              const isLightSquare = getSquareColor(square) === '#d9e2f1'
              const coordinatePalette = getCoordinatePalette(isLightSquare)

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
                    border: isSelected ? '2px solid rgba(59, 130, 246, 0.98)' : '1px solid rgba(15, 23, 42, 0.12)',
                    background: isSelected ? '#93c5fd' : getSquareColor(square),
                    boxShadow: isSelected ? '0 0 0 2px rgba(59,130,246,0.18)' : 'none',
                    color: piece?.color === 'w' ? '#ffffff' : '#111827',
                    overflow: 'hidden',
                  }}
                >
                  <Text
                    component="span"
                    style={{
                      fontSize: 'clamp(1.15rem, 3vw, 1.9rem)',
                      lineHeight: 1,
                      textShadow:
                        piece?.color === 'w'
                          ? '0 1px 0 rgba(15,23,42,0.9), 0 0 8px rgba(15,23,42,0.2)'
                          : '0 1px 0 rgba(248,250,252,0.25)',
                      WebkitTextStroke:
                        piece?.color === 'w' ? '0.6px rgba(15,23,42,0.7)' : '0.4px rgba(255,255,255,0.22)',
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
                      color: coordinatePalette.text,
                      background: coordinatePalette.background,
                      border: `1px solid ${coordinatePalette.border}`,
                      borderRadius: 999,
                      padding: '1px 5px',
                      lineHeight: 1.1,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {square.toUpperCase()}
                  </Text>
                </UnstyledButton>
              )
            })}
          </Box>
        </Paper>

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm">
          <Paper
            withBorder
            radius="xl"
            p="sm"
            style={{
              background: 'rgba(15, 23, 42, 0.68)',
              borderColor: 'rgba(148, 163, 184, 0.18)',
            }}
          >
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text fw={700} c="white">
                  Board analysis
                </Text>
                <Badge variant="light" color="blue">
                  {analysis.phase}
                </Badge>
              </Group>
              <Text size="sm" c="rgba(226,232,240,0.82)">
                {analysis.status}
              </Text>
              <Text size="sm" c="rgba(226,232,240,0.72)">
                {analysis.material}
              </Text>
              <Text size="sm" c="rgba(226,232,240,0.72)">
                Last move: {analysis.lastMove}
              </Text>
              <Text size="sm" c="rgba(226,232,240,0.72)">
                Legal moves: {analysis.legalMoveCount}
              </Text>
              <Text size="sm" c="rgba(226,232,240,0.72)">
                Recent moves: {analysis.recentMoves}
              </Text>
              <Stack gap={6}>
                <Text size="xs" tt="uppercase" fw={700} c="rgba(148,163,184,0.9)">
                  Candidate moves
                </Text>
                <Group gap="xs">
                  {analysis.candidateMoves.map((move) => (
                    <Button
                      key={move.san}
                      size="xs"
                      variant="light"
                      onClick={() => {
                        setMoveInput(move.san)
                        const nextChess = new Chess(chess.fen())
                        const appliedMove = parseTypedMove(move.san, nextChess)
                        if (!appliedMove) {
                          setFeedback(`Could not apply ${move.san} from the current position.`)
                          return
                        }
                        commitMoveState(
                          nextChess,
                          `Applied ${appliedMove.san}. ${move.reason}`,
                          appliedMove.san
                        )
                      }}
                    >
                      {move.label}
                    </Button>
                  ))}
                </Group>
              </Stack>
            </Stack>
          </Paper>

          <Paper
            withBorder
            radius="xl"
            p="sm"
            style={{
              background: 'rgba(15, 23, 42, 0.68)',
              borderColor: 'rgba(148, 163, 184, 0.18)',
            }}
          >
            <Stack gap="sm">
              <Text fw={700} c="white">
                Move tools
              </Text>
              <Text size="sm" c="rgba(226,232,240,0.76)">
                Use algebraic notation like <strong>e4</strong> or coordinate notation like <strong>e2e4</strong>.
              </Text>
              <TextInput
                label="Move notation"
                placeholder="e2e4 or Nf3"
                value={moveInput}
                onChange={(event) => setMoveInput(event.currentTarget.value)}
                styles={{
                  input: {
                    background: 'rgba(15,23,42,0.85)',
                    color: 'white',
                    borderColor: 'rgba(148, 163, 184, 0.22)',
                  },
                  label: {
                    color: 'rgba(226,232,240,0.88)',
                  },
                }}
              />
              <Group>
                <Button onClick={handleNotationMove}>Apply move</Button>
                <Button variant="default" onClick={handleUndoMove}>
                  Undo move
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    const nextChess = new Chess()
                    commitMoveState(nextChess, 'Board reset to the starting position.')
                  }}
                >
                  Reset board
                </Button>
              </Group>
              {selection.from ? (
                <Stack gap={6}>
                  <Text size="xs" tt="uppercase" fw={700} c="rgba(148,163,184,0.9)">
                    Selected piece moves from {selection.from.toUpperCase()}
                  </Text>
                  <Group gap="xs">
                    {selectableMoves.map((move) => (
                      <Button
                        key={`${selection.from}-${move.san}`}
                        size="xs"
                        variant="light"
                        onClick={() => {
                          const nextChess = new Chess(chess.fen())
                          const appliedMove = nextChess.move({
                            from: selection.from!,
                            to: move.square.toLowerCase() as Square,
                            promotion: 'q',
                          })
                          if (!appliedMove) {
                            setFeedback(`Could not apply ${move.san} from ${selection.from.toUpperCase()}.`)
                            return
                          }
                          commitMoveState(
                            nextChess,
                            `Played ${appliedMove.san}. ${formatTurn(nextChess.turn())} to move.`,
                            appliedMove.san
                          )
                        }}
                      >
                        {move.square}
                      </Button>
                    ))}
                  </Group>
                </Stack>
              ) : null}
            </Stack>
          </Paper>
        </SimpleGrid>

        <Paper
          withBorder
          radius="xl"
          p="sm"
          style={{
            background: 'rgba(15, 23, 42, 0.64)',
            borderColor: 'rgba(148, 163, 184, 0.18)',
          }}
        >
          <Group justify="space-between" align="center" wrap="wrap">
            <Text size="xs" tt="uppercase" fw={700} c="rgba(148,163,184,0.9)">
              Quick actions
            </Text>
            <Group gap="xs">
              <Button onClick={handleShareBoard}>Send board summary to chat</Button>
              <Button variant="default" color="gray" onClick={() => navigator.clipboard?.writeText(chess.fen())}>
                Copy FEN
              </Button>
            </Group>
          </Group>
        </Paper>
      </Stack>
    </Box>
  )
}
