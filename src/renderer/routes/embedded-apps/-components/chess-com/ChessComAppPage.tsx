import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import type { CompletionSignal } from '@shared/contracts/v1'
import {
  exampleChessGetBoardStateToolSchema,
  exampleChessLaunchToolSchema,
  exampleChessMakeMoveToolSchema,
} from '@shared/contracts/v1'
import { Chess, type Square } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { getApprovedAppById } from '@/data/approvedApps'
import {
  getLaunchUrlValidationMessage,
  getPreviewReferrerPolicy,
  normalizeLaunchUrl,
} from '@/lib/approvedAppLaunchConfig'
import { getApprovedAppLaunchOverride, persistApprovedAppLaunchOverride } from '@/lib/approvedAppLaunchOverrides'
import {
  activateChessSession,
  applyChessSessionMove,
  type ChessMode,
  getChessSessionSnapshot,
  initializeChessSession,
  loadChessSessionPosition,
  resetChessSession,
  subscribeChessSession,
} from '@/stores/chessSessionStore'
import { useEmbeddedAppBridge } from '../useEmbeddedAppBridge'
import { importChessComPosition } from './chessComPosition'

type SelectionState = {
  from: Square | null
}

const CHESS_COM_APP_ID = 'chess-com'
const CHESS_COM_RUNTIME_APP_ID = 'chess.com.workspace'
const DEFAULT_EMBED_URL = 'https://www.chess.com/emboard?id=10477955&_height=640'
const CHESS_SYMBOL_FONT_STACK = '"Noto Sans Symbols 2", "Segoe UI Symbol", "Apple Symbols", "Arial Unicode MS", serif'

