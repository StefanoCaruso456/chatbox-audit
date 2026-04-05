import {
  type AppManifest,
  type AppSessionAuthState,
  type ChessCoachActionClientData,
  ChessCoachActionClientDataSchema,
  type ConversationAppContext,
  exampleAuthenticatedPlannerManifest,
  exampleChessGetBoardStateToolSchema,
  exampleChessMakeMoveToolSchema,
  exampleFlashcardsStartToolSchema,
  exampleInternalChessManifest,
  examplePublicFlashcardsManifest,
  parseConversationAppContext,
  type ToolSchema,
} from '@shared/contracts/v1'
import type { JsonObject } from '@shared/contracts/v1/shared'
import { createMessage, type Message, type MessageEmbeddedAppPart } from '@shared/types'
import { Chess } from 'chess.js'
import { v4 as uuidv4 } from 'uuid'
import { applyRequestedChessMove, extractRequestedChessMove } from '@/routes/embedded-apps/-components/chess/chessMove'
import {
  getChessSessionHistory,
  getChessSessionSnapshot,
  getLatestChessSessionSnapshotForConversation,
} from '@/stores/chessSessionStore'
import { buildRuntimeTraceId, recordRuntimeTraceSpan } from '@/stores/runtimeTraceStore'
import { enqueueSidebarAppRuntimeCommand } from '@/stores/sidebarAppRuntimeCommandStore'
import { getSidebarAppRuntimeSnapshot, type SidebarAppRuntimeSnapshot } from '@/stores/sidebarAppRuntimeStore'
import { uiStore } from '@/stores/uiStore'
import {
  AvailableToolDiscoveryService,
  type ToolRouteDecision,
  ToolRoutingService,
} from '../../../../backend/orchestration'
import { type AppRegistryRecord, AppRegistryService, InMemoryAppRegistryRepository } from '../../../../backend/registry'
import { type EmbeddedAppReference, selectConversationAppReference } from './conversation-state'

type LocalAppCategory = 'games' | 'study' | 'productivity'

type LocalAppDefinition = {
  routePath: `/embedded-apps/${string}`
  category: LocalAppCategory
  manifest: AppManifest
}

type LocalAppPlatform = {
  registry: AppRegistryService
  discovery: AvailableToolDiscoveryService
  routing: ToolRoutingService
  apps: AppRegistryRecord[]
  appsById: Map<string, AppRegistryRecord>
}

type EmbeddedAppCompletionSnapshot = NonNullable<NonNullable<MessageEmbeddedAppPart['bridge']>['completion']>

type EmbeddedAppSessionStatus = 'pending' | 'active' | 'waiting-auth' | 'waiting-user' | 'completed' | 'failed'

type EmbeddedAppSessionSnapshot = {
  appSessionId: string
  appId: string
  status: EmbeddedAppSessionStatus
  summary: string
  updatedAt: string
  latestSequence: number
  latestStateDigest?: JsonObject
  authState: AppSessionAuthState
  currentToolCallId?: string
  resumableUntil?: string
  availableToolNames?: string[]
  completion?: EmbeddedAppCompletionSnapshot
}

export type TutorMeAiInterceptionResult =
  | {
      kind: 'invoke-tool'
      message: Message
    }
  | {
      kind: 'clarify'
      message: Message
    }
  | {
      kind: 'pass-through'
    }

type RouteTutorMeAiAppRequestInput = {
  origin: string
  conversationId: string
  userId: string
  userRequest: string
  requestMessage?: Message
  requestMessageId: string
  previousMessages: Message[]
}

const localPlatformCache = new Map<string, Promise<LocalAppPlatform>>()
const CHESS_APPROVED_APP_ID = 'chess-tutor'

function getMessageTraceContext(message: Message) {
  const embeddedAppPart = message.contentParts.find(
    (part): part is Extract<(typeof message.contentParts)[number], { type: 'embedded-app' }> =>
      part.type === 'embedded-app'
  )
  if (!embeddedAppPart) {
    return {}
  }

  return {
    appSessionId: embeddedAppPart.bridge?.appSessionId ?? embeddedAppPart.appSessionId,
    runtimeAppId: embeddedAppPart.appId,
    approvedAppId: embeddedAppPart.appId === exampleInternalChessManifest.appId ? CHESS_APPROVED_APP_ID : undefined,
  }
}

function inferToolNameFromMessage(message: Message) {
  const toolCallPart = message.contentParts.find(
    (part): part is Extract<(typeof message.contentParts)[number], { type: 'tool-call' }> => part.type === 'tool-call'
  )
  if (toolCallPart) {
    return toolCallPart.toolName
  }

  const embeddedAppPart = message.contentParts.find(
    (part): part is Extract<(typeof message.contentParts)[number], { type: 'embedded-app' }> =>
      part.type === 'embedded-app'
  )
  return embeddedAppPart?.bridge?.pendingInvocation?.toolName
}

function buildTextPreview(message: Message) {
  const firstTextPart = message.contentParts.find(
    (part): part is Extract<(typeof message.contentParts)[number], { type: 'text' }> => part.type === 'text'
  )
  return firstTextPart?.text.slice(0, 280)
}

function buildTraceTags(...values: Array<string | undefined | null | false>) {
  return values.filter((value): value is string => Boolean(value))
}

function finalizeTutorMeAiInterceptionResult(input: {
  conversationId: string
  userRequest: string
  source: string
  result: TutorMeAiInterceptionResult
  appSessionId?: string
  runtimeAppId?: string
  approvedAppId?: string
  metadata?: JsonObject
}) {
  const messageContext = input.result.kind === 'pass-through' ? {} : getMessageTraceContext(input.result.message)
  const appSessionId = input.appSessionId ?? messageContext.appSessionId
  const runtimeAppId = input.runtimeAppId ?? messageContext.runtimeAppId
  const approvedAppId = input.approvedAppId ?? messageContext.approvedAppId

  recordRuntimeTraceSpan({
    traceId: buildRuntimeTraceId({
      conversationId: input.conversationId,
      appSessionId,
      runtimeAppId,
    }),
    name: `${input.source} agent return`,
    kind: 'agent-return',
    status: input.result.kind === 'pass-through' ? 'skipped' : 'succeeded',
    conversationId: input.conversationId,
    sessionId: input.conversationId,
    appSessionId,
    approvedAppId,
    runtimeAppId,
    actor: {
      layer: 'agent',
      source: 'tutormeai-orchestrator',
    },
    input: input.userRequest,
    output:
      input.result.kind === 'pass-through'
        ? 'No app interception result was returned.'
        : (buildTextPreview(input.result.message) ?? `${input.source} returned ${input.result.kind}.`),
    tags: buildTraceTags('agent-return', 'agent', approvedAppId, runtimeAppId, input.result.kind, input.source),
    agentReturn: {
      kind: input.result.kind,
      toolName: input.result.kind === 'pass-through' ? undefined : inferToolNameFromMessage(input.result.message),
      messageId: input.result.kind === 'pass-through' ? undefined : input.result.message.id,
    },
    metadata: {
      source: input.source,
      userRequest: input.userRequest,
      ...(input.metadata ?? {}),
      ...(input.result.kind === 'pass-through' ? {} : { textPreview: buildTextPreview(input.result.message) }),
    },
  })

  return input.result
}

function recordChessStateSelectionSpan(input: {
  conversationId: string
  appSessionId: string
  selectedSource: string
  selectedResult: ChessBoardStateToolResult | null
  sidebarResult: ChessBoardStateToolResult | null
  sharedResult: ChessBoardStateToolResult | null
  sidebarUpdatedAt?: string
  sharedUpdatedAt?: string
  selectionReason: string
}) {
  recordRuntimeTraceSpan({
    traceId: buildRuntimeTraceId({
      conversationId: input.conversationId,
      appSessionId: input.appSessionId,
      runtimeAppId: exampleInternalChessManifest.appId,
    }),
    name: 'choose freshest chess board state',
    kind: 'state-selection',
    status: input.selectedResult ? 'succeeded' : 'failed',
    conversationId: input.conversationId,
    sessionId: input.conversationId,
    appSessionId: input.appSessionId,
    approvedAppId: CHESS_APPROVED_APP_ID,
    runtimeAppId: exampleInternalChessManifest.appId,
    actor: {
      layer: 'agent',
      source: 'tutormeai-orchestrator',
    },
    input: 'Choose the freshest chess board state for the active conversation.',
    output: input.selectedResult?.summary ?? 'No chess board state was selected.',
    expected: input.selectionReason,
    tags: buildTraceTags(
      'state-selection',
      'agent',
      CHESS_APPROVED_APP_ID,
      exampleInternalChessManifest.appId,
      input.selectedSource
    ),
    state: input.selectedResult
      ? {
          source: input.selectedSource,
          summary: input.selectedResult.summary,
          fen: input.selectedResult.fen,
          moveCount: input.selectedResult.moveCount,
          lastMove: input.selectedResult.lastMove,
          selectedMove: input.selectedResult.recommendedMove ?? undefined,
        }
      : {
          source: input.selectedSource,
        },
    metadata: {
      selectionReason: input.selectionReason,
      ...(typeof input.sidebarResult?.moveCount === 'number'
        ? { sidebarMoveCount: input.sidebarResult.moveCount }
        : {}),
      ...(typeof input.sharedResult?.moveCount === 'number' ? { sharedMoveCount: input.sharedResult.moveCount } : {}),
      ...(input.sidebarUpdatedAt ? { sidebarUpdatedAt: input.sidebarUpdatedAt } : {}),
      ...(input.sharedUpdatedAt ? { sharedUpdatedAt: input.sharedUpdatedAt } : {}),
      ...(input.sidebarResult?.fen ? { sidebarFen: input.sidebarResult.fen } : {}),
      ...(input.sharedResult?.fen ? { sharedFen: input.sharedResult.fen } : {}),
    },
  })
}

function recordChessRuntimeCommandSpan(input: {
  conversationId: string
  appSessionId: string
  requestedMove: string
  expectedFen: string
  status: 'succeeded' | 'failed'
  toolCallId?: string
  moveResult?: ChessMoveToolResult
  errorMessage?: string
  completionStatus?: string
}) {
  recordRuntimeTraceSpan({
    traceId: buildRuntimeTraceId({
      conversationId: input.conversationId,
      appSessionId: input.appSessionId,
      runtimeAppId: exampleInternalChessManifest.appId,
    }),
    name: 'execute chess.make-move runtime command',
    kind: 'runtime-command',
    status: input.status,
    conversationId: input.conversationId,
    sessionId: input.conversationId,
    appSessionId: input.appSessionId,
    approvedAppId: CHESS_APPROVED_APP_ID,
    runtimeAppId: exampleInternalChessManifest.appId,
    actor: {
      layer: 'agent',
      source: 'tutormeai-orchestrator',
    },
    input: `Requested move: ${input.requestedMove}`,
    output: input.moveResult?.summary ?? input.errorMessage ?? 'Chess move command did not return a summary.',
    expected: `Expected FEN before move: ${input.expectedFen}`,
    tags: buildTraceTags(
      'runtime-command',
      'agent',
      CHESS_APPROVED_APP_ID,
      exampleInternalChessManifest.appId,
      exampleChessMakeMoveToolSchema.name
    ),
    state: {
      source: 'sidebar-runtime-command',
      requestedMove: input.requestedMove,
      expectedFen: input.expectedFen,
      summary: input.moveResult?.summary,
      fen: input.moveResult?.fen,
      moveCount: input.moveResult?.moveCount,
      lastMove: input.moveResult?.lastMove,
      selectedMove: input.moveResult?.appliedMove,
    },
    agentReturn: {
      kind: 'invoke-tool',
      toolName: exampleChessMakeMoveToolSchema.name,
      toolCallId: input.toolCallId,
    },
    error: input.errorMessage
      ? {
          message: input.errorMessage,
        }
      : undefined,
    metadata: {
      ...(input.completionStatus ? { completionStatus: input.completionStatus } : {}),
    },
  })
}

