import { Alert, Badge, Box, Button, Group, Loader, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import type { CompletionSignal, JsonObject } from '@shared/contracts/v1'
import {
  exampleChessGetBoardStateToolSchema,
  exampleChessLaunchToolSchema,
  exampleChessMakeMoveToolSchema,
} from '@shared/contracts/v1'
import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { postSidebarDirectIframeStateMessage } from '@/components/apps/sidebarDirectIframeState'
import { getApprovedAppById } from '@/data/approvedApps'
import {
  getLaunchUrlValidationMessage,
  getPreviewReferrerPolicy,
  normalizeLaunchUrl,
} from '@/lib/approvedAppLaunchConfig'
import { getApprovedAppLaunchOverride, persistApprovedAppLaunchOverride } from '@/lib/approvedAppLaunchOverrides'
import { resolveTutorMeAIBackendOrigin } from '@/packages/tutormeai-auth/client'
import { applyRequestedChessMove } from '../chess/chessMove'
import { useEmbeddedAppBridge } from '../useEmbeddedAppBridge'
import { type ChessComDiagram, extractChessComDiagramId } from './chessComOfficialViewer'

const CHESS_COM_APP_ID = 'chess-com'
const CHESS_COM_RUNTIME_APP_ID = 'chess.com.workspace'
const DEFAULT_EMBED_URL = 'https://www.chess.com/emboard?id=10477955&_height=640'
const VIEWER_READY_SOURCE = 'chatbridge-chesscom-viewer'
const VIEWER_TIMEOUT_MS = 4_500

type ViewerMode = 'loading' | 'ready' | 'fallback'
type DiagramLoadState = 'loading' | 'ready' | 'failed'
type ChessMode = 'analysis' | 'review'
type VisibleViewerKind = 'raw' | 'patched'

type ChessComBoardResult = {
  appSessionId: string
  fen: string
  turn: 'white' | 'black'
  moveCount: number
  lastMove: string
  legalMoveCount: number
  legalMoves: string[]
  candidateMoves: string[]
  phase: 'opening' | 'middlegame' | 'endgame'
  status: 'active' | 'game-over'
  summary: string
  moveExecutionAvailable: boolean
  provider: 'chess.com'
  diagramId: string
  embedUrl: string
  vendorBoardSync: 'official-diagram-callback'
  lastUpdateSource: 'diagram-load' | 'manual-board-move'
  mode?: ChessMode
}

function formatTurn(turn: 'w' | 'b') {
  return turn === 'w' ? 'White' : 'Black'
}

function formatResultTurn(turn: 'w' | 'b') {
  return turn === 'w' ? 'white' : 'black'
}

function inferChessPhase(moveCount: number): ChessComBoardResult['phase'] {
  if (moveCount < 12) {
    return 'opening'
  }

  if (moveCount < 40) {
    return 'middlegame'
  }

  return 'endgame'
}

function buildChessMoveExplanation(moveSan: string) {
  if (moveSan.includes('#')) {
    return 'finishes the game'
  }

  if (moveSan.includes('+')) {
    return 'forces the opponent to respond to check'
  }

  if (moveSan === 'O-O' || moveSan === 'O-O-O') {
    return 'improves king safety'
  }

  const normalized = moveSan.toLowerCase()
  if (normalized === 'e4' || normalized === 'd4' || normalized === 'e5' || normalized === 'd5') {
    return 'claims the center and opens lines for the pieces behind it'
  }

  if (normalized === 'nf3' || normalized === 'nc3' || normalized === 'nf6' || normalized === 'nc6') {
    return 'develops a knight toward the center while keeping options flexible'
  }

  if (moveSan.includes('x')) {
    return 'wins material or improves the balance on the board'
  }

  return 'improves the position without creating unnecessary risk'
}

function buildBoardSummary(input: {
  chess: Chess
  diagramId: string
  embedUrl: string
  tags?: Record<string, string | null>
}) {
  const history = input.chess.history()
  const recentMoves = history.slice(-6).join(', ') || 'No moves yet'
  const white = input.tags?.white ?? 'White'
  const black = input.tags?.black ?? 'Black'

  return `Chess.com board FEN: ${input.chess.fen()}. ${formatTurn(input.chess.turn())} to move. Game: ${white} vs ${black}. Recent moves: ${recentMoves}. Diagram ${input.diagramId}.`
}

function buildBoardResult(input: {
  appSessionId: string
  chess: Chess
  diagramId: string
  embedUrl: string
  lastUpdateSource: ChessComBoardResult['lastUpdateSource']
  tags?: Record<string, string | null>
  mode?: ChessMode
}): ChessComBoardResult {
  const history = input.chess.history()
  const legalMoves = input.chess.moves()

  return {
    appSessionId: input.appSessionId,
    fen: input.chess.fen(),
    turn: formatResultTurn(input.chess.turn()),
    moveCount: history.length,
    lastMove: history.at(-1) ?? 'No moves yet',
    legalMoveCount: legalMoves.length,
    legalMoves,
    candidateMoves: legalMoves.slice(0, 6),
    phase: inferChessPhase(history.length),
    status: input.chess.isGameOver() ? 'game-over' : 'active',
    summary: buildBoardSummary({
      chess: input.chess,
      diagramId: input.diagramId,
      embedUrl: input.embedUrl,
      tags: input.tags,
    }),
    moveExecutionAvailable: true,
    provider: 'chess.com',
    diagramId: input.diagramId,
    embedUrl: input.embedUrl,
    vendorBoardSync: 'official-diagram-callback',
    lastUpdateSource: input.lastUpdateSource,
    ...(input.mode
      ? {
          mode: input.mode,
        }
      : {}),
  }
}

function buildBoardCompletionSignal(input: {
  conversationId: string
  appSessionId: string
  toolCallId: string
  chess: Chess
  diagramId: string
  embedUrl: string
  lastUpdateSource: ChessComBoardResult['lastUpdateSource']
  tags?: Record<string, string | null>
  mode?: ChessMode
}): CompletionSignal {
  const result = buildBoardResult({
    appSessionId: input.appSessionId,
    chess: input.chess,
    diagramId: input.diagramId,
    embedUrl: input.embedUrl,
    lastUpdateSource: input.lastUpdateSource,
    tags: input.tags,
    mode: input.mode,
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
        'Use the official Chess.com board state to explain the position, recommend the next move, or continue the line.',
      userVisibleSummary: result.summary,
      recommendedPrompts: [
        'What is the best move from this position?',
        'Explain the plan from here.',
        'Why is this position good for one side?',
      ],
      stateDigest: {
        fen: result.fen,
        turn: result.turn,
        moveCount: result.moveCount,
        lastMove: result.lastMove,
        diagramId: result.diagramId,
        provider: 'chess.com',
        lastUpdateSource: result.lastUpdateSource,
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
  diagramId: string
  embedUrl: string
  tags?: Record<string, string | null>
  mode?: ChessMode
}): CompletionSignal {
  const result = buildBoardResult({
    appSessionId: input.appSessionId,
    chess: input.chess,
    diagramId: input.diagramId,
    embedUrl: input.embedUrl,
    lastUpdateSource: 'manual-board-move',
    tags: input.tags,
    mode: input.mode,
  })
  const lastMove = input.chess.history().at(-1) ?? input.requestedMove

  return {
    version: 'v1',
    conversationId: input.conversationId,
    appSessionId: input.appSessionId,
    appId: CHESS_COM_RUNTIME_APP_ID,
    toolCallId: input.toolCallId,
    status: 'succeeded',
    resultSummary: `Move played: ${lastMove}. ${result.turn === 'white' ? 'White' : 'Black'} to move.`,
    result: {
      ...result,
      requestedMove: input.requestedMove,
      appliedMove: lastMove,
      explanation: buildChessMoveExplanation(lastMove),
    },
    completedAt: new Date().toISOString(),
    followUpContext: {
      summary: 'Use the updated Chess.com board to recommend the best next move or explain the position.',
      userVisibleSummary: `Move played: ${lastMove}.`,
      recommendedPrompts: [
        'What should I play next?',
        'Why is this move strong?',
        'Explain the new position for a beginner.',
      ],
      stateDigest: {
        fen: result.fen,
        turn: result.turn,
        moveCount: result.moveCount,
        lastMove,
        diagramId: result.diagramId,
        provider: 'chess.com',
        lastUpdateSource: 'manual-board-move',
      },
    },
  }
}

function getRuntimeEmbedUrl(runtimeContext: ReturnType<typeof useEmbeddedAppBridge>['runtimeContext']) {
  const embedUrl = runtimeContext?.initialState?.embedUrl
  return typeof embedUrl === 'string' ? embedUrl : ''
}

function buildStateDigest(result: ChessComBoardResult): JsonObject {
  return {
    fen: result.fen,
    turn: result.turn === 'white' ? 'w' : 'b',
    moveCount: result.moveCount,
    lastMove: result.lastMove,
    legalMoveCount: result.legalMoveCount,
    candidateMoves: result.candidateMoves,
    provider: result.provider,
    diagramId: result.diagramId,
    embedUrl: result.embedUrl,
    vendorBoardSync: result.vendorBoardSync,
    lastUpdateSource: result.lastUpdateSource,
  }
}

function buildShellIframeTitle(diagramId: string) {
  return `Chess.com diagram ${diagramId}`
}

function buildViewerKey(input: { diagramId: string; pgn: string; reloadNonce: number; viewerKind: string }) {
  return `${input.viewerKind}:${input.diagramId}:${input.pgn.length}:${input.reloadNonce}:${input.pgn.slice(-24)}`
}

function buildRawViewerKey(input: { diagramId: string; resolvedEmbedUrl: string; reloadNonce: number }) {
  return `raw:${input.diagramId}:${input.reloadNonce}:${input.resolvedEmbedUrl}`
}

function buildChessComApiUrl(pathname: string, backendOrigin: string) {
  return new URL(pathname, backendOrigin).toString()
}

function buildChessComViewerUrl(input: { backendOrigin: string; diagramId: string; pgn: string; reloadNonce: number }) {
  const url = new URL(`/api/chess-com/viewer/${input.diagramId}`, input.backendOrigin)
  url.searchParams.set('reload', String(input.reloadNonce))
  url.searchParams.set('pgn', input.pgn)
  return url.toString()
}

async function fetchJson<T>(input: string) {
  const response = await fetch(input, {
    mode: 'cors',
  })

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`)
  }

  const body = await response.text()
  try {
    return JSON.parse(body) as T
  } catch {
    if (body.trim().startsWith('<')) {
      throw new Error('Chess.com data endpoint returned HTML instead of JSON. Check the TutorMeAI backend origin.')
    }

    throw new Error('Chess.com data endpoint returned invalid JSON.')
  }
}

export function ChessComAppPage() {
  const approvedApp = useMemo(() => getApprovedAppById(CHESS_COM_APP_ID), [])
  const backendOrigin = useMemo(() => resolveTutorMeAIBackendOrigin(), [])
  const { runtimeContext, invocationMessage, sendCompletion, sendError, sendState } =
    useEmbeddedAppBridge(CHESS_COM_RUNTIME_APP_ID)
  const runtimeEmbedUrl = getRuntimeEmbedUrl(runtimeContext)

  const [savedEmbedUrl, setSavedEmbedUrl] = useState('')
  const [draftEmbedUrl, setDraftEmbedUrl] = useState('')
  const [launchConfigError, setLaunchConfigError] = useState<string | null>(null)
  const [diagram, setDiagram] = useState<ChessComDiagram | null>(null)
  const [boardPgn, setBoardPgn] = useState('')
  const [feedback, setFeedback] = useState('Loading the official Chess.com board…')
  const [diagramLoadState, setDiagramLoadState] = useState<DiagramLoadState>('loading')
  const [viewerMode, setViewerMode] = useState<ViewerMode>('loading')
  const [visibleViewerKind, setVisibleViewerKind] = useState<VisibleViewerKind>('raw')
  const [reloadNonce, setReloadNonce] = useState(0)
  const [lastUpdateSource, setLastUpdateSource] = useState<ChessComBoardResult['lastUpdateSource']>('diagram-load')

  const lastHandledToolCallIdRef = useRef<string | null>(null)
  const viewerTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (!approvedApp) {
      return
    }

    const savedValue = getApprovedAppLaunchOverride(approvedApp.id)
    setSavedEmbedUrl(savedValue)
    setDraftEmbedUrl(
      savedValue || runtimeEmbedUrl || approvedApp.integrationConfig?.defaultLaunchUrl || DEFAULT_EMBED_URL
    )
    setLaunchConfigError(null)
  }, [approvedApp, runtimeEmbedUrl])

  const resolvedEmbedUrl = useMemo(() => {
    if (!approvedApp) {
      return DEFAULT_EMBED_URL
    }

    return (
      normalizeLaunchUrl(approvedApp, savedEmbedUrl) ||
      normalizeLaunchUrl(approvedApp, runtimeEmbedUrl) ||
      approvedApp.integrationConfig?.defaultLaunchUrl ||
      DEFAULT_EMBED_URL
    )
  }, [approvedApp, runtimeEmbedUrl, savedEmbedUrl])

  const diagramId = useMemo(() => extractChessComDiagramId(resolvedEmbedUrl), [resolvedEmbedUrl])

  useEffect(() => {
    if (!diagramId) {
      setDiagram(null)
      setBoardPgn('')
      setDiagramLoadState('failed')
      setViewerMode('fallback')
      setFeedback('Save a valid Chess.com emboard URL with an `id=` parameter to load the board.')
      return
    }

    let cancelled = false
    setDiagramLoadState('loading')
    setFeedback('Loading the official Chess.com board…')

    void fetchJson<{ ok: true; data: ChessComDiagram }>(
      buildChessComApiUrl(`/api/chess-com/diagram/${diagramId}?reload=${reloadNonce}`, backendOrigin)
    )
      .then((diagramResponse) => {
        if (cancelled) {
          return
        }

        setDiagram(diagramResponse.data)
        setBoardPgn(diagramResponse.data.setup[0]?.pgn ?? '')
        setLastUpdateSource('diagram-load')
        setDiagramLoadState('ready')
        setFeedback('Chess.com is ready. Ask for the best move, a board scan, or a line explanation.')
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        setDiagram(null)
        setBoardPgn('')
        setDiagramLoadState('failed')
        setFeedback(error instanceof Error ? error.message : 'Failed to load the Chess.com diagram.')
      })

    return () => {
      cancelled = true
    }
  }, [backendOrigin, diagramId, reloadNonce])

  const chess = useMemo(() => {
    if (!boardPgn) {
      return null
    }

    const nextChess = new Chess()
    try {
      nextChess.loadPgn(boardPgn)
      return nextChess
    } catch {
      return null
    }
  }, [boardPgn])

  const boardResult = useMemo(() => {
    if (!runtimeContext || !diagramId || !resolvedEmbedUrl || !diagram || !chess) {
      return null
    }

    return buildBoardResult({
      appSessionId: runtimeContext.appSessionId,
      chess,
      diagramId,
      embedUrl: resolvedEmbedUrl,
      lastUpdateSource,
      tags: diagram.setup[0]?.tags,
      mode: (runtimeContext.initialState?.mode as ChessMode | undefined) ?? 'analysis',
    })
  }, [chess, diagram, diagramId, lastUpdateSource, resolvedEmbedUrl, runtimeContext])

  const diagramPgn = diagram?.setup[0]?.pgn ?? ''
  const usesPatchedViewer = Boolean(diagramId && boardPgn && diagramPgn && boardPgn.trim() !== diagramPgn.trim())
  const patchedViewerUrl = useMemo(() => {
    if (!diagramId || !boardPgn) {
      return ''
    }

    return buildChessComViewerUrl({
      backendOrigin,
      diagramId,
      pgn: boardPgn,
      reloadNonce,
    })
  }, [backendOrigin, boardPgn, diagramId, reloadNonce])

  const rawViewerKey = useMemo(() => {
    if (!diagramId) {
      return `raw:missing:${reloadNonce}`
    }

    return buildRawViewerKey({
      diagramId,
      resolvedEmbedUrl,
      reloadNonce,
    })
  }, [diagramId, reloadNonce, resolvedEmbedUrl])

  const patchedViewerKey = useMemo(() => {
    if (!diagramId) {
      return `patched:missing:${reloadNonce}`
    }

    return buildViewerKey({
      diagramId,
      pgn: boardPgn,
      reloadNonce,
      viewerKind: 'patched',
    })
  }, [boardPgn, diagramId, reloadNonce])
  const showPatchedViewer = usesPatchedViewer && visibleViewerKind === 'patched' && viewerMode !== 'fallback'
  const renderPatchedViewer = usesPatchedViewer && viewerMode !== 'fallback' && Boolean(patchedViewerUrl)

  useEffect(() => {
    if (!usesPatchedViewer || !patchedViewerUrl) {
      if (viewerTimeoutRef.current !== null) {
        window.clearTimeout(viewerTimeoutRef.current)
        viewerTimeoutRef.current = null
      }
      setVisibleViewerKind('raw')
      return
    }

    setVisibleViewerKind('raw')
    setViewerMode('loading')

    if (viewerTimeoutRef.current !== null) {
      window.clearTimeout(viewerTimeoutRef.current)
    }

    viewerTimeoutRef.current = window.setTimeout(() => {
      setViewerMode((current) => (current === 'loading' ? 'fallback' : current))
    }, VIEWER_TIMEOUT_MS)

    return () => {
      if (viewerTimeoutRef.current !== null) {
        window.clearTimeout(viewerTimeoutRef.current)
        viewerTimeoutRef.current = null
      }
    }
  }, [patchedViewerUrl, usesPatchedViewer])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const payload = event.data
      if (!payload || typeof payload !== 'object') {
        return
      }

      const candidate = payload as Record<string, unknown>
      if (candidate.source !== VIEWER_READY_SOURCE || typeof candidate.type !== 'string') {
        return
      }

      if (candidate.type === 'viewer-ready') {
        if (viewerTimeoutRef.current !== null) {
          window.clearTimeout(viewerTimeoutRef.current)
          viewerTimeoutRef.current = null
        }
        setVisibleViewerKind('patched')
        setViewerMode('ready')
        return
      }

      if (candidate.type === 'viewer-timeout') {
        if (viewerTimeoutRef.current !== null) {
          window.clearTimeout(viewerTimeoutRef.current)
          viewerTimeoutRef.current = null
        }
        setVisibleViewerKind('raw')
        setViewerMode('fallback')
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  const handleViewerLoad = useCallback(() => {
    if (usesPatchedViewer && viewerMode !== 'fallback') {
      return
    }

    if (viewerTimeoutRef.current !== null) {
      window.clearTimeout(viewerTimeoutRef.current)
      viewerTimeoutRef.current = null
    }
    setViewerMode('ready')
  }, [usesPatchedViewer, viewerMode])

  const handleViewerError = useCallback(() => {
    setVisibleViewerKind('raw')
    setViewerMode((current) => (usesPatchedViewer && current !== 'fallback' ? 'fallback' : 'ready'))
  }, [usesPatchedViewer])

  useEffect(() => {
    if (!boardResult) {
      return
    }

    const status = diagramLoadState === 'failed' ? 'failed' : 'active'
    const syncingNote =
      usesPatchedViewer && viewerMode === 'loading'
        ? ' The updated Chess.com viewer is syncing while the board state stays available to chat.'
        : ''
    sendState({
      status,
      summary:
        viewerMode === 'fallback'
          ? `${boardResult.summary} The official viewer fell back to the raw Chess.com embed while the data bridge stays connected.`
          : `${boardResult.summary}${syncingNote}`,
      state: buildStateDigest(boardResult),
    })

    postSidebarDirectIframeStateMessage({
      appId: CHESS_COM_RUNTIME_APP_ID,
      status,
      summary:
        viewerMode === 'fallback'
          ? `${boardResult.summary} Using the raw Chess.com embed fallback.`
          : `${boardResult.summary}${syncingNote}`,
      state: buildStateDigest(boardResult),
    })
  }, [boardResult, diagramLoadState, sendState, usesPatchedViewer, viewerMode])

  useEffect(() => {
    if (!invocationMessage || !runtimeContext) {
      return
    }

    if (diagramLoadState === 'failed') {
      if (lastHandledToolCallIdRef.current === invocationMessage.payload.toolCallId) {
        return
      }

      lastHandledToolCallIdRef.current = invocationMessage.payload.toolCallId
      sendError({
        code: 'load-failed',
        message:
          'Chess.com board data is unavailable. Refresh the board or save a working emboard URL before asking for analysis or moves.',
        recoverable: true,
        details: {
          toolCallId: invocationMessage.payload.toolCallId,
          ...(diagramId ? { diagramId } : {}),
          ...(resolvedEmbedUrl ? { embedUrl: resolvedEmbedUrl } : {}),
        },
      })
      return
    }

    if (!diagramId || !resolvedEmbedUrl || !diagram || !boardPgn) {
      return
    }

    if (lastHandledToolCallIdRef.current === invocationMessage.payload.toolCallId) {
      return
    }

    lastHandledToolCallIdRef.current = invocationMessage.payload.toolCallId

    const workingChess = new Chess()
    try {
      workingChess.loadPgn(boardPgn)
    } catch {
      sendError({
        code: 'invalid-state',
        message: 'Chess.com could not parse the current diagram state.',
        recoverable: true,
        details: {
          toolCallId: invocationMessage.payload.toolCallId,
        },
      })
      return
    }

    const mode = (runtimeContext.initialState?.mode as ChessMode | undefined) ?? 'analysis'

    if (invocationMessage.payload.toolName === exampleChessLaunchToolSchema.name) {
      const completion = buildBoardCompletionSignal({
        conversationId: runtimeContext.conversationId,
        appSessionId: runtimeContext.appSessionId,
        toolCallId: invocationMessage.payload.toolCallId,
        chess: workingChess,
        diagramId,
        embedUrl: resolvedEmbedUrl,
        lastUpdateSource,
        tags: diagram.setup[0]?.tags,
        mode,
      })
      setFeedback('Chess.com is ready. Ask for the best move, a board scan, or a line explanation.')
      sendCompletion(completion)
      return
    }

    if (invocationMessage.payload.toolName === exampleChessGetBoardStateToolSchema.name) {
      const completion = buildBoardCompletionSignal({
        conversationId: runtimeContext.conversationId,
        appSessionId: runtimeContext.appSessionId,
        toolCallId: invocationMessage.payload.toolCallId,
        chess: workingChess,
        diagramId,
        embedUrl: resolvedEmbedUrl,
        lastUpdateSource,
        tags: diagram.setup[0]?.tags,
        mode,
      })
      setFeedback('Scanned the Chess.com board state for chat.')
      sendCompletion(completion)
      return
    }

    if (invocationMessage.payload.toolName === exampleChessMakeMoveToolSchema.name) {
      const requestedMove = invocationMessage.payload.arguments?.move
      if (typeof requestedMove !== 'string' || requestedMove.trim().length === 0) {
        sendError({
          code: 'invalid-request',
          message: 'A Chess.com move request must include a move string.',
          recoverable: true,
          details: {
            toolCallId: invocationMessage.payload.toolCallId,
          },
        })
        return
      }

      const appliedMove = applyRequestedChessMove(workingChess, requestedMove)
      if (!appliedMove) {
        sendError({
          code: 'illegal-move',
          message: `Chess.com could not apply "${requestedMove}" on the current board.`,
          recoverable: true,
          details: {
            toolCallId: invocationMessage.payload.toolCallId,
            requestedMove,
            fen: workingChess.fen(),
          },
        })
        return
      }

      const nextPgn = workingChess.pgn({
        maxWidth: 0,
        newline: '\n',
      })

      setBoardPgn(nextPgn)
      setLastUpdateSource('manual-board-move')
      setVisibleViewerKind('raw')
      setFeedback(`Played ${appliedMove.san} on the Chess.com board. Syncing the updated viewer…`)
      setViewerMode('loading')

      const completion = buildMoveCompletionSignal({
        conversationId: runtimeContext.conversationId,
        appSessionId: runtimeContext.appSessionId,
        toolCallId: invocationMessage.payload.toolCallId,
        requestedMove,
        chess: workingChess,
        diagramId,
        embedUrl: resolvedEmbedUrl,
        tags: diagram.setup[0]?.tags,
        mode,
      })
      sendCompletion(completion)
      return
    }

    sendError({
      code: 'unsupported-tool',
      message: `Chess.com does not support ${invocationMessage.payload.toolName} yet.`,
      recoverable: true,
      details: {
        toolCallId: invocationMessage.payload.toolCallId,
      },
    })
  }, [
    boardPgn,
    diagramLoadState,
    diagram,
    diagramId,
    invocationMessage,
    lastUpdateSource,
    resolvedEmbedUrl,
    runtimeContext,
    sendCompletion,
    sendError,
  ])

  const handleSaveEmbedUrl = useCallback(() => {
    if (!approvedApp) {
      return
    }

    const validationMessage = getLaunchUrlValidationMessage(approvedApp, draftEmbedUrl)
    if (validationMessage) {
      setLaunchConfigError(validationMessage)
      return
    }

    const normalized = normalizeLaunchUrl(approvedApp, draftEmbedUrl)
    persistApprovedAppLaunchOverride(approvedApp.id, normalized || null)
    setSavedEmbedUrl(normalized)
    setDraftEmbedUrl(normalized || '')
    setLaunchConfigError(null)
    setReloadNonce((current) => current + 1)
  }, [approvedApp, draftEmbedUrl])

  const handleResetEmbedUrl = useCallback(() => {
    if (!approvedApp) {
      return
    }

    persistApprovedAppLaunchOverride(approvedApp.id, null)
    setSavedEmbedUrl('')
    setDraftEmbedUrl(approvedApp.integrationConfig?.defaultLaunchUrl || DEFAULT_EMBED_URL)
    setLaunchConfigError(null)
    setReloadNonce((current) => current + 1)
  }, [approvedApp])

  const handleRefresh = useCallback(() => {
    setReloadNonce((current) => current + 1)
  }, [])

  return (
    <Box
      h="100%"
      style={{
        background:
          'radial-gradient(circle at top, rgba(59,130,246,0.18), transparent 28%), linear-gradient(180deg, #0f172a 0%, #111827 100%)',
      }}
    >
      <Stack gap="md" h="100%" p="lg" className="min-h-0">
        <Box className="min-h-0 flex-1 overflow-y-auto pr-1">
          <Stack gap="md" pb="md">
            <Group gap="xs" wrap="wrap">
              <Badge radius="xl" variant="light" color="green">
                Official Chess.com viewer
              </Badge>
              <Badge radius="xl" variant="light" color="blue">
                Tool-connected wrapper
              </Badge>
              {usesPatchedViewer ? (
                <Badge radius="xl" variant="light" color="violet">
                  Synced move replay
                </Badge>
              ) : null}
              {viewerMode === 'fallback' ? (
                <Badge radius="xl" variant="light" color="yellow">
                  Raw embed fallback
                </Badge>
              ) : null}
            </Group>

            <Stack gap={4}>
              <Title order={2} c="white">
                Chess.com
              </Title>
              <Text c="rgba(255,255,255,0.76)">
                ChatBridge keeps the official Chess.com board visible while discovering tools from Chess.com diagram
                data.
              </Text>
            </Stack>

            {diagramLoadState === 'loading' ? (
              <Paper
                radius="xl"
                p="xl"
                style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <Group gap="sm">
                  <Loader size="sm" color="var(--chatbox-tint-brand)" />
                  <Text c="rgba(255,255,255,0.8)">Loading the official Chess.com diagram data…</Text>
                </Group>
              </Paper>
            ) : null}

            {diagramLoadState === 'failed' ? (
              <Alert color="red" radius="xl" title="Chess.com failed to load">
                {feedback}
              </Alert>
            ) : null}

            <Paper
              radius="xl"
              p="md"
              style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <Stack gap="xs">
                <Text size="sm" fw={600} c="white">
                  Live board
                </Text>
                <Text size="sm" c="rgba(255,255,255,0.72)">
                  {feedback}
                </Text>
              </Stack>
            </Paper>

            <Box
              className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0b1120]"
              data-testid="chess-com-official-viewer"
              style={{
                minHeight: 'clamp(420px, 62vh, 720px)',
                height: 'clamp(420px, 62vh, 720px)',
                flexShrink: 0,
              }}
            >
              <iframe
                key={rawViewerKey}
                title={buildShellIframeTitle(diagramId ?? 'unknown')}
                src={resolvedEmbedUrl}
                className={
                  showPatchedViewer
                    ? 'pointer-events-none h-full w-full border-0 bg-white opacity-0'
                    : 'h-full w-full border-0 bg-white'
                }
                sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                allow="clipboard-read; clipboard-write; fullscreen"
                referrerPolicy={approvedApp ? getPreviewReferrerPolicy(approvedApp) : 'strict-origin-when-cross-origin'}
                onLoad={handleViewerLoad}
              />
              {renderPatchedViewer ? (
                <iframe
                  key={patchedViewerKey}
                  title={`${buildShellIframeTitle(diagramId ?? 'unknown')} synced replay`}
                  src={patchedViewerUrl}
                  className={
                    showPatchedViewer
                      ? 'absolute inset-0 h-full w-full border-0 bg-white'
                      : 'pointer-events-none absolute inset-0 h-full w-full border-0 bg-white opacity-0'
                  }
                  sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                  allow="clipboard-read; clipboard-write; fullscreen"
                  referrerPolicy={
                    approvedApp ? getPreviewReferrerPolicy(approvedApp) : 'strict-origin-when-cross-origin'
                  }
                  onError={handleViewerError}
                />
              ) : null}
            </Box>

            <Paper
              radius="xl"
              p="lg"
              style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <Stack gap="sm">
                <Title order={4} c="white">
                  Launch configuration
                </Title>
                <Text size="sm" c="rgba(255,255,255,0.72)">
                  Save a Chess.com emboard URL here. ChatBridge uses the diagram id from that URL to load the official
                  vendor board and discover board-state tooling.
                </Text>
                <TextInput
                  label={approvedApp?.integrationConfig?.launchUrlLabel ?? 'Chess.com emboard URL'}
                  placeholder={approvedApp?.integrationConfig?.launchUrlPlaceholder ?? DEFAULT_EMBED_URL}
                  value={draftEmbedUrl}
                  onChange={(event) => setDraftEmbedUrl(event.currentTarget.value)}
                  error={launchConfigError}
                />
                <Group gap="xs">
                  <Button onClick={handleSaveEmbedUrl}>Save launch URL</Button>
                  <Button variant="subtle" color="gray" onClick={handleResetEmbedUrl}>
                    Reset
                  </Button>
                  <Button variant="light" color="blue" onClick={handleRefresh}>
                    Refresh board
                  </Button>
                </Group>
                <Text size="sm" c="rgba(255,255,255,0.68)">
                  Active source: <code>{resolvedEmbedUrl}</code>
                </Text>
              </Stack>
            </Paper>
          </Stack>
        </Box>
      </Stack>
    </Box>
  )
}