const boardSquares = (['8', '7', '6', '5', '4', '3', '2', '1'] as const).flatMap((rank) =>
  (['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const).map((file) => `${file}${rank}` as Square)
)

const pieceGlyphs: Record<'w' | 'b', Record<string, string>> = {
  w: {
    p: '♙',
    r: '♖',
    n: '♘',
    b: '♗',
    q: '♕',
    k: '♔',
  },
  b: {
    p: '♟',
    r: '♜',
    n: '♞',
    b: '♝',
    q: '♛',
    k: '♚',
  },
}

function formatTurn(turn: 'w' | 'b') {
  return turn === 'w' ? 'White' : 'Black'
}

function formatResultTurn(turn: 'w' | 'b') {
  return turn === 'w' ? 'white' : 'black'
}

function inferChessPhase(moveCount: number) {
  if (moveCount < 12) {
    return 'opening'
  }

  if (moveCount < 40) {
    return 'middlegame'
  }

  return 'endgame'
}

function buildBoardSummary(chess: Chess, embedUrl: string) {
  const history = chess.history()
  const recentMoves = history.slice(-6).join(', ') || 'No moves yet'
  return `Mirrored Chess.com board FEN: ${chess.fen()}. ${formatTurn(chess.turn())} to move. Recent moves: ${recentMoves}. Reference embed: ${embedUrl}.`
}

function buildBoardStateResult(input: { appSessionId: string; chess: Chess; mode?: ChessMode; embedUrl: string }) {
  const history = input.chess.history()
  const legalMoves = input.chess.moves()
  const turn = formatResultTurn(input.chess.turn())

  return {
    appSessionId: input.appSessionId,
    fen: input.chess.fen(),
    turn,
    moveCount: history.length,
    lastMove: history.at(-1) ?? 'No moves yet',
    legalMoveCount: legalMoves.length,
    legalMoves,
    candidateMoves: legalMoves.slice(0, 6),
    phase: inferChessPhase(history.length),
    status: input.chess.isGameOver() ? 'game-over' : 'active',
    summary: buildBoardSummary(input.chess, input.embedUrl),
    moveExecutionAvailable: true,
    ...(input.mode ? { mode: input.mode } : {}),
    provider: 'chess.com',
    vendorBoardSync: 'manual-import',
    embedUrl: input.embedUrl,
  }
}

function buildBoardStateCompletionSignal(input: {
  conversationId: string
  appSessionId: string
  toolCallId: string
  chess: Chess
  mode?: ChessMode
  embedUrl: string
}): CompletionSignal {
  const result = buildBoardStateResult({
    appSessionId: input.appSessionId,
    chess: input.chess,
    mode: input.mode,
    embedUrl: input.embedUrl,
  })

  return {
    version: 'v1',
    conversationId: input.conversationId,
    appSessionId: input.appSessionId,
    appId: CHESS_COM_RUNTIME_APP_ID,
    toolCallId: input.toolCallId,
    status: 'succeeded',
    resultSummary: result.summary,
    result,
    completedAt: new Date().toISOString(),
    followUpContext: {
      summary:
        'Use the mirrored Chess.com board state to explain the position, recommend the next move, or talk through the plan. The Chess.com iframe is a visual reference surface.',
      userVisibleSummary: result.summary,
      recommendedPrompts: [
        'What is the best move from this position?',
        'Explain the plan from here.',
        'Why is this position better for one side?',
      ],
      stateDigest: {
        fen: result.fen,
        turn: result.turn,
        moveCount: result.moveCount,
        lastMove: result.lastMove,
        provider: 'chess.com',
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
  mode?: ChessMode
  embedUrl: string
}): CompletionSignal {
  const boardState = buildBoardStateResult({
    appSessionId: input.appSessionId,
    chess: input.chess,
    mode: input.mode,
    embedUrl: input.embedUrl,
  })
  const lastMove = input.chess.history().at(-1) ?? input.requestedMove

  return {
    version: 'v1',
    conversationId: input.conversationId,
    appSessionId: input.appSessionId,
    appId: CHESS_COM_RUNTIME_APP_ID,
    toolCallId: input.toolCallId,
    status: 'succeeded',
    resultSummary: `Moved ${lastMove} on the mirrored Chess.com board. ${boardState.turn === 'white' ? 'White' : 'Black'} to move.`,
    result: {
      ...boardState,
      requestedMove: input.requestedMove,
      appliedMove: lastMove,
      explanation:
        'This move was applied on the ChatBridge mirrored board so chat can reason over the position, even though the raw Chess.com iframe remains a reference-only surface.',
    },
    completedAt: new Date().toISOString(),
    followUpContext: {
      summary: 'Use the updated mirrored Chess.com board to recommend the best continuation or explain the position.',
      userVisibleSummary: `Moved ${lastMove} on the mirrored board.`,
      recommendedPrompts: ['What should the other side play now?', 'Explain the best continuation from here.'],
      stateDigest: {
        fen: boardState.fen,
        turn: boardState.turn,
        moveCount: boardState.moveCount,
        lastMove,
        provider: 'chess.com',
      },
    },
  }
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
  return isLightSquare(square) ? '#e7ecd9' : '#7d945b'
}

function getCoordinatePalette() {
  return {
    text: '#f8fafc',
    background: 'rgba(15,23,42,0.96)',
    border: 'rgba(226,232,240,0.24)',
    shadow: '0 2px 6px rgba(2,6,23,0.32)',
  }
}

function getPiecePalette(color: 'w' | 'b') {
  return color === 'w'
    ? {
        fill: '#f8fafc',
        shadow: '0 1px 2px rgba(15,23,42,0.3)',
        stroke: '0.8px rgba(15, 23, 42, 0.58)',
      }
    : {
        fill: '#0f172a',
        shadow: '0 1px 0 rgba(248,250,252,0.18), 0 2px 4px rgba(15,23,42,0.2)',
        stroke: '0',
      }
}

export function ChessComAppPage() {
  const approvedApp = getApprovedAppById(CHESS_COM_APP_ID)
  const defaultEmbedUrl = approvedApp?.integrationConfig?.defaultLaunchUrl ?? DEFAULT_EMBED_URL
  const { runtimeContext, invocationMessage, sendCompletion, sendError, sendState } =
    useEmbeddedAppBridge(CHESS_COM_RUNTIME_APP_ID)

  const [fallbackChess, setFallbackChess] = useState(() => new Chess())
  const [selection, setSelection] = useState<SelectionState>({ from: null })
  const [feedback, setFeedback] = useState<string | null>(null)
  const [draftEmbedUrl, setDraftEmbedUrl] = useState(
    () => getApprovedAppLaunchOverride(CHESS_COM_APP_ID) || defaultEmbedUrl
  )
  const [savedEmbedUrl, setSavedEmbedUrl] = useState(
    () => getApprovedAppLaunchOverride(CHESS_COM_APP_ID) || defaultEmbedUrl
  )
  const [embedUrlError, setEmbedUrlError] = useState<string | null>(null)
  const [importValue, setImportValue] = useState('')
  const [vendorFrameState, setVendorFrameState] = useState<'loading' | 'ready' | 'blocked'>('loading')
  const handledToolCallIdsRef = useRef<Set<string>>(new Set())

  const sharedChessSnapshot = useSharedChessSessionSnapshot(
    runtimeContext?.conversationId ?? null,
    runtimeContext?.appSessionId ?? null
  )

  useEffect(() => {
    if (savedEmbedUrl) {
      return
    }

    const seededEmbedUrl =
      typeof runtimeContext?.initialState?.embedUrl === 'string'
        ? normalizeLaunchUrl({ id: CHESS_COM_APP_ID }, runtimeContext.initialState.embedUrl)
        : ''

    if (!seededEmbedUrl) {
      return
    }

    setSavedEmbedUrl(seededEmbedUrl)
    setDraftEmbedUrl(seededEmbedUrl)
  }, [runtimeContext?.initialState, savedEmbedUrl])

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
    invocationMessage?.payload.toolName === exampleChessLaunchToolSchema.name
      ? asChessMode(invocationMessage.payload.arguments.mode)
      : asChessMode(runtimeContext?.initialState?.mode)
  const embedUrl = savedEmbedUrl || defaultEmbedUrl
  const chess = useMemo(
    () => new Chess(sharedChessSnapshot?.fen ?? fallbackChess.fen()),
    [fallbackChess, sharedChessSnapshot?.fen]
  )

  const boardStateResult = useMemo(
    () =>
      buildBoardStateResult({
        appSessionId: runtimeContext?.appSessionId ?? 'app-session.preview.chess-com',
        chess,
        mode: currentMode,
        embedUrl,
      }),
    [chess, currentMode, embedUrl, runtimeContext?.appSessionId]
  )

  useEffect(() => {
    if (!runtimeContext) {
      return
    }

    sendState({
      status: chess.isGameOver() ? 'completed' : 'active',
      summary: boardStateResult.summary,
      state: {
        ...boardStateResult,
        vendorFrameState,
        vendorBoardReadable: false,
        vendorBoardControllable: false,
        mirroredBoard: true,
      },
      progress: {
        label: boardStateResult.moveCount === 0 ? 'Mirror board ready' : `Move ${boardStateResult.moveCount}`,
        percent: boardStateResult.moveCount === 0 ? 8 : Math.min(96, 8 + boardStateResult.moveCount * 4),
      },
    })
  }, [boardStateResult, chess, runtimeContext, sendState, vendorFrameState])

  useEffect(() => {
    if (!invocationMessage || invocationMessage.payload.toolName !== exampleChessLaunchToolSchema.name) {
      return
    }

    if (handledToolCallIdsRef.current.has(invocationMessage.payload.toolCallId)) {
      return
    }

    if (!runtimeContext) {
      return
    }

    handledToolCallIdsRef.current.add(invocationMessage.payload.toolCallId)
    activateChessSession({
      conversationId: runtimeContext.conversationId,
      appSessionId: runtimeContext.appSessionId,
      mode: asChessMode(invocationMessage.payload.arguments.mode) ?? 'analysis',
      status: 'active',
    })
    setSelection({ from: null })
    setFeedback(
      'Chess.com workspace is ready. The reference embed is live and the mirrored board is connected to chat.'
    )
  }, [invocationMessage, runtimeContext])

  useEffect(() => {
    if (!invocationMessage || invocationMessage.payload.toolName !== exampleChessGetBoardStateToolSchema.name) {
      return
    }

    if (handledToolCallIdsRef.current.has(invocationMessage.payload.toolCallId)) {
      return
    }

    if (!runtimeContext) {
      return
    }

    handledToolCallIdsRef.current.add(invocationMessage.payload.toolCallId)
    sendCompletion(
      buildBoardStateCompletionSignal({
        conversationId: runtimeContext.conversationId,
        appSessionId: runtimeContext.appSessionId,
        toolCallId: invocationMessage.payload.toolCallId,
        chess,
        mode: currentMode,
        embedUrl,
      })
    )
  }, [chess, currentMode, embedUrl, invocationMessage, runtimeContext, sendCompletion])

  useEffect(() => {
    if (!invocationMessage || invocationMessage.payload.toolName !== exampleChessMakeMoveToolSchema.name) {
      return
    }

    const { toolCallId } = invocationMessage.payload
    if (handledToolCallIdsRef.current.has(toolCallId)) {
      return
    }

    const requestedMove =
      typeof invocationMessage.payload.arguments.move === 'string'
        ? invocationMessage.payload.arguments.move.trim()
        : ''
    const expectedFen =
      typeof invocationMessage.payload.arguments.expectedFen === 'string'
        ? invocationMessage.payload.arguments.expectedFen.trim()
        : ''

    if (!runtimeContext) {
      setFeedback('The Chess.com workspace runtime is not connected yet.')
      return
    }

    handledToolCallIdsRef.current.add(toolCallId)

    if (!requestedMove) {
      sendError({
        code: 'chess.invalid-move-request',
        message: 'A Chess.com workspace move request must include a move string.',
        recoverable: true,
        details: {
          toolCallId,
        },
      })
      return
    }

    const moveResult = applyChessSessionMove({
      conversationId: runtimeContext.conversationId,
      appSessionId: runtimeContext.appSessionId,
      requestedMove,
      expectedFen,
      source: 'tool-move',
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
    setFeedback(
      `Played ${moveResult.appliedMoveSan} on the mirrored board. ${formatTurn(moveResult.snapshot.turn)} to move.`
    )
    sendCompletion(
      buildMoveCompletionSignal({
        conversationId: runtimeContext.conversationId,
        appSessionId: runtimeContext.appSessionId,
        toolCallId,
        requestedMove,
        chess: new Chess(moveResult.snapshot.fen),
        mode: currentMode,
        embedUrl,
      })
    )
  }, [currentMode, embedUrl, invocationMessage, runtimeContext, sendCompletion, sendError])

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
          glyph: pieceGlyphs[piece.color][piece.type] ?? piece.type.toUpperCase(),
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

  const handleSaveEmbedUrl = useCallback(() => {
    const validationMessage = getLaunchUrlValidationMessage(
      {
        id: CHESS_COM_APP_ID,
        name: approvedApp?.name ?? 'Chess.com',
      },
      draftEmbedUrl
    )
    if (validationMessage) {
      setEmbedUrlError(validationMessage)
      return
    }

    const normalized = normalizeLaunchUrl({ id: CHESS_COM_APP_ID }, draftEmbedUrl) || defaultEmbedUrl
    persistApprovedAppLaunchOverride(CHESS_COM_APP_ID, normalized)
    setSavedEmbedUrl(normalized)
    setDraftEmbedUrl(normalized)
    setEmbedUrlError(null)
    setVendorFrameState('loading')
  }, [approvedApp?.name, defaultEmbedUrl, draftEmbedUrl])

  const handleResetEmbedUrl = useCallback(() => {
    persistApprovedAppLaunchOverride(CHESS_COM_APP_ID, null)
    setSavedEmbedUrl(defaultEmbedUrl)
    setDraftEmbedUrl(defaultEmbedUrl)
    setEmbedUrlError(null)
    setVendorFrameState('loading')
  }, [defaultEmbedUrl])

  const handleImportPosition = useCallback(() => {
    const imported = importChessComPosition(importValue)
    if (!imported.ok) {
      setFeedback(imported.error)
      return
    }

    if (runtimeContext) {
      loadChessSessionPosition({
        conversationId: runtimeContext.conversationId,
        appSessionId: runtimeContext.appSessionId,
        fen: imported.chess.fen(),
        historySan: imported.historySan,
        mode: 'analysis',
        status: 'active',
      })
    } else {
      setFallbackChess(imported.chess)
    }

    setSelection({ from: null })
    setFeedback(
      imported.source === 'fen'
        ? 'Loaded the pasted FEN into the mirrored board.'
        : `Imported ${imported.historySan.length} PGN moves into the mirrored board.`
    )
  }, [importValue, runtimeContext])

  const handleResetMirrorBoard = useCallback(() => {
    if (runtimeContext) {
      resetChessSession({
        conversationId: runtimeContext.conversationId,
        appSessionId: runtimeContext.appSessionId,
        mode: currentMode ?? 'analysis',
        status: 'active',
      })
    } else {
      setFallbackChess(new Chess())
    }

    setSelection({ from: null })
    setFeedback('Reset the mirrored board to the starting position.')
  }, [currentMode, runtimeContext])

  const handleSquareClick = useCallback(
    (square: Square) => {
      const piece = chess.get(square)
      if (!selection.from) {
        if (!piece) {
          setFeedback('Select a piece on the mirrored board first.')
          return
        }

        if (piece.color !== chess.turn()) {
          setFeedback(`It is ${formatTurn(chess.turn())}'s turn on the mirrored board.`)
          return
        }

        setSelection({ from: square })
        setFeedback(`Selected ${square.toUpperCase()} on the mirrored board. Choose a destination square.`)
        return
      }

      if (runtimeContext) {
        const moveResult = applyChessSessionMove({
          conversationId: runtimeContext.conversationId,
          appSessionId: runtimeContext.appSessionId,
          requestedMove: `${selection.from}${square}`,
          expectedFen: chess.fen(),
          source: 'manual-board-move',
        })
        if (!moveResult.ok) {
          setFeedback(
            moveResult.code === 'chess.illegal-move'
              ? `That mirrored move from ${selection.from.toUpperCase()} to ${square.toUpperCase()} is not legal.`
              : moveResult.message
          )
          setSelection({ from: null })
          return
        }

        setSelection({ from: null })
        setFeedback(
          `Played ${moveResult.appliedMoveSan} on the mirrored board. ${formatTurn(moveResult.snapshot.turn)} to move.`
        )
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
    [chess, runtimeContext, selection.from]
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
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={3} c="white">
              Chess.com Workspace
            </Title>
            <Text size="sm" c="rgba(226,232,240,0.72)">
              Vendor board plus ChatBridge mirrored analysis board
            </Text>
          </div>
          <Badge color={chess.isGameOver() ? 'teal' : 'blue'} variant="light">
            {chess.isGameOver() ? 'Game Over' : `${formatTurn(chess.turn())} to move`}
          </Badge>
        </Group>

        <Alert color="blue" variant="light">
          The Chess.com iframe is a visual reference surface. Chat, move execution, and board memory run against the
          mirrored board below.
        </Alert>

        {feedback ? (
          <Alert color="indigo" variant="light">
            {feedback}
          </Alert>
        ) : null}

        <Paper
          withBorder
          radius="xl"
          p="sm"
          style={{
            background: 'rgba(15, 23, 42, 0.74)',
            borderColor: 'rgba(148, 163, 184, 0.18)',
          }}
        >
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <div>
                <Text size="sm" fw={700} c="white">
                  Chess.com embed
                </Text>
                <Text size="xs" c="rgba(226,232,240,0.7)">
                  Saved emboard URL: {embedUrl}
                </Text>
              </div>
              <Badge
                variant="light"
                color={vendorFrameState === 'ready' ? 'green' : vendorFrameState === 'blocked' ? 'red' : 'blue'}
              >
                {vendorFrameState === 'ready'
                  ? 'Embed ready'
                  : vendorFrameState === 'blocked'
                    ? 'Embed blocked'
                    : 'Loading embed'}
              </Badge>
            </Group>
            <Box className="overflow-hidden rounded-[1rem] border border-white/10 bg-[#0b1120]">
              <iframe
                src={embedUrl}
                title="Chess.com reference board"
                className="h-[20rem] w-full border-0 bg-white"
                sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                referrerPolicy={getPreviewReferrerPolicy({ id: CHESS_COM_APP_ID })}
                onLoad={() => setVendorFrameState('ready')}
                onError={() => setVendorFrameState('blocked')}
              />
            </Box>
            {vendorFrameState === 'blocked' ? (
              <Text size="xs" c="rgba(248,113,113,0.88)">
                Chess.com blocked this embed URL. Save a valid Chess.com `emboard` URL to keep the vendor board visible.
              </Text>
            ) : null}
          </Stack>
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
          <Stack gap="sm">
            <Text size="sm" fw={700} c="white">
              Embed configuration
            </Text>
            <TextInput
              label={approvedApp?.integrationConfig?.launchUrlLabel ?? 'Chess.com emboard URL'}
              placeholder={approvedApp?.integrationConfig?.launchUrlPlaceholder ?? DEFAULT_EMBED_URL}
              value={draftEmbedUrl}
              onChange={(event) => setDraftEmbedUrl(event.currentTarget.value)}
              error={embedUrlError}
            />
            <Group gap="xs">
              <Button size="xs" onClick={handleSaveEmbedUrl}>
                Save embed URL
              </Button>
              <Button size="xs" variant="subtle" color="gray" onClick={handleResetEmbedUrl}>
                Reset
              </Button>
            </Group>
          </Stack>
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
          <Stack gap="sm">
            <Text size="sm" fw={700} c="white">
              Import a position into the mirrored board
            </Text>
            <Text size="sm" c="rgba(226,232,240,0.72)">
              Paste a FEN or PGN from Chess.com. Chat will analyze and manipulate the mirrored board state from there.
            </Text>
            <Textarea
              autosize
              minRows={4}
              value={importValue}
              onChange={(event) => setImportValue(event.currentTarget.value)}
              placeholder="Paste FEN or PGN here"
            />
            <Group gap="xs">
              <Button size="xs" onClick={handleImportPosition}>
                Import position
              </Button>
              <Button size="xs" variant="subtle" color="gray" onClick={handleResetMirrorBoard}>
                Reset mirrored board
              </Button>
            </Group>
          </Stack>
        </Paper>

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
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <div>
                <Text size="sm" fw={700} c="white">
                  Mirrored analysis board
                </Text>
                <Text size="xs" c="rgba(226,232,240,0.7)">
                  Chat-visible state with move execution and board memory
                </Text>
              </div>
              <Badge variant="light" color="violet">
                {currentMode ?? 'analysis'}
              </Badge>
            </Group>
            <Box
              data-testid="chess-com-board-grid"
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
                const coordinatePalette = getCoordinatePalette()
                const piecePalette = piece ? getPiecePalette(piece.color) : null

                return (
                  <UnstyledButton
                    key={square}
                    type="button"
                    onClick={() => handleSquareClick(square)}
                    data-testid={`chess-com-square-${square}`}
                    aria-label={
                      piece ? `${piece.label} on ${square.toUpperCase()}` : `Empty square ${square.toUpperCase()}`
                    }
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
                      overflow: 'hidden',
                    }}
                  >
                    <Text
                      component="span"
                      style={{
                        fontFamily: CHESS_SYMBOL_FONT_STACK,
                        fontSize: 'clamp(1.42rem, 3.15vw, 2.08rem)',
                        fontWeight: 700,
                        lineHeight: 1,
                        color: piecePalette?.fill ?? '#0f172a',
                        textShadow: piecePalette?.shadow,
                        WebkitTextStroke: piecePalette?.stroke,
                      }}
                    >
                      {piece?.glyph ?? ''}
                    </Text>
                    <Text
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
                        boxShadow: coordinatePalette.shadow,
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
          </Stack>
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
              Chat-ready board state
            </Text>
            <Text size="sm" c="rgba(226,232,240,0.72)">
              Ask the chat to analyze this position, suggest a move, or explain what changed on the mirrored board. Move
              execution only affects the mirrored board, not the raw Chess.com iframe.
            </Text>
            <Text size="xs" c="rgba(148,163,184,0.9)">
              FEN: {boardStateResult.fen}
            </Text>
            {selection.from ? (
              <Text size="xs" c="rgba(148,163,184,0.9)">
                Selected {selection.from.toUpperCase()}. Click a destination square to move on the mirrored board.
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