function buildLocalManifest(
  origin: string,
  manifest: AppManifest,
  routePath: LocalAppDefinition['routePath']
): AppManifest {
  return {
    ...manifest,
    allowedOrigins: [origin],
    uiEmbedConfig: {
      ...manifest.uiEmbedConfig,
      entryUrl: `${origin}${routePath}`,
      targetOrigin: origin,
    },
    safetyMetadata: {
      ...manifest.safetyMetadata,
      reviewStatus: 'approved',
    },
  }
}

function getLocalAppDefinitions(origin: string): LocalAppDefinition[] {
  return [
    {
      category: 'games',
      routePath: '/embedded-apps/chess',
      manifest: buildLocalManifest(origin, exampleInternalChessManifest, '/embedded-apps/chess'),
    },
    {
      category: 'study',
      routePath: '/embedded-apps/flashcards',
      manifest: buildLocalManifest(origin, examplePublicFlashcardsManifest, '/embedded-apps/flashcards'),
    },
    {
      category: 'productivity',
      routePath: '/embedded-apps/planner',
      manifest: {
        ...buildLocalManifest(origin, exampleAuthenticatedPlannerManifest, '/embedded-apps/planner'),
        slug: 'planner',
      },
    },
  ]
}

async function createLocalAppPlatform(origin: string): Promise<LocalAppPlatform> {
  const repository = new InMemoryAppRegistryRepository()
  const registry = new AppRegistryService(repository)
  const definitions = getLocalAppDefinitions(origin)

  for (const definition of definitions) {
    const result = await registry.registerApp({
      category: definition.category,
      manifest: definition.manifest,
    })

    if (!result.ok) {
      throw new Error(`Failed to register local TutorMeAI app "${definition.manifest.appId}": ${result.message}`)
    }
  }

  const apps = await registry.listApps({ approvedOnly: true })

  return {
    registry,
    discovery: new AvailableToolDiscoveryService(registry),
    routing: new ToolRoutingService(),
    apps,
    appsById: new Map(apps.map((app) => [app.appId, app])),
  }
}

function getLocalAppPlatform(origin: string): Promise<LocalAppPlatform> {
  const normalizedOrigin = origin.trim()
  const existing = localPlatformCache.get(normalizedOrigin)
  if (existing) {
    return existing
  }

  const created = createLocalAppPlatform(normalizedOrigin)
  localPlatformCache.set(normalizedOrigin, created)
  return created
}

function hasSupportedOrigin(origin: string) {
  return /^https?:\/\//i.test(origin)
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ')
}

function hasLaunchIntent(userRequest: string): boolean {
  const normalized = normalizeComparable(userRequest)
  const launchKeywords = [
    'play',
    'start',
    'launch',
    'open',
    'use',
    'show',
    'check',
    'connect',
    'resume',
    'flashcards',
    'flashcard',
    'study',
    'quiz',
    'review',
    'vocabulary',
    'chess',
    'planner',
    'dashboard',
  ]

  return launchKeywords.some((keyword) => normalized.includes(keyword))
}

function extractFlashcardTopic(userRequest: string): string {
  const phraseMatch = userRequest.match(/\b(?:about|for|on)\s+([A-Za-z][A-Za-z\s,.-]{1,48})$/u)
  if (phraseMatch?.[1]) {
    return phraseMatch[1].trim().replace(/[?.!]+$/u, '')
  }

  const flashcardsMatch = userRequest.match(/\b(?:flashcards|quiz me|study)\s+([A-Za-z][A-Za-z\s,.-]{1,48})$/iu)
  if (flashcardsMatch?.[1]) {
    return flashcardsMatch[1].trim().replace(/[?.!]+$/u, '')
  }

  return 'fractions'
}

function extractPlannerFocus(userRequest: string): 'today' | 'week' | 'overdue' {
  const normalized = normalizeComparable(userRequest)
  if (normalized.includes('overdue') || normalized.includes('late')) {
    return 'overdue'
  }
  if (normalized.includes('week') || normalized.includes('weekly')) {
    return 'week'
  }
  return 'today'
}

function formatChessTurn(turn: 'w' | 'b') {
  return turn === 'w' ? 'White' : 'Black'
}

function inferChessPhase(chess: Chess) {
  const pieces = chess.board().flat().filter(Boolean).length
  const fullMoveNumber = Number.parseInt(chess.fen().split(/\s+/u)[5] ?? '1', 10)

  if (pieces <= 12) {
    return 'Endgame'
  }

  if (fullMoveNumber <= 6) {
    return 'Opening'
  }

  return 'Middlegame'
}

function buildChessCandidateMoves(chess: Chess) {
  return buildChessCandidateMoveRecommendations(chess).map((move) => move.san)
}

function buildChessCandidateMoveRecommendations(chess: Chess) {
  return chess
    .moves({ verbose: true })
    .map((move) => {
      let score = 0
      let reason = 'keeps your pieces active and your position flexible'

      if (move.san.includes('#')) {
        score += 100
        reason = 'ends the game immediately with checkmate'
      } else if (move.san.includes('+')) {
        score += 24
        reason = 'checks the king and forces an immediate response'
      } else if (move.flags.includes('k') || move.flags.includes('q')) {
        score += 16
        reason = 'improves king safety by castling'
      } else if (move.flags.includes('c')) {
        score += 14
        reason = 'wins material or improves the material balance'
      } else if (move.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(move.to)) {
        score += 10
        reason = 'claims central space and opens lines for development'
      } else if ((move.piece === 'n' || move.piece === 'b') && ['c3', 'f3', 'c6', 'f6'].includes(move.to)) {
        score += 8
        reason = 'develops a minor piece to an active square'
      }

      return {
        san: move.san,
        score,
        reason,
      }
    })
    .sort((left, right) => right.score - left.score || left.san.localeCompare(right.san))
    .slice(0, 6)
}

function describeChessStatus(chess: Chess) {
  if (chess.isCheckmate()) {
    return 'Checkmate'
  }

  if (chess.isStalemate()) {
    return 'Stalemate'
  }

  if (chess.isDraw()) {
    return 'Draw'
  }

  if (chess.inCheck()) {
    return `${formatChessTurn(chess.turn())} is in check`
  }

  return 'Position is stable'
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toJsonObject(value: unknown): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined
}

function extractBoundChessCoachAction(message?: Message): ChessCoachActionClientData | null {
  if (!message?.clientData) {
    return null
  }

  const parsedAction = ChessCoachActionClientDataSchema.safeParse(message.clientData)
  return parsedAction.success ? parsedAction.data : null
}

function isChessMoveHistoryIntent(userRequest: string) {
  const normalized = normalizeComparable(userRequest)
  const historyPhrases = [
    'move history',
    'moves so far',
    'move list',
    'last five moves',
    'last 5 moves',
    'last few moves',
    'last piece',
    'piece you moved',
    'last thing you moved',
    'what did you move',
    'what was the last piece',
    'what was the last move you made',
  ]

  return historyPhrases.some((phrase) => normalized.includes(phrase))
}

function isChessBoardReadIntent(userRequest: string) {
  const normalized = normalizeComparable(userRequest)
  const boardPhrases = [
    'board',
    'position',
    'fen',
    'state',
    'legal move',
    'legal moves',
    'analy',
    'best move',
    'next move',
    'my next move',
    'what should be my next move',
    'what should my next move be',
    'what should i do',
    'whose turn',
    'white to move',
    'black to move',
    'last move',
    'recent move',
    'last piece',
    'piece you moved',
    'move history',
    'moves so far',
    'move list',
    'last five moves',
    'last 5 moves',
    'see the board',
    'current game',
    'alternative',
    'alternatives',
    'tradeoff',
    'tradeoffs',
    'explain',
    'why ',
    'teach',
    'coach',
    'beginner',
    'strategy',
    'strategic',
    'plan',
    'compare',
  ]

  return boardPhrases.some((phrase) => normalized.includes(phrase))
}

function isChessStrategyExplanationIntent(userRequest: string) {
  const normalized = normalizeComparable(userRequest)
  const explanationPhrases = [
    'alternative',
    'alternatives',
    'tradeoff',
    'tradeoffs',
    'explain',
    'why',
    'teach',
    'idea',
    'ideas',
    'plan',
    'compare',
    'beginner',
    'strategy',
    'strategic',
    'best practice',
  ]

  return explanationPhrases.some((phrase) => normalized.includes(phrase))
}

function isBareChessMoveRequest(userRequest: string) {
  const trimmed = userRequest.trim().replace(/[.!?]+$/u, '')
  const extractedMove = extractRequestedChessMove(trimmed)
  if (!extractedMove) {
    return false
  }

  return normalizeComparable(trimmed) === normalizeComparable(extractedMove)
}

function isChessMoveIntent(userRequest: string) {
  const normalized = normalizeComparable(userRequest)

  if (isChessMoveHistoryIntent(userRequest)) {
    return false
  }

  const extractedMove = extractRequestedChessMove(userRequest)
  const moveKeywordPattern = /\b(move|moved|castle|capture|take|advance|push|play|execute)\b/u
  const pieceKeywords = ['piece', 'pawn', 'rook', 'knight', 'bishop', 'queen', 'king']
  const hasExplicitMoveVerb = moveKeywordPattern.test(normalized)

  if (isChessStrategyExplanationIntent(userRequest) && !hasExplicitMoveVerb && !isBareChessMoveRequest(userRequest)) {
    return false
  }

  if (extractedMove) {
    return hasExplicitMoveVerb || isBareChessMoveRequest(userRequest)
  }

  if (
    hasExplicitMoveVerb &&
    (/[a-h][1-8]\s*(?:to|-)\s*[a-h][1-8]/iu.test(userRequest) || /\b[a-h][1-8][a-h][1-8]\b/iu.test(userRequest))
  ) {
    return true
  }

  return hasExplicitMoveVerb && pieceKeywords.some((keyword) => normalized.includes(keyword))
}

function isChessSuggestedMoveFollowUpIntent(userRequest: string) {
  const normalized = normalizeComparable(userRequest)
  const confirmationPhrases = [
    'do it',
    'do it now',
    'do that',
    'do that now',
    'make it',
    'make it now',
    'make the move',
    'make the move now',
    'make that move',
    'play it',
    'play it now',
    'play that',
    'play that now',
    'execute it',
    'execute it now',
    'go ahead',
    'lets do that',
    'let s do that',
  ]

  return confirmationPhrases.some((phrase) => normalized.includes(phrase))
}

function shouldUseChessBoardStateTool(userRequest: string) {
  return isChessBoardReadIntent(userRequest) || isChessMoveIntent(userRequest)
}

type ChessBoardStateToolResult = {
  appSessionId: string
  fen: string
  turn: 'white' | 'black'
  moveCount: number
  lastMove: string
  moveHistory: string[]
  legalMoveCount: number
  legalMoves: string[]
  candidateMoves: string[]
  phase: string
  status: string
  summary: string
  moveExecutionAvailable: boolean
  recommendedMove: string | null
  recommendationReason: string | null
  coachingTip: string | null
  alternativeMoves: string[]
  mode?: string
}

type ChessMoveToolResult = {
  appSessionId: string
  requestedMove: string
  appliedMove: string
  fen: string
  turn: 'white' | 'black'
  moveCount: number
  lastMove: string
  legalMoveCount: number
  candidateMoves: string[]
  summary: string
  explanation: string
  moveExecutionAvailable: boolean
  coachingTip: string | null
  strategicTheme: string | null
  alternativeMoves: string[]
}

type ChessBoardStateSource = {
  appSessionId: string
  summary?: string
  latestStateDigest?: JsonObject
  moveHistory?: string[]
  availableToolNames?: string[]
}

function buildChessStateDigestFromSharedSession(input: {
  fen: string
  turn: 'w' | 'b'
  moveCount: number
  lastMove: string
  lastUpdateSource?: string
  mode?: string
}): JsonObject {
  return {
    fen: input.fen,
    turn: input.turn,
    moveCount: input.moveCount,
    ...(input.lastMove !== 'No moves yet' ? { lastMove: input.lastMove } : {}),
    ...(input.lastUpdateSource ? { lastUpdateSource: input.lastUpdateSource } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
  }
}

function buildChessBoardStateSourceFromSharedSession(input: {
  conversationId: string
  appSessionId: string
  availableToolNames?: string[]
}): ChessBoardStateSource | null {
  const sharedSnapshot =
    getChessSessionSnapshot(input.conversationId, input.appSessionId) ??
    getLatestChessSessionSnapshotForConversation(input.conversationId)

  if (!sharedSnapshot) {
    return null
  }

  return {
    appSessionId: sharedSnapshot.appSessionId,
    summary: sharedSnapshot.summary,
    latestStateDigest: buildChessStateDigestFromSharedSession({
      fen: sharedSnapshot.fen,
      turn: sharedSnapshot.turn,
      moveCount: sharedSnapshot.moveCount,
      lastMove: sharedSnapshot.lastMove,
      lastUpdateSource: sharedSnapshot.lastUpdateSource,
      mode: sharedSnapshot.mode,
    }),
    moveHistory: getChessSessionHistory(input.conversationId, sharedSnapshot.appSessionId),
    availableToolNames: input.availableToolNames,
  }
}

function buildLiveChessBoardStateResult(input: {
  conversationId: string
  appSessionId: string
  summary?: string
  latestStateDigest?: JsonObject
  availableToolNames?: string[]
}): ChessBoardStateToolResult | null {
  const sharedSource = buildChessBoardStateSourceFromSharedSession({
    conversationId: input.conversationId,
    appSessionId: input.appSessionId,
    availableToolNames: input.availableToolNames,
  })

  return buildChessBoardStateResult(
    sharedSource ?? {
      appSessionId: input.appSessionId,
      summary: input.summary,
      latestStateDigest: input.latestStateDigest,
      availableToolNames: input.availableToolNames,
    }
  )
}

function buildChessBoardStateResult(source: ChessBoardStateSource): ChessBoardStateToolResult | null {
  const stateDigest = source.latestStateDigest
  if (!isJsonObject(stateDigest)) {
    return null
  }

  const fenValue =
    typeof stateDigest.fen === 'string'
      ? stateDigest.fen
      : typeof stateDigest.boardState === 'string'
        ? stateDigest.boardState
        : null

  if (!fenValue) {
    return null
  }

  let chess: Chess
  try {
    chess = new Chess(fenValue)
  } catch {
    return null
  }

  const legalMoves = chess.moves()
  const moveCount =
    typeof stateDigest.moveCount === 'number' && Number.isFinite(stateDigest.moveCount) ? stateDigest.moveCount : 0
  const candidateMoves = buildChessCandidateMoves(chess)
  const phase = inferChessPhase(chess)
  const turn = chess.turn() === 'w' ? 'white' : 'black'
  const recommendedMove = candidateMoves[0] ?? null

  return {
    appSessionId: source.appSessionId,
    fen: chess.fen(),
    turn,
    moveCount,
    lastMove:
      typeof stateDigest.lastMove === 'string' && stateDigest.lastMove.trim().length > 0
        ? stateDigest.lastMove
        : 'No moves yet',
    moveHistory:
      source.moveHistory?.filter((move): move is string => typeof move === 'string' && move.trim().length > 0) ?? [],
    legalMoveCount: legalMoves.length,
    legalMoves: legalMoves.slice(0, 20),
    candidateMoves,
    phase,
    status: describeChessStatus(chess),
    summary:
      typeof source.summary === 'string' && source.summary.trim().length > 0
        ? source.summary
        : `Current board FEN: ${chess.fen()}. ${formatChessTurn(chess.turn())} to move.`,
    moveExecutionAvailable: source.availableToolNames?.includes(exampleChessMakeMoveToolSchema.name) ?? false,
    recommendedMove,
    recommendationReason: recommendedMove ? buildChessMoveExplanation(recommendedMove) : null,
    coachingTip: recommendedMove ? buildChessCoachingTip(recommendedMove, phase, turn) : null,
    alternativeMoves: candidateMoves.slice(1, 3),
    ...(typeof stateDigest.mode === 'string' ? { mode: stateDigest.mode } : {}),
  }
}

function buildInitialChessBoardStateResult(input: {
  appSessionId: string
  mode?: string
  moveExecutionAvailable: boolean
}): ChessBoardStateToolResult {
  const chess = new Chess()
  const candidateMoves = buildChessCandidateMoves(chess)
  const recommendedMove = candidateMoves[0] ?? null

  return {
    appSessionId: input.appSessionId,
    fen: chess.fen(),
    turn: 'white',
    moveCount: 0,
    lastMove: 'No moves yet',
    moveHistory: [],
    legalMoveCount: chess.moves().length,
    legalMoves: chess.moves().slice(0, 20),
    candidateMoves,
    phase: inferChessPhase(chess),
    status: describeChessStatus(chess),
    summary: `Current board FEN: ${chess.fen()}. White to move.`,
    moveExecutionAvailable: input.moveExecutionAvailable,
    recommendedMove,
    recommendationReason: recommendedMove ? buildChessMoveExplanation(recommendedMove) : null,
    coachingTip: recommendedMove ? buildChessCoachingTip(recommendedMove, 'Opening', 'white') : null,
    alternativeMoves: candidateMoves.slice(1, 3),
    ...(input.mode ? { mode: input.mode } : {}),
  }
}

function buildChessLiveBoardSummary(result: ChessBoardStateToolResult) {
  return `Current live Chess board: ${result.turn === 'white' ? 'White' : 'Black'} to move. ${result.status}. Last move: ${result.lastMove}.`
}

function describeChessMovedPiece(lastMove: string) {
  if (!lastMove || lastMove === 'No moves yet') {
    return 'no piece yet'
  }

  if (lastMove.startsWith('O-O')) {
    return 'king (castling)'
  }

  switch (lastMove[0]) {
    case 'K':
      return 'king'
    case 'Q':
      return 'queen'
    case 'R':
      return 'rook'
    case 'B':
      return 'bishop'
    case 'N':
      return 'knight'
    default:
      return 'pawn'
  }
}

function buildChessHistoryText(result: ChessBoardStateToolResult, userRequest: string) {
  const normalized = normalizeComparable(userRequest)
  const boardSummary = buildChessLiveBoardSummary(result)

  if (result.moveHistory.length === 0 || result.lastMove === 'No moves yet') {
    return `No moves have been played on the live Chess board yet. ${boardSummary}`
  }

  if (
    normalized.includes('last piece') ||
    normalized.includes('piece you moved') ||
    normalized.includes('last thing you moved') ||
    normalized.includes('what did you move') ||
    normalized.includes('what was the last move you made')
  ) {
    return `The last move on the live Chess board was ${result.lastMove}, so the last piece moved was a ${describeChessMovedPiece(result.lastMove)}. ${boardSummary}`
  }

  const requestedMoveCount =
    normalized.includes('last five moves') ||
    normalized.includes('last 5 moves') ||
    normalized.includes('last few moves')
      ? 5
      : Math.min(5, result.moveHistory.length)
  const recentMoves = result.moveHistory.slice(-requestedMoveCount)

  return `The last ${recentMoves.length} move${recentMoves.length === 1 ? '' : 's'} on the live Chess board ${recentMoves.length === 1 ? 'is' : 'are'}: ${recentMoves.join(', ')}. ${boardSummary}`
}

function buildChessBoardStateText(result: ChessBoardStateToolResult, userRequest: string) {
  const sharedSummary = buildChessLiveBoardSummary(result)
  const recommendation = result.recommendedMove
    ? ` Recommended next move: ${result.recommendedMove}. Why now: it ${result.recommendationReason}.`
    : ''
  const coachingTip = result.coachingTip ? ` Coach note: ${result.coachingTip}` : ''
  const alternatives =
    result.alternativeMoves.length > 0 ? ` Alternatives to compare: ${result.alternativeMoves.join(', ')}.` : ''

  if (isChessMoveHistoryIntent(userRequest)) {
    return buildChessHistoryText(result, userRequest)
  }

  if (isChessMoveIntent(userRequest) && !result.moveExecutionAvailable) {
    return `I can read the live Chess board now, but direct move execution from chat is not wired yet. ${sharedSummary}${recommendation}${coachingTip}${alternatives}`
  }

  return `${sharedSummary}${recommendation}${coachingTip}${alternatives}`
}

function buildChessMoveToolResult(completionResult: JsonObject): ChessMoveToolResult | null {
  const requiredStringFields = [
    'appSessionId',
    'requestedMove',
    'appliedMove',
    'fen',
    'turn',
    'lastMove',
    'summary',
    'explanation',
  ]
  for (const field of requiredStringFields) {
    if (typeof completionResult[field] !== 'string' || completionResult[field].trim().length === 0) {
      return null
    }
  }

  if (
    typeof completionResult.moveCount !== 'number' ||
    typeof completionResult.legalMoveCount !== 'number' ||
    typeof completionResult.moveExecutionAvailable !== 'boolean' ||
    !Array.isArray(completionResult.candidateMoves)
  ) {
    return null
  }

  if (completionResult.turn !== 'white' && completionResult.turn !== 'black') {
    return null
  }

  let phase = 'middlegame'
  try {
    phase = inferChessPhase(new Chess(completionResult.fen))
  } catch {
    phase = 'middlegame'
  }

  const candidateMoves = completionResult.candidateMoves.filter((move): move is string => typeof move === 'string')
  const sideThatMoved = completionResult.turn === 'white' ? 'black' : 'white'

  return {
    appSessionId: completionResult.appSessionId,
    requestedMove: completionResult.requestedMove,
    appliedMove: completionResult.appliedMove,
    fen: completionResult.fen,
    turn: completionResult.turn,
    moveCount: completionResult.moveCount,
    lastMove: completionResult.lastMove,
    legalMoveCount: completionResult.legalMoveCount,
    candidateMoves,
    summary: completionResult.summary,
    explanation: completionResult.explanation,
    moveExecutionAvailable: completionResult.moveExecutionAvailable,
    coachingTip: buildChessCoachingTip(completionResult.appliedMove, phase, sideThatMoved),
    strategicTheme: buildChessStrategicTheme(completionResult.appliedMove, phase),
    alternativeMoves: candidateMoves.slice(0, 3),
  }
}

function buildChessMoveResultText(result: ChessMoveToolResult) {
  const strategicTheme = result.strategicTheme ? ` Strategic theme: ${result.strategicTheme}.` : ''
  const coachingTip = result.coachingTip ? ` Coach note: ${result.coachingTip}` : ''
  const nextMoveHint =
    result.alternativeMoves.length > 0 ? ` Typical replies to compare: ${result.alternativeMoves.join(', ')}.` : ''
  return `${result.summary} Why it works: ${result.explanation}.${strategicTheme}${coachingTip}${nextMoveHint}`
}

function extractSuggestedChessMoveCandidate(text: string) {
  const prefixedCoordinateMatch = text.match(
    /\b[KQRBN]?([a-h][1-8])\s*(?:to|-)\s*([a-h][1-8])(?:\s*=?\s*([qrbnQRBN]))?\b/u
  )
  if (prefixedCoordinateMatch) {
    const [, from, to, promotion = ''] = prefixedCoordinateMatch
    return `${from}${to}${promotion}`.toLowerCase()
  }

  return extractRequestedChessMove(text)
}

function extractSuggestedChessMoveFromAssistantText(text: string) {
  const anchorPatterns = [
    /recommended next move\s*:/iu,
    /the move i(?:'m| am) choosing(?: for (?:white|black))?(?: is still| is)?\s*:?/iu,
    /i choose for (?:white|black)\s*:?/iu,
    /i(?:'ll| will) play(?: [^:\n]*)?\s*:?/iu,
    /notation\s*:/iu,
  ]

  for (const pattern of anchorPatterns) {
    const match = pattern.exec(text)
    if (!match) {
      continue
    }

    const tail = text.slice(match.index + match[0].length)
    const nonEmptyLines = tail
      .split(/\r?\n/iu)
      .map((line) => line.trim())
      .filter(Boolean)

    for (const line of nonEmptyLines.slice(0, 6)) {
      const move = extractSuggestedChessMoveCandidate(line)
      if (move) {
        return move
      }
    }

    const inlineMove = extractSuggestedChessMoveCandidate(tail.slice(0, 120))
    if (inlineMove) {
      return inlineMove
    }
  }

  return null
}

function extractLastSuggestedChessMove(previousMessages: Message[]) {
  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const message = previousMessages[index]
    if (message?.role !== 'assistant') {
      continue
    }

    const textParts = message.contentParts
      .filter((part): part is Extract<(typeof message.contentParts)[number], { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
    const textMove = extractSuggestedChessMoveFromAssistantText(textParts)
    if (textMove) {
      return textMove
    }

    for (const part of message.contentParts) {
      if (
        part.type !== 'tool-call' ||
        part.toolName !== exampleChessGetBoardStateToolSchema.name ||
        part.state !== 'result'
      ) {
        continue
      }

      const boardStateResult = buildChessBoardStateResult({
        appSessionId: 'assistant-recommendation',
        latestStateDigest: toJsonObject(part.result),
        availableToolNames: [exampleChessMakeMoveToolSchema.name],
      })
      const structuredMove = boardStateResult?.candidateMoves[0]
      if (structuredMove) {
        return structuredMove
      }
    }
  }

  return null
}

function hasInteractiveChessLaunchPrompt(previousMessages: Message[], appSessionId: string) {
  return previousMessages.some((message) => {
    if (message.role !== 'assistant') {
      return false
    }

    const hasMatchingEmbeddedApp = message.contentParts.some(
      (part) => part.type === 'embedded-app' && (part.bridge?.appSessionId ?? part.appSessionId) === appSessionId
    )
    if (!hasMatchingEmbeddedApp) {
      return false
    }

    return message.contentParts.some(
      (part) => part.type === 'tool-call' && part.toolName === exampleChessGetBoardStateToolSchema.name
    )
  })
}

function selectRequestedChessMove(
  userRequest: string,
  boardState: ChessBoardStateToolResult,
  requestedMoveOverride?: string
) {
  return requestedMoveOverride ?? extractRequestedChessMove(userRequest) ?? boardState.candidateMoves[0] ?? null
}

function validateRequestedChessMove(boardState: ChessBoardStateToolResult, requestedMove: string) {
  const validationChess = new Chess(boardState.fen)
  return applyRequestedChessMove(validationChess, requestedMove)
}

async function attemptSidebarChessMove(input: {
  conversationId: string
  appSessionId: string
  boardState: ChessBoardStateToolResult
  requestedMove: string
}): Promise<
  | {
      ok: true
      toolCallId: string
      moveResult: ChessMoveToolResult
    }
  | {
      ok: false
      error: string
    }
> {
  const toolCallId = `tool-call.chess.make-move.${uuidv4()}`
  const commandResult = await enqueueSidebarAppRuntimeCommand({
    hostSessionId: input.conversationId,
    runtimeAppId: exampleInternalChessManifest.appId,
    appSessionId: input.appSessionId,
    toolCallId,
    toolName: exampleChessMakeMoveToolSchema.name,
    arguments: {
      move: input.requestedMove,
      expectedFen: input.boardState.fen,
    },
    timeoutMs: exampleChessMakeMoveToolSchema.timeoutMs,
    createdAt: new Date().toISOString(),
  })

  if (!commandResult.ok) {
    recordChessRuntimeCommandSpan({
      conversationId: input.conversationId,
      appSessionId: input.appSessionId,
      requestedMove: input.requestedMove,
      expectedFen: input.boardState.fen,
      status: 'failed',
      toolCallId,
      errorMessage: commandResult.error,
      completionStatus: 'enqueue-failed',
    })
    return {
      ok: false,
      error: commandResult.error,
    }
  }

  if (commandResult.completion.status !== 'succeeded') {
    recordChessRuntimeCommandSpan({
      conversationId: input.conversationId,
      appSessionId: input.appSessionId,
      requestedMove: input.requestedMove,
      expectedFen: input.boardState.fen,
      status: 'failed',
      toolCallId,
      errorMessage: commandResult.completion.resultSummary,
      completionStatus: commandResult.completion.status,
    })
    return {
      ok: false,
      error: commandResult.completion.resultSummary,
    }
  }

  const completionResult = toJsonObject(commandResult.completion.result)
  if (!completionResult) {
    recordChessRuntimeCommandSpan({
      conversationId: input.conversationId,
      appSessionId: input.appSessionId,
      requestedMove: input.requestedMove,
      expectedFen: input.boardState.fen,
      status: 'failed',
      toolCallId,
      errorMessage: 'Chess Tutor responded, but the move result was not machine-readable.',
      completionStatus: 'invalid-result-payload',
    })
    return {
      ok: false,
      error: 'Chess Tutor responded, but the move result was not machine-readable.',
    }
  }

  const moveResult = buildChessMoveToolResult(completionResult)
  if (!moveResult) {
    recordChessRuntimeCommandSpan({
      conversationId: input.conversationId,
      appSessionId: input.appSessionId,
      requestedMove: input.requestedMove,
      expectedFen: input.boardState.fen,
      status: 'failed',
      toolCallId,
      errorMessage: 'Chess Tutor responded, but the move result was missing required board details.',
      completionStatus: 'missing-required-board-details',
    })
    return {
      ok: false,
      error: 'Chess Tutor responded, but the move result was missing required board details.',
    }
  }

  recordChessRuntimeCommandSpan({
    conversationId: input.conversationId,
    appSessionId: input.appSessionId,
    requestedMove: input.requestedMove,
    expectedFen: input.boardState.fen,
    status: 'succeeded',
    toolCallId,
    moveResult,
    completionStatus: commandResult.completion.status,
  })
  return {
    ok: true,
    toolCallId,
    moveResult,
  }
}

function buildChessMoveAssistantMessage(input: {
  toolCallId: string
  boardState: ChessBoardStateToolResult
  requestedMove: string
  moveResult: ChessMoveToolResult
}) {
  const message = createMessage('assistant')
  message.contentParts = [
    {
      type: 'tool-call',
      state: 'result',
      toolCallId: input.toolCallId,
      toolName: exampleChessMakeMoveToolSchema.name,
      args: {
        move: input.requestedMove,
        expectedFen: input.boardState.fen,
      },
      result: input.moveResult,
    },
    {
      type: 'text',
      text: buildChessMoveResultText(input.moveResult),
    },
  ]
  message.generating = false
  message.status = []
  return message
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

function buildChessStrategicTheme(moveSan: string, phase: string) {
  const normalized = moveSan.toLowerCase()

  if (normalized === 'e4' || normalized === 'd4' || normalized === 'e5' || normalized === 'd5') {
    return 'fight for the center and open lines for rapid development'
  }

  if (normalized === 'nf3' || normalized === 'nc3' || normalized === 'nf6' || normalized === 'nc6') {
    return 'develop pieces before starting direct attacks'
  }

  if (moveSan === 'O-O' || moveSan === 'O-O-O') {
    return 'improve king safety before expanding elsewhere'
  }

  if (moveSan.includes('x')) {
    return 'improve the position while changing the material balance'
  }

  if (phase === 'opening') {
    return 'improve development and coordination without creating early weaknesses'
  }

  if (phase === 'middlegame') {
    return 'improve piece activity and create useful pressure'
  }

  return 'play purposeful moves that improve coordination and reduce counterplay'
}

function buildChessCoachingTip(moveSan: string, phase: string, sideToCoach: 'white' | 'black') {
  const normalized = moveSan.toLowerCase()

  if (normalized === 'e4' || normalized === 'd4' || normalized === 'e5' || normalized === 'd5') {
    return `In the ${phase}, ${sideToCoach} usually wants central space first so the bishops and knights have better squares next.`
  }

  if (normalized === 'nf3' || normalized === 'nc3' || normalized === 'nf6' || normalized === 'nc6') {
    return `A good habit for ${sideToCoach} is to bring knights out before launching flank pawns, because development keeps the position flexible.`
  }

  if (moveSan === 'O-O' || moveSan === 'O-O-O') {
    return `When the center can open soon, ${sideToCoach} should value king safety and rook connection over grabbing extra space.`
  }

  if (moveSan.includes('x')) {
    return `Before exchanging, ${sideToCoach} should ask whether the capture improves piece activity or simply helps the opponent.`
  }

  if (phase === 'opening') {
    return `A strong opening habit for ${sideToCoach} is to develop, fight for the center, and avoid moving the same piece twice without a reason.`
  }

  if (phase === 'middlegame') {
    return `In the middlegame, ${sideToCoach} should compare plans, not just moves, and prefer the move that improves the worst-placed piece.`
  }

  return `In the endgame, ${sideToCoach} should favor moves that activate the king and create clear targets or passed pawns.`
}

function buildChessBoardStateMessage(input: {
  conversationId: string
  reference: EmbeddedAppReference
  userRequest: string
}): Message | null {
  const result = buildLiveChessBoardStateResult({
    conversationId: input.conversationId,
    appSessionId: input.reference.appSessionId,
    summary: input.reference.part.summary,
    latestStateDigest:
      toJsonObject(input.reference.part.bridge?.completion?.result) ??
      input.reference.part.bridge?.bootstrap?.initialState,
    availableToolNames: input.reference.part.bridge?.bootstrap?.availableTools?.map((tool) => tool.name),
  })
  if (!result) {
    return null
  }

  const message = createMessage('assistant')
  message.contentParts = [
    {
      type: 'tool-call',
      state: 'result',
      toolCallId: `tool-call.chess.get-board-state.${uuidv4()}`,
      toolName: exampleChessGetBoardStateToolSchema.name,
      args: {
        scope: 'current-position',
      },
      result,
    },
    {
      type: 'text',
      text: buildChessBoardStateText(result, input.userRequest),
    },
  ]
  message.generating = false
  message.status = []
  return message
}

function buildChessBoardStateMessageFromSharedSession(input: {
  conversationId: string
  userRequest: string
  moveExecutionAvailable?: boolean
}): Message | null {
  const sharedSnapshot = getLatestChessSessionSnapshotForConversation(input.conversationId)
  if (!sharedSnapshot) {
    return null
  }

  const result = buildChessBoardStateResult({
    appSessionId: sharedSnapshot.appSessionId,
    summary: sharedSnapshot.summary,
    latestStateDigest: buildChessStateDigestFromSharedSession({
      fen: sharedSnapshot.fen,
      turn: sharedSnapshot.turn,
      moveCount: sharedSnapshot.moveCount,
      lastMove: sharedSnapshot.lastMove,
      mode: sharedSnapshot.mode,
    }),
    moveHistory: getChessSessionHistory(input.conversationId, sharedSnapshot.appSessionId),
    availableToolNames: input.moveExecutionAvailable ? [exampleChessMakeMoveToolSchema.name] : [],
  })
  if (!result) {
    return null
  }

  const message = createMessage('assistant')
  message.contentParts = [
    {
      type: 'tool-call',
      state: 'result',
      toolCallId: `tool-call.chess.get-board-state.${uuidv4()}`,
      toolName: exampleChessGetBoardStateToolSchema.name,
      args: {
        scope: 'current-position',
      },
      result,
    },
    {
      type: 'text',
      text: buildChessBoardStateText(result, input.userRequest),
    },
  ]
  message.generating = false
  message.status = []
  return message
}

function buildPreferredChessBoardStateResultForSidebarSnapshot(snapshot: SidebarAppRuntimeSnapshot) {
  const sidebarResult = buildChessBoardStateResult({
    appSessionId: snapshot.appSessionId,
    summary: snapshot.summary,
    latestStateDigest: snapshot.latestStateDigest,
    availableToolNames: snapshot.availableToolNames,
  })

  const sharedSnapshot =
    getChessSessionSnapshot(snapshot.hostSessionId, snapshot.appSessionId) ??
    getLatestChessSessionSnapshotForConversation(snapshot.hostSessionId)

  const sharedResult = sharedSnapshot
    ? buildChessBoardStateResult({
        appSessionId: sharedSnapshot.appSessionId,
        summary: sharedSnapshot.summary,
        latestStateDigest: buildChessStateDigestFromSharedSession({
          fen: sharedSnapshot.fen,
          turn: sharedSnapshot.turn,
          moveCount: sharedSnapshot.moveCount,
          lastMove: sharedSnapshot.lastMove,
          lastUpdateSource: sharedSnapshot.lastUpdateSource,
          mode: sharedSnapshot.mode,
        }),
        moveHistory: getChessSessionHistory(snapshot.hostSessionId, sharedSnapshot.appSessionId),
        availableToolNames: snapshot.availableToolNames,
      })
    : null

  if (!sidebarResult) {
    recordChessStateSelectionSpan({
      conversationId: snapshot.hostSessionId,
      appSessionId: snapshot.appSessionId,
      selectedSource: sharedResult ? 'shared-chess-session' : 'no-chess-state-available',
      selectedResult: sharedResult,
      sidebarResult,
      sharedResult,
      sidebarUpdatedAt: snapshot.updatedAt,
      sharedUpdatedAt: sharedSnapshot?.updatedAt,
      selectionReason: sharedResult
        ? 'sidebar snapshot was unreadable'
        : 'no sidebar or shared chess state was readable',
    })
    return sharedResult
  }

  if (!sharedResult || !sharedSnapshot) {
    recordChessStateSelectionSpan({
      conversationId: snapshot.hostSessionId,
      appSessionId: snapshot.appSessionId,
      selectedSource: 'sidebar-runtime-snapshot',
      selectedResult: sidebarResult,
      sidebarResult,
      sharedResult,
      sidebarUpdatedAt: snapshot.updatedAt,
      sharedUpdatedAt: sharedSnapshot?.updatedAt,
      selectionReason: sharedResult
        ? 'shared snapshot was unavailable for comparison'
        : 'shared chess session unavailable',
    })
    return sidebarResult
  }

  if (sidebarResult.moveCount !== sharedResult.moveCount) {
    const selectedResult = sidebarResult.moveCount > sharedResult.moveCount ? sidebarResult : sharedResult
    recordChessStateSelectionSpan({
      conversationId: snapshot.hostSessionId,
      appSessionId: snapshot.appSessionId,
      selectedSource: selectedResult === sidebarResult ? 'sidebar-runtime-snapshot' : 'shared-chess-session',
      selectedResult,
      sidebarResult,
      sharedResult,
      sidebarUpdatedAt: snapshot.updatedAt,
      sharedUpdatedAt: sharedSnapshot.updatedAt,
      selectionReason: 'preferred the source with the higher move count',
    })
    return selectedResult
  }

  const sidebarUpdatedAtMs = Date.parse(snapshot.updatedAt)
  const sharedUpdatedAtMs = Date.parse(sharedSnapshot.updatedAt)
  if (
    Number.isFinite(sidebarUpdatedAtMs) &&
    Number.isFinite(sharedUpdatedAtMs) &&
    sidebarUpdatedAtMs !== sharedUpdatedAtMs
  ) {
    const selectedResult = sidebarUpdatedAtMs > sharedUpdatedAtMs ? sidebarResult : sharedResult
    recordChessStateSelectionSpan({
      conversationId: snapshot.hostSessionId,
      appSessionId: snapshot.appSessionId,
      selectedSource: selectedResult === sidebarResult ? 'sidebar-runtime-snapshot' : 'shared-chess-session',
      selectedResult,
      sidebarResult,
      sharedResult,
      sidebarUpdatedAt: snapshot.updatedAt,
      sharedUpdatedAt: sharedSnapshot.updatedAt,
      selectionReason: 'preferred the source with the newer updatedAt timestamp',
    })
    return selectedResult
  }

  recordChessStateSelectionSpan({
    conversationId: snapshot.hostSessionId,
    appSessionId: snapshot.appSessionId,
    selectedSource: 'sidebar-runtime-snapshot',
    selectedResult: sidebarResult,
    sidebarResult,
    sharedResult,
    sidebarUpdatedAt: snapshot.updatedAt,
    sharedUpdatedAt: sharedSnapshot.updatedAt,
    selectionReason: 'defaulted to the sidebar snapshot after equivalent freshness checks',
  })
  return sidebarResult
}

function buildChessBoardStateMessageFromSidebarSnapshot(
  snapshot: SidebarAppRuntimeSnapshot,
  userRequest: string
): Message | null {
  const result = buildPreferredChessBoardStateResultForSidebarSnapshot(snapshot)
  if (!result) {
    return null
  }

  const message = createMessage('assistant')
  message.contentParts = [
    {
      type: 'tool-call',
      state: 'result',
      toolCallId: `tool-call.chess.get-board-state.${uuidv4()}`,
      toolName: exampleChessGetBoardStateToolSchema.name,
      args: {
        scope: 'current-position',
      },
      result,
    },
    {
      type: 'text',
      text: buildChessBoardStateText(result, userRequest),
    },
  ]
  message.generating = false
  message.status = []
  return message
}

async function buildChessMoveMessageFromBoardState(input: {
  conversationId: string
  appSessionId: string
  boardState: ChessBoardStateToolResult
  userRequest: string
  requestedMoveOverride?: string
}): Promise<Extract<TutorMeAiInterceptionResult, { kind: 'invoke-tool' | 'clarify' }> | null> {
  if (!input.boardState.moveExecutionAvailable) {
    return null
  }

  const requestedMove = selectRequestedChessMove(input.userRequest, input.boardState, input.requestedMoveOverride)
  if (!requestedMove) {
    return null
  }

  const previewMove = validateRequestedChessMove(input.boardState, requestedMove)
  if (!previewMove) {
    return {
      kind: 'clarify',
      message: buildClarificationMessage(
        `"${requestedMove}" is not a legal move from the current live Chess position.`
      ),
    }
  }

  const commandResult = await attemptSidebarChessMove({
    conversationId: input.conversationId,
    appSessionId: input.appSessionId,
    boardState: input.boardState,
    requestedMove,
  })

  if (commandResult.ok) {
    return {
      kind: 'invoke-tool',
      message: buildChessMoveAssistantMessage({
        toolCallId: commandResult.toolCallId,
        boardState: input.boardState,
        requestedMove,
        moveResult: commandResult.moveResult,
      }),
    }
  }

  if (commandResult.error.includes('The chess board changed before the requested move could be applied.')) {
    const refreshedSnapshot = getSidebarAppRuntimeSnapshot(input.conversationId, exampleInternalChessManifest.appId)
    const refreshedBoardState = buildLiveChessBoardStateResult({
      conversationId: input.conversationId,
      appSessionId: refreshedSnapshot?.appSessionId ?? input.appSessionId,
      summary: refreshedSnapshot?.summary ?? input.boardState.summary,
      latestStateDigest:
        refreshedSnapshot?.latestStateDigest ??
        buildChessStateDigestFromSharedSession({
          fen: input.boardState.fen,
          turn: input.boardState.turn === 'white' ? 'w' : 'b',
          moveCount: input.boardState.moveCount,
          lastMove: input.boardState.lastMove,
          mode: input.boardState.mode,
        }),
      availableToolNames: refreshedSnapshot?.availableToolNames ?? [exampleChessMakeMoveToolSchema.name],
    })

    if (
      refreshedBoardState &&
      refreshedBoardState.moveExecutionAvailable &&
      refreshedBoardState.fen !== input.boardState.fen
    ) {
      const refreshedRequestedMove = selectRequestedChessMove(
        input.userRequest,
        refreshedBoardState,
        input.requestedMoveOverride
      )
      if (refreshedRequestedMove) {
        const refreshedPreviewMove = validateRequestedChessMove(refreshedBoardState, refreshedRequestedMove)
        if (refreshedPreviewMove) {
          const retryResult = await attemptSidebarChessMove({
            conversationId: input.conversationId,
            appSessionId: refreshedBoardState.appSessionId,
            boardState: refreshedBoardState,
            requestedMove: refreshedRequestedMove,
          })

          if (retryResult.ok) {
            return {
              kind: 'invoke-tool',
              message: buildChessMoveAssistantMessage({
                toolCallId: retryResult.toolCallId,
                boardState: refreshedBoardState,
                requestedMove: refreshedRequestedMove,
                moveResult: retryResult.moveResult,
              }),
            }
          }

          return {
            kind: 'clarify',
            message: buildClarificationMessage(
              `Chess Tutor is open, but it did not confirm the move. ${retryResult.error}`
            ),
          }
        }
      }
    }
  }

  return {
    kind: 'clarify',
    message: buildClarificationMessage(`Chess Tutor is open, but it did not confirm the move. ${commandResult.error}`),
  }
}

async function buildChessMoveMessageFromBoundCoachAction(input: {
  conversationId: string
  userRequest: string
  action: ChessCoachActionClientData
}): Promise<Extract<TutorMeAiInterceptionResult, { kind: 'invoke-tool' | 'clarify' }> | null> {
  const boardState = buildChessBoardStateResult({
    appSessionId: input.action.appSessionId,
    summary: input.action.boardState.summary,
    latestStateDigest: buildChessStateDigestFromSharedSession({
      fen: input.action.boardState.fen,
      turn: input.action.boardState.turn === 'white' ? 'w' : 'b',
      moveCount: input.action.boardState.moveCount,
      lastMove: input.action.boardState.lastMove,
      mode: input.action.boardState.mode,
    }),
    availableToolNames: input.action.boardState.moveExecutionAvailable ? [exampleChessMakeMoveToolSchema.name] : [],
  })

  if (!boardState) {
    return null
  }

  recordChessStateSelectionSpan({
    conversationId: input.conversationId,
    appSessionId: input.action.appSessionId,
    selectedSource: 'bound-chess-coach-action',
    selectedResult: boardState,
    sidebarResult: null,
    sharedResult: null,
    selectionReason: 'used the exact board snapshot attached to the clicked chess coach action',
  })

  return buildChessMoveMessageFromBoardState({
    conversationId: input.conversationId,
    appSessionId: input.action.appSessionId,
    boardState,
    userRequest: input.userRequest,
    requestedMoveOverride: input.action.requestedMove,
  })
}

async function buildChessMoveMessageFromSidebarSnapshot(
  snapshot: SidebarAppRuntimeSnapshot,
  input: {
    conversationId: string
    userRequest: string
    requestedMoveOverride?: string
  }
): Promise<Extract<TutorMeAiInterceptionResult, { kind: 'invoke-tool' | 'clarify' }> | null> {
  const boardState = buildPreferredChessBoardStateResultForSidebarSnapshot(snapshot)
  if (!boardState) {
    return null
  }

  return buildChessMoveMessageFromBoardState({
    conversationId: input.conversationId,
    boardState,
    appSessionId: snapshot.appSessionId,
    userRequest: input.userRequest,
    requestedMoveOverride: input.requestedMoveOverride,
  })
}

async function buildChessMoveMessageFromReference(
  reference: EmbeddedAppReference,
  input: {
    conversationId: string
    userRequest: string
    requestedMoveOverride?: string
  }
): Promise<Extract<TutorMeAiInterceptionResult, { kind: 'invoke-tool' | 'clarify' }> | null> {
  const boardState = buildLiveChessBoardStateResult({
    conversationId: input.conversationId,
    appSessionId: reference.appSessionId,
    summary: reference.part.summary,
    latestStateDigest:
      toJsonObject(reference.part.bridge?.completion?.result) ?? reference.part.bridge?.bootstrap?.initialState,
    availableToolNames: reference.part.bridge?.bootstrap?.availableTools?.map((tool) => tool.name) ?? [
      exampleChessMakeMoveToolSchema.name,
    ],
  })
  if (!boardState) {
    return null
  }

  return buildChessMoveMessageFromBoardState({
    conversationId: input.conversationId,
    appSessionId: reference.appSessionId,
    boardState,
    userRequest: input.userRequest,
    requestedMoveOverride: input.requestedMoveOverride,
  })
}

function buildToolArguments(tool: ToolSchema, userRequest: string): JsonObject {
  if (tool.name === 'chess.launch-game') {
    return {
      mode: normalizeComparable(userRequest).includes('analysis') ? 'analysis' : 'practice',
    }
  }

  if (tool.name === exampleChessGetBoardStateToolSchema.name) {
    return {
      scope: 'current-position',
    }
  }

  if (tool.name === exampleChessMakeMoveToolSchema.name) {
    return {
      move: extractRequestedChessMove(userRequest) ?? '',
    }
  }

  if (tool.name === exampleFlashcardsStartToolSchema.name) {
    return {
      topic: extractFlashcardTopic(userRequest),
    }
  }

  if (tool.name === 'planner.open-dashboard') {
    return {
      focus: extractPlannerFocus(userRequest),
    }
  }

  return {}
}

function buildSandboxValue(manifest: AppManifest): string | undefined {
  const sandboxTokens = ['allow-scripts']

  if (manifest.uiEmbedConfig.sandbox.allowForms) {
    sandboxTokens.push('allow-forms')
  }

  if (manifest.uiEmbedConfig.sandbox.allowPopups) {
    sandboxTokens.push('allow-popups')
  }

  if (manifest.uiEmbedConfig.sandbox.allowSameOrigin) {
    sandboxTokens.push('allow-same-origin')
  }

  return sandboxTokens.join(' ')
}

function inferPartAuthState(part: MessageEmbeddedAppPart): AppSessionAuthState {
  const stateFromBootstrap = part.bridge?.bootstrap?.authState
  if (stateFromBootstrap) {
    return stateFromBootstrap
  }

  if (part.bridge?.completion && part.bridge.completion.status === 'succeeded') {
    return 'connected'
  }

  return 'not-required'
}

function getMessageTimestampIso(message: Message, fallbackIso: string): string {
  const timestamp = message.updatedAt ?? message.timestamp
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return fallbackIso
  }

  return new Date(timestamp).toISOString()
}

function classifyEmbeddedAppSession(part: MessageEmbeddedAppPart): EmbeddedAppSessionStatus {
  if (part.bridge?.completion) {
    return 'completed'
  }

  if (part.status === 'error') {
    return 'failed'
  }

  const authState = part.bridge?.bootstrap?.authState
  if (authState === 'required' || authState === 'expired') {
    return 'waiting-auth'
  }

  if (part.bridge?.pendingInvocation) {
    return part.status === 'loading' ? 'pending' : 'active'
  }

  return 'waiting-user'
}

function buildEmbeddedAppSessionSnapshot(
  part: MessageEmbeddedAppPart,
  updatedAt: string,
  latestSequence: number
): EmbeddedAppSessionSnapshot | null {
  const appSessionId = part.bridge?.appSessionId ?? part.appSessionId
  if (!appSessionId) {
    return null
  }

  const completion = part.bridge?.completion
  const summary = part.summary ?? completion?.resultSummary ?? `${part.appName} is active in chat.`
  const latestStateDigest = completion?.result ?? part.bridge?.bootstrap?.initialState ?? undefined
  const authState = inferPartAuthState(part)
  const status = classifyEmbeddedAppSession(part)

  return {
    appSessionId,
    appId: part.appId,
    status,
    summary,
    updatedAt,
    latestSequence,
    latestStateDigest,
    authState,
    currentToolCallId: part.bridge?.pendingInvocation?.toolCallId,
    resumableUntil: undefined,
    availableToolNames: part.bridge?.bootstrap?.availableTools?.map((tool) => tool.name),
    completion,
  }
}

function collectEmbeddedAppSessions(previousMessages: Message[], generatedAt: string): EmbeddedAppSessionSnapshot[] {
  const sessions = new Map<string, EmbeddedAppSessionSnapshot>()
  let latestSequence = 0

  for (const message of previousMessages) {
    const updatedAt = getMessageTimestampIso(message, generatedAt)

    for (const part of message.contentParts ?? []) {
      if (part.type !== 'embedded-app') {
        continue
      }

      const snapshot = buildEmbeddedAppSessionSnapshot(part, updatedAt, ++latestSequence)
      if (!snapshot) {
        continue
      }

      sessions.delete(snapshot.appSessionId)
      sessions.set(snapshot.appSessionId, snapshot)
    }
  }

  return [...sessions.values()]
}

function toConversationAppContext(
  conversationId: string,
  sessions: EmbeddedAppSessionSnapshot[],
  generatedAt: string,
  preferredAppSessionId?: string | null
): ConversationAppContext | null {
  if (sessions.length === 0) {
    return null
  }

  const preferredSession = preferredAppSessionId
    ? (sessions.find((session) => session.appSessionId === preferredAppSessionId) ?? null)
    : null
  const activeSession =
    (preferredSession && preferredSession.status !== 'completed' && preferredSession.status !== 'failed'
      ? preferredSession
      : null) ??
    [...sessions].reverse().find((session) => session.status !== 'completed' && session.status !== 'failed')
  let sessionTimeline = sessions.slice(-20)
  if (activeSession && !sessionTimeline.some((session) => session.appSessionId === activeSession.appSessionId)) {
    sessionTimeline = [...sessionTimeline.slice(-19), activeSession]
  }
  sessionTimeline = sessionTimeline.slice(-20).sort((left, right) => left.latestSequence - right.latestSequence)
  const timelineIds = sessionTimeline.map((session) => session.appSessionId)

  const timeline = sessionTimeline.map((session) => ({
    appSessionId: session.appSessionId,
    appId: session.appId,
    status: session.status,
    summary: session.summary,
    updatedAt: session.updatedAt,
    latestSequence: session.latestSequence,
    latestStateDigest: session.latestStateDigest,
  }))

  const recentCompletions = [...sessions]
    .reverse()
    .filter((session) => session.completion || session.status === 'failed')
    .slice(0, 10)
    .map((session) => {
      const completion = session.completion as EmbeddedAppCompletionSnapshot | undefined
      return {
        appSessionId: session.appSessionId,
        appId: session.appId,
        status: completion?.status ?? ('failed' as const),
        resultSummary: completion?.resultSummary ?? session.summary,
        completedAt: session.updatedAt,
        followUpContext: {
          summary: completion?.resultSummary ?? session.summary,
          userVisibleSummary: session.summary,
          stateDigest: completion?.result ?? session.latestStateDigest,
        },
      }
    })

  const includedSessionIds = [
    ...(activeSession ? [activeSession.appSessionId] : []),
    ...recentCompletions.map((completion) => completion.appSessionId),
    ...timelineIds,
  ].filter((sessionId, index, all) => all.indexOf(sessionId) === index)

  return parseConversationAppContext({
    version: 'v1',
    conversationId,
    generatedAt,
    activeApp: activeSession
      ? {
          appSessionId: activeSession.appSessionId,
          appId: activeSession.appId,
          status: activeSession.status,
          summary: activeSession.summary,
          updatedAt: activeSession.updatedAt,
          latestSequence: activeSession.latestSequence,
          latestStateDigest: activeSession.latestStateDigest,
          authState: activeSession.authState,
          currentToolCallId: activeSession.currentToolCallId,
          resumableUntil: activeSession.resumableUntil,
          availableToolNames: activeSession.availableToolNames,
        }
      : null,
    recentCompletions,
    sessionTimeline: timeline,
    selection: {
      strategy: activeSession ? 'active-plus-recent-completions' : 'recent-completions-only',
      includedSessionIds,
      omittedSessionCount: 0,
    },
    notes:
      sessions.length > 1
        ? [
            'Multiple app sessions were used in this conversation. Keep the active session first and preserve completed sessions as follow-up context.',
            ...(preferredSession
              ? [
                  `The latest user turn explicitly referenced ${preferredSession.appId}, so that session should be prioritized.`,
                ]
              : []),
          ]
        : undefined,
  })
}

export function deriveConversationAppContext(
  conversationId: string,
  previousMessages: Message[],
  generatedAt: string,
  userRequest?: string
): ConversationAppContext | null {
  const sessions = collectEmbeddedAppSessions(previousMessages, generatedAt)
  const selectedReference = userRequest ? selectConversationAppReference(previousMessages, userRequest) : null
  return toConversationAppContext(conversationId, sessions, generatedAt, selectedReference?.appSessionId)
}

function deriveAppOAuthStates(previousMessages: Message[]): Record<string, 'connected' | 'expired' | 'missing'> {
  const states: Record<string, 'connected' | 'expired' | 'missing'> = {}

  for (const message of previousMessages) {
    for (const part of message.contentParts ?? []) {
      if (part.type !== 'embedded-app') {
        continue
      }

      const authState = inferPartAuthState(part)
      if (authState === 'connected') {
        states[part.appId] = 'connected'
      } else if (authState === 'expired') {
        states[part.appId] = 'expired'
      } else if (!states[part.appId]) {
        states[part.appId] = 'missing'
      }
    }
  }

  return states
}

function shouldInterceptInvoke(decision: Extract<ToolRouteDecision, { kind: 'invoke-tool' }>, userRequest: string) {
  if (hasLaunchIntent(userRequest)) {
    return true
  }

  return decision.routingSignals.some((signal) =>
    ['exact-tool-name', 'exact-tool-display-name', 'exact-app-name', 'exact-app-slug'].includes(signal)
  )
}

function buildClarificationMessage(text: string): Message {
  const message = createMessage('assistant', text)
  message.generating = false
  message.status = []
  return message
}

function buildLaunchCopy(appName: string, authState: AppSessionAuthState) {
  if (authState === 'required') {
    return `Opening ${appName} in the right sidebar. You'll need to connect your account before the app can finish the request.`
  }

  return `Launching ${appName} in the right sidebar.`
}

function buildChessLaunchCopy(result: ChessBoardStateToolResult) {
  const recommendedMove = result.recommendedMove ?? 'd4'
  const reason = result.recommendationReason ?? 'claims the center and gets your pieces into the game'
  return `Chess Tutor is on the board. Ready to play some chess? I’d start with ${recommendedMove} because it ${reason}. Tap Play ${recommendedMove} and I’ll coach you move by move.`
}

export function buildChessApprovedAppKickoffToolCallId(appSessionId: string) {
  const normalizedAppSessionId = appSessionId.replace(/[^a-zA-Z0-9._-]+/g, '-')
  return `tool-call.chess.get-board-state.kickoff.${normalizedAppSessionId}`
}

export function buildChessApprovedAppKickoffMessage(input: {
  eventId: string
  appSessionId: string
  summary: string
  latestStateDigest?: JsonObject
  availableToolNames: string[]
}): Message | null {
  const result = buildChessBoardStateResult({
    appSessionId: input.appSessionId,
    summary: input.summary,
    latestStateDigest: input.latestStateDigest,
    availableToolNames: input.availableToolNames,
  })
  if (!result) {
    return null
  }

  const message = createMessage('assistant', buildChessLaunchCopy(result))
  message.contentParts = [
    {
      type: 'tool-call',
      state: 'result',
      toolCallId: buildChessApprovedAppKickoffToolCallId(input.appSessionId),
      toolName: exampleChessGetBoardStateToolSchema.name,
      args: {
        scope: 'current-position',
      },
      result,
    },
    {
      type: 'text',
      text: buildChessLaunchCopy(result),
    },
  ]
  message.generating = false
  message.status = []
  return message
}

export function buildChessObservedBoardStateToolCallId(appSessionId: string, moveCount: number) {
  const normalizedAppSessionId = appSessionId.replace(/[^a-zA-Z0-9._-]+/g, '-')
  return `tool-call.chess.get-board-state.observe.${normalizedAppSessionId}.${moveCount}`
}

function buildChessObservedBoardCopy(result: ChessBoardStateToolResult) {
  const recommendedMove = result.recommendedMove
  const turn = result.turn === 'white' ? 'White' : 'Black'
  const reason = recommendedMove && result.recommendationReason ? ` because it ${result.recommendationReason}` : ''

  if (!recommendedMove) {
    return `I saw ${result.lastMove} on the board. ${turn} to move now. Ask me for the best plan from here and I’ll coach the next idea.`
  }

  return `I saw ${result.lastMove} on the board. ${turn} to move now, and I’d recommend ${recommendedMove}${reason}. Tap Play ${recommendedMove} and I’ll keep coaching move by move.`
}

export function buildChessObservedBoardStateMessage(input: {
  appSessionId: string
  summary: string
  latestStateDigest?: JsonObject
  availableToolNames: string[]
}): Message | null {
  const result = buildChessBoardStateResult({
    appSessionId: input.appSessionId,
    summary: input.summary,
    latestStateDigest: input.latestStateDigest,
    availableToolNames: input.availableToolNames,
  })
  if (!result || result.moveCount === 0 || result.lastMove === 'No moves yet') {
    return null
  }

  const text = buildChessObservedBoardCopy(result)
  const message = createMessage('assistant', text)
  message.contentParts = [
    {
      type: 'tool-call',
      state: 'result',
      toolCallId: buildChessObservedBoardStateToolCallId(input.appSessionId, result.moveCount),
      toolName: exampleChessGetBoardStateToolSchema.name,
      args: {
        scope: 'current-position',
      },
      result,
    },
    {
      type: 'text',
      text,
    },
  ]
  message.generating = false
  message.status = []
  return message
}

function buildEmbeddedAppMessagePart(input: {
  app: AppRegistryRecord
  conversationId: string
  userRequest: string
  tool: ToolSchema
  toolArguments: JsonObject
  authState: AppSessionAuthState
}): MessageEmbeddedAppPart {
  const manifest = input.app.currentVersion.manifest
  const appSessionId = `app-session.${input.app.slug}.${uuidv4()}`
  const toolCallId = `tool-call.${input.app.slug}.${uuidv4()}`
  const correlationId = `corr.${input.app.slug}.${uuidv4()}`
  const expectedOrigin = manifest.uiEmbedConfig.targetOrigin
  const launchSummary =
    input.authState === 'required'
      ? `Connect ${input.app.name} to continue with ${input.tool.displayName ?? input.tool.name}.`
      : `${input.app.name} is preparing ${input.tool.displayName ?? input.tool.name}.`
  const initialState: JsonObject = {
    requestedByUser: input.userRequest,
    toolName: input.tool.name,
    toolArguments: input.toolArguments,
  }

  if (input.tool.name === 'chess.launch-game') {
    const startingChess = new Chess()
    const requestedMode = typeof input.toolArguments.mode === 'string' ? input.toolArguments.mode : undefined
    initialState.fen = startingChess.fen()
    initialState.turn = startingChess.turn()
    initialState.moveCount = 0
    initialState.lastMove = 'No moves yet'
    if (requestedMode) {
      initialState.mode = requestedMode
    }
  }

  return {
    type: 'embedded-app',
    appId: input.app.appId,
    appName: input.app.name,
    appSessionId,
    sourceUrl: manifest.uiEmbedConfig.entryUrl,
    title: input.app.name,
    summary: launchSummary,
    status: 'loading',
    minHeight: manifest.uiEmbedConfig.preferredSize?.defaultHeight ?? 520,
    aspectRatio: undefined,
    sandbox: buildSandboxValue(manifest),
    allowedOrigin: expectedOrigin,
    bridge: {
      expectedOrigin,
      conversationId: input.conversationId,
      appSessionId,
      handshakeToken: `runtime.${input.app.slug}.${uuidv4()}`,
      heartbeatTimeoutMs: input.tool.timeoutMs,
      bootstrap: {
        launchReason: 'chat-tool',
        authState: input.authState,
        grantedPermissions: manifest.permissions,
        messageId: `bootstrap.${input.app.slug}.${uuidv4()}`,
        correlationId,
        initialState,
        availableTools: manifest.toolDefinitions,
      },
      pendingInvocation: {
        toolCallId,
        toolName: input.tool.name,
        arguments: input.toolArguments,
        timeoutMs: input.tool.timeoutMs,
        messageId: `invoke.${input.app.slug}.${uuidv4()}`,
        correlationId,
      },
    },
  }
}

function buildChessLaunchCoachParts(input: {
  appSessionId: string
  mode?: string
  moveExecutionAvailable: boolean
}): Message['contentParts'] {
  const result = buildInitialChessBoardStateResult({
    appSessionId: input.appSessionId,
    mode: input.mode,
    moveExecutionAvailable: input.moveExecutionAvailable,
  })

  return [
    {
      type: 'tool-call',
      state: 'result',
      toolCallId: `tool-call.chess.get-board-state.${uuidv4()}`,
      toolName: exampleChessGetBoardStateToolSchema.name,
      args: {
        scope: 'current-position',
      },
      result,
    },
    {
      type: 'text',
      text: buildChessLaunchCopy(result),
    },
  ]
}

function buildLaunchMessage(input: {
  app: AppRegistryRecord
  conversationId: string
  userRequest: string
  tool: ToolSchema
  toolArguments: JsonObject
  authState: AppSessionAuthState
}): Message {
  const embeddedAppPart = buildEmbeddedAppMessagePart(input)
  const launchText =
    input.app.appId === exampleInternalChessManifest.appId && input.authState === 'connected'
      ? null
      : buildLaunchCopy(input.app.name, input.authState)
  const launchMessage = createMessage('assistant', launchText ?? '')
  const chessLaunchCoachParts =
    input.app.appId === exampleInternalChessManifest.appId &&
    input.authState === 'connected' &&
    input.tool.name === 'chess.launch-game'
      ? buildChessLaunchCoachParts({
          appSessionId: embeddedAppPart.appSessionId,
          mode: typeof input.toolArguments.mode === 'string' ? input.toolArguments.mode : undefined,
          moveExecutionAvailable: true,
        })
      : []

  launchMessage.contentParts = [
    ...(launchText
      ? [
          {
            type: 'text' as const,
            text: launchText,
          },
        ]
      : []),
    ...chessLaunchCoachParts,
    embeddedAppPart,
  ]
  launchMessage.generating = false
  launchMessage.status = []
  return launchMessage
}

function findAuthGatedAppMatch(
  userRequest: string,
  apps: AppRegistryRecord[],
  appOAuthStates: Record<string, 'connected' | 'expired' | 'missing'>
) {
  const normalized = normalizeComparable(userRequest)
  return apps.find((app) => {
    if (app.authType !== 'oauth2') {
      return false
    }

    if (appOAuthStates[app.appId] === 'connected') {
      return false
    }

    return normalized.includes(normalizeComparable(app.name)) || normalized.includes(normalizeComparable(app.slug))
  })
}

export async function routeTutorMeAiAppRequest(
  input: RouteTutorMeAiAppRequestInput
): Promise<TutorMeAiInterceptionResult> {
  if (!hasSupportedOrigin(input.origin)) {
    return finalizeTutorMeAiInterceptionResult({
      conversationId: input.conversationId,
      userRequest: input.userRequest,
      source: 'route.unsupported-origin',
      result: { kind: 'pass-through' },
    })
  }

  const platform = await getLocalAppPlatform(input.origin)
  const generatedAt = new Date().toISOString()
  const normalizedRequest = normalizeComparable(input.userRequest)
  const activeAppContext = deriveConversationAppContext(
    input.conversationId,
    input.previousMessages,
    generatedAt,
    input.userRequest
  )
  const selectedReference = selectConversationAppReference(input.previousMessages, input.userRequest)
  const activeSidebarChessSnapshot = getSidebarAppRuntimeSnapshot(
    input.conversationId,
    exampleInternalChessManifest.appId
  )
  const chessSidebarIsOpen = uiStore.getState().activeApprovedAppId === 'chess-tutor'
  const chessSuggestedMoveFollowUpIntent = isChessSuggestedMoveFollowUpIntent(input.userRequest)
  const boundChessCoachAction = extractBoundChessCoachAction(input.requestMessage)
  const hasActiveChessContext =
    Boolean(activeSidebarChessSnapshot) ||
    chessSidebarIsOpen ||
    selectedReference?.appId === exampleInternalChessManifest.appId
  const suggestedChessMove = chessSuggestedMoveFollowUpIntent
    ? extractLastSuggestedChessMove(input.previousMessages)
    : null

  if (shouldUseChessBoardStateTool(input.userRequest) || (chessSuggestedMoveFollowUpIntent && hasActiveChessContext)) {
    if (isChessMoveIntent(input.userRequest) || chessSuggestedMoveFollowUpIntent) {
      if (boundChessCoachAction) {
        const moveMessage = await buildChessMoveMessageFromBoundCoachAction({
          conversationId: input.conversationId,
          userRequest: input.userRequest,
          action: boundChessCoachAction,
        })
        if (moveMessage) {
          return finalizeTutorMeAiInterceptionResult({
            conversationId: input.conversationId,
            userRequest: input.userRequest,
            source: 'chess.move.from-bound-coach-action',
            appSessionId: boundChessCoachAction.appSessionId,
            runtimeAppId: exampleInternalChessManifest.appId,
            approvedAppId: CHESS_APPROVED_APP_ID,
            result: moveMessage,
          })
        }
      }

      if (chessSuggestedMoveFollowUpIntent && !suggestedChessMove) {
        return finalizeTutorMeAiInterceptionResult({
          conversationId: input.conversationId,
          userRequest: input.userRequest,
          source: 'chess.follow-up-move.missing-suggestion',
          appSessionId: activeSidebarChessSnapshot?.appSessionId ?? selectedReference?.appSessionId,
          runtimeAppId: exampleInternalChessManifest.appId,
          approvedAppId: CHESS_APPROVED_APP_ID,
          result: {
            kind: 'clarify',
            message: buildClarificationMessage(
              'Chess Tutor is open, but I do not know which recommendation you want me to play. Say the move explicitly, for example "play Nf6".'
            ),
          },
        })
      }

      if (activeSidebarChessSnapshot) {
        const moveMessage = await buildChessMoveMessageFromSidebarSnapshot(activeSidebarChessSnapshot, {
          conversationId: input.conversationId,
          userRequest: input.userRequest,
          requestedMoveOverride: suggestedChessMove ?? undefined,
        })
        if (moveMessage) {
          return finalizeTutorMeAiInterceptionResult({
            conversationId: input.conversationId,
            userRequest: input.userRequest,
            source: 'chess.move.from-sidebar-snapshot',
            appSessionId: activeSidebarChessSnapshot.appSessionId,
            runtimeAppId: exampleInternalChessManifest.appId,
            approvedAppId: CHESS_APPROVED_APP_ID,
            result: moveMessage,
          })
        }
      }

      if (
        selectedReference?.appId === exampleInternalChessManifest.appId &&
        hasInteractiveChessLaunchPrompt(input.previousMessages, selectedReference.appSessionId)
      ) {
        const moveMessage = await buildChessMoveMessageFromReference(selectedReference, {
          conversationId: input.conversationId,
          userRequest: input.userRequest,
          requestedMoveOverride: suggestedChessMove ?? undefined,
        })
        if (moveMessage) {
          return finalizeTutorMeAiInterceptionResult({
            conversationId: input.conversationId,
            userRequest: input.userRequest,
            source: 'chess.move.from-embedded-reference',
            appSessionId: selectedReference.appSessionId,
            runtimeAppId: exampleInternalChessManifest.appId,
            approvedAppId: CHESS_APPROVED_APP_ID,
            result: moveMessage,
          })
        }
      }

      if (hasActiveChessContext) {
        return finalizeTutorMeAiInterceptionResult({
          conversationId: input.conversationId,
          userRequest: input.userRequest,
          source: 'chess.move.missing-live-board-state',
          appSessionId: activeSidebarChessSnapshot?.appSessionId ?? selectedReference?.appSessionId,
          runtimeAppId: exampleInternalChessManifest.appId,
          approvedAppId: CHESS_APPROVED_APP_ID,
          result: {
            kind: 'clarify',
            message: buildClarificationMessage(
              'Chess Tutor is open, but move execution needs the live right-sidebar board state. Keep the sidebar open, wait for the board to finish syncing, and then try the move again.'
            ),
          },
        })
      }
    }

    const boardStateMessage = activeSidebarChessSnapshot
      ? buildChessBoardStateMessageFromSidebarSnapshot(activeSidebarChessSnapshot, input.userRequest)
      : selectedReference?.appId === exampleInternalChessManifest.appId
        ? buildChessBoardStateMessage({
            conversationId: input.conversationId,
            reference: selectedReference,
            userRequest: input.userRequest,
          })
        : buildChessBoardStateMessageFromSharedSession({
            conversationId: input.conversationId,
            userRequest: input.userRequest,
            moveExecutionAvailable: chessSidebarIsOpen,
          })

    if (boardStateMessage) {
      return finalizeTutorMeAiInterceptionResult({
        conversationId: input.conversationId,
        userRequest: input.userRequest,
        source: activeSidebarChessSnapshot
          ? 'chess.board-state.from-sidebar-snapshot'
          : selectedReference?.appId === exampleInternalChessManifest.appId
            ? 'chess.board-state.from-embedded-reference'
            : 'chess.board-state.from-shared-session',
        appSessionId: activeSidebarChessSnapshot?.appSessionId ?? selectedReference?.appSessionId,
        runtimeAppId: exampleInternalChessManifest.appId,
        approvedAppId: CHESS_APPROVED_APP_ID,
        result: {
          kind: 'invoke-tool',
          message: boardStateMessage,
        },
      })
    }

    if (
      activeSidebarChessSnapshot ||
      chessSidebarIsOpen ||
      selectedReference?.appId === exampleInternalChessManifest.appId
    ) {
      return finalizeTutorMeAiInterceptionResult({
        conversationId: input.conversationId,
        userRequest: input.userRequest,
        source: 'chess.board-state.not-readable-yet',
        appSessionId: activeSidebarChessSnapshot?.appSessionId ?? selectedReference?.appSessionId,
        runtimeAppId: exampleInternalChessManifest.appId,
        approvedAppId: CHESS_APPROVED_APP_ID,
        result: {
          kind: 'clarify',
          message: buildClarificationMessage(
            "Chess Tutor is open, but I can't read the live board state yet. Keep the sidebar open, let it finish reconnecting, and then try again."
          ),
        },
      })
    }
  }

  const isExplicitChessLaunchRequest =
    hasLaunchIntent(input.userRequest) &&
    !shouldUseChessBoardStateTool(input.userRequest) &&
    (normalizedRequest.includes(normalizeComparable(exampleInternalChessManifest.name)) ||
      normalizedRequest.includes(normalizeComparable(exampleInternalChessManifest.slug)))

  if (isExplicitChessLaunchRequest) {
    const chessApp = platform.appsById.get(exampleInternalChessManifest.appId)
    const chessTool = chessApp?.currentVersion.manifest.toolDefinitions.find(
      (tool) => tool.name === 'chess.launch-game'
    )

    if (chessApp && chessTool) {
      return finalizeTutorMeAiInterceptionResult({
        conversationId: input.conversationId,
        userRequest: input.userRequest,
        source: 'route.explicit-chess-launch',
        approvedAppId: CHESS_APPROVED_APP_ID,
        runtimeAppId: exampleInternalChessManifest.appId,
        result: {
          kind: 'invoke-tool',
          message: buildLaunchMessage({
            app: chessApp,
            conversationId: input.conversationId,
            userRequest: input.userRequest,
            tool: chessTool,
            toolArguments: buildToolArguments(chessTool, input.userRequest),
            authState: 'connected',
          }),
        },
      })
    }
  }

  const appOAuthStates = deriveAppOAuthStates(input.previousMessages)

  const discoveryResult = await platform.discovery.discoverAvailableTools({
    approvedOnly: true,
    activeAppId: activeAppContext?.activeApp?.appId ?? null,
    platformAuthenticated: true,
    appOAuthStates,
  })

  const routingDecision = platform.routing.routeToolRequest({
    conversationId: input.conversationId,
    userId: input.userId,
    userRequest: input.userRequest,
    availableTools: discoveryResult.tools,
    activeAppContext,
    requestMessageId: input.requestMessageId,
  })

  if (
    routingDecision.kind === 'clarify' &&
    (hasLaunchIntent(input.userRequest) || routingDecision.reason === 'generic-tool-request')
  ) {
    return finalizeTutorMeAiInterceptionResult({
      conversationId: input.conversationId,
      userRequest: input.userRequest,
      source: 'route.routing-clarify',
      result: {
        kind: 'clarify',
        message: buildClarificationMessage(routingDecision.clarificationQuestion),
      },
    })
  }

  if (routingDecision.kind === 'invoke-tool' && shouldInterceptInvoke(routingDecision, input.userRequest)) {
    const selectedApp = platform.appsById.get(routingDecision.selectedTool.appId)
    if (!selectedApp) {
      return finalizeTutorMeAiInterceptionResult({
        conversationId: input.conversationId,
        userRequest: input.userRequest,
        source: 'route.selected-app-missing',
        result: { kind: 'pass-through' },
      })
    }

    const authState =
      selectedApp.authType === 'oauth2'
        ? appOAuthStates[selectedApp.appId] === 'connected'
          ? 'connected'
          : appOAuthStates[selectedApp.appId] === 'expired'
            ? 'expired'
            : 'required'
        : 'connected'

    return finalizeTutorMeAiInterceptionResult({
      conversationId: input.conversationId,
      userRequest: input.userRequest,
      source: 'route.intercepted-tool-launch',
      result: {
        kind: 'invoke-tool',
        message: buildLaunchMessage({
          app: selectedApp,
          conversationId: input.conversationId,
          userRequest: input.userRequest,
          tool: routingDecision.selectedTool.tool,
          toolArguments: buildToolArguments(routingDecision.selectedTool.tool, input.userRequest),
          authState,
        }),
      },
    })
  }

  if (routingDecision.kind === 'plain-chat' && hasLaunchIntent(input.userRequest)) {
    const authGatedApp = findAuthGatedAppMatch(input.userRequest, platform.apps, appOAuthStates)
    if (authGatedApp) {
      const tool = authGatedApp.currentVersion.manifest.toolDefinitions[0]
      return finalizeTutorMeAiInterceptionResult({
        conversationId: input.conversationId,
        userRequest: input.userRequest,
        source: 'route.auth-gated-launch',
        result: {
          kind: 'invoke-tool',
          message: buildLaunchMessage({
            app: authGatedApp,
            conversationId: input.conversationId,
            userRequest: input.userRequest,
            tool,
            toolArguments: buildToolArguments(tool, input.userRequest),
            authState: appOAuthStates[authGatedApp.appId] === 'expired' ? 'expired' : 'required',
          }),
        },
      })
    }

    const normalizedRequest = normalizeComparable(input.userRequest)
    if (normalizedRequest.includes('app') || normalizedRequest.includes('tool')) {
      return finalizeTutorMeAiInterceptionResult({
        conversationId: input.conversationId,
        userRequest: input.userRequest,
        source: 'route.launch-app-clarify',
        result: {
          kind: 'clarify',
          message: buildClarificationMessage(
            'Which app would you like to open: Chess Tutor, Flashcards Coach, or Planner Connect?'
          ),
        },
      })
    }
  }

  return finalizeTutorMeAiInterceptionResult({
    conversationId: input.conversationId,
    userRequest: input.userRequest,
    source: 'route.pass-through',
    result: { kind: 'pass-through' },
  })
}
