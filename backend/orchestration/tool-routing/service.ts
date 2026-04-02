import type { ConversationAppContext, JsonObject } from '@shared/contracts/v1'
import type { AvailableToolRecord } from '../tool-discovery'
import type {
  BuildToolInvocationRequestInput,
  ClarifyToolRouteDecision,
  InvokeToolRouteDecision,
  PlainChatRouteDecision,
  RouteToolRequest,
  ToolRouteCandidateSummary,
  ToolRouteDecision,
  ToolRoutingInvocationAdapterResult,
  ToolRoutingSignal,
} from './types'

export interface ToolRoutingServiceOptions {
  now?: () => string
}

export class ToolRoutingService {
  private readonly now: () => string

  constructor(options: ToolRoutingServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  routeToolRequest(request: RouteToolRequest): ToolRouteDecision {
    const conversationId = this.normalizeIdentifier(request.conversationId)
    const userId = this.normalizeIdentifier(request.userId)
    const userRequest = this.normalizeText(request.userRequest)
    const evaluatedAt = this.normalizeTimestamp(request.evaluatedAt)

    if (!conversationId || !userId) {
      return this.plainChatDecision({
        conversationId: conversationId ?? 'unknown',
        userId: userId ?? 'unknown',
        userRequest,
        evaluatedAt,
        activeAppContext: request.activeAppContext ?? null,
        candidates: [],
        reason: 'The routing request was invalid, so the system will stay in plain chat mode.',
        routingSignals: ['no-match'],
      })
    }

    const scoredCandidates = this.scoreCandidates(request.availableTools, userRequest, request.activeAppContext)
    const activeAppId = request.activeAppContext?.activeApp?.appId ?? null
    const activeAppSessionId = request.activeAppContext?.activeApp?.appSessionId ?? null

    if (scoredCandidates.length === 0 || scoredCandidates[0].score <= 0) {
      return this.plainChatDecision({
        conversationId,
        userId,
        userRequest,
        evaluatedAt,
        activeAppContext: request.activeAppContext ?? null,
        candidates: scoredCandidates,
        reason: 'No eligible tool matched the request strongly enough to route.',
        routingSignals: ['no-match'],
      })
    }

    const [topCandidate, secondCandidate] = scoredCandidates
    const topScore = topCandidate.score
    const secondScore = secondCandidate?.score ?? 0
    const closeMatch = secondCandidate && secondScore > 0 && topScore - secondScore <= 3
    const weakMatch = topScore < 10
    const ambiguousRequest = this.looksAmbiguous(userRequest)

    if (weakMatch) {
      return this.plainChatDecision({
        conversationId,
        userId,
        userRequest,
        evaluatedAt,
        activeAppContext: request.activeAppContext ?? null,
        candidates: scoredCandidates,
        reason: 'The request does not name a tool strongly enough to justify execution.',
        routingSignals: ['no-match'],
      })
    }

    if (closeMatch || ambiguousRequest) {
      return this.clarifyDecision({
        conversationId,
        userId,
        userRequest,
        evaluatedAt,
        activeAppContext: request.activeAppContext ?? null,
        candidates: scoredCandidates,
        routingSignals: ['multiple-close-matches'],
        clarificationQuestion: this.buildClarificationQuestion(scoredCandidates),
      })
    }

    return {
      kind: 'invoke-tool',
      conversationId,
      userId,
      userRequest,
      evaluatedAt,
      activeAppId,
      activeAppSessionId,
      candidateCount: scoredCandidates.length,
      candidates: scoredCandidates,
      selectedTool: topCandidate,
      selectedCandidate: topCandidate,
      routingSignals: topCandidate.signals,
    }
  }

  buildToolInvocationRequest(
    decision: InvokeToolRouteDecision,
    input: BuildToolInvocationRequestInput
  ): ToolRoutingInvocationAdapterResult {
    const queuedAt = this.normalizeTimestamp(input.queuedAt)
    const baseMetadata = input.metadata ?? {}
    const transitionLog = Array.isArray(baseMetadata.transitionLog) ? baseMetadata.transitionLog : []

    return {
      toolCallId: input.toolCallId,
      conversationId: decision.conversationId,
      userId: decision.userId,
      appId: decision.selectedTool.appId,
      appVersionId: decision.selectedTool.appVersionId,
      requestMessageId: input.requestMessageId,
      correlationId: input.correlationId ?? input.toolCallId,
      toolName: decision.selectedTool.toolName,
      invocationMode: decision.selectedTool.tool.invocationMode,
      authRequirement: decision.selectedTool.authRequirement,
      requestPayloadJson: input.requestPayloadJson,
      appSessionId: input.appSessionId ?? decision.activeAppSessionId ?? undefined,
      queuedAt,
      metadata: {
        ...baseMetadata,
        routing: {
          decisionKind: 'invoke-tool',
          score: decision.selectedCandidate.score,
          signals: [...decision.selectedCandidate.signals],
          activeAppId: decision.activeAppId,
        },
        transitionLog: [
          ...transitionLog,
          {
            status: 'queued',
            at: queuedAt,
            note: `Routed by tool-routing service with score ${decision.selectedCandidate.score}.`,
          },
        ],
      },
      routing: {
        decisionKind: 'invoke-tool',
        score: decision.selectedCandidate.score,
        signals: [...decision.selectedCandidate.signals],
        activeAppId: decision.activeAppId,
      },
    }
  }

  private scoreCandidates(
    availableTools: AvailableToolRecord[],
    userRequest: string,
    activeAppContext: ConversationAppContext | null | undefined
  ): Array<AvailableToolRecord & ToolRouteCandidateSummary> {
    const ranked = availableTools.map((tool) => {
      const candidate = this.scoreCandidate(tool, userRequest, activeAppContext)
      return {
        ...tool,
        ...candidate,
      }
    })

    return ranked.sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score
      }

      if (left.isActiveApp !== right.isActiveApp) {
        return left.isActiveApp ? -1 : 1
      }

      const appNameComparison = left.appName.localeCompare(right.appName)
      if (appNameComparison !== 0) {
        return appNameComparison
      }

      return left.toolName.localeCompare(right.toolName)
    })
  }

  private scoreCandidate(
    tool: AvailableToolRecord,
    userRequest: string,
    activeAppContext: ConversationAppContext | null | undefined
  ): ToolRouteCandidateSummary {
    const signals: ToolRoutingSignal[] = []
    let score = 0

    const request = this.normalizeComparable(userRequest)
    const requestTokens = new Set(this.tokenize(userRequest))
    const activeApp = activeAppContext?.activeApp ?? null
    const isActiveApp = activeApp?.appId === tool.appId

    const comparableToolName = this.normalizeComparable(tool.toolName)
    const comparableDisplayName = this.normalizeComparable(tool.tool.displayName ?? '')
    const comparableAppName = this.normalizeComparable(tool.appName)
    const comparableAppSlug = this.normalizeComparable(tool.appSlug)
    if (request.includes(comparableToolName)) {
      score += 80
      signals.push('exact-tool-name')
    }

    if (comparableDisplayName && request.includes(comparableDisplayName)) {
      score += 40
      signals.push('exact-tool-display-name')
    }

    if (request.includes(comparableAppName)) {
      score += 60
      signals.push('exact-app-name')
    }

    if (request.includes(comparableAppSlug)) {
      score += 70
      signals.push('exact-app-slug')
    }

    score += this.scoreTokenOverlap(requestTokens, this.tokenize(tool.toolName), 12, signals, 'tool-token-match')
    score += this.scoreTokenOverlap(requestTokens, this.tokenize(tool.appName), 10, signals, 'app-token-match')
    score += this.scoreTokenOverlap(requestTokens, this.tokenize(tool.appSlug), 11, signals, 'app-token-match')
    score += this.scoreTokenOverlap(
      requestTokens,
      this.tokenize(tool.tool.displayName ?? ''),
      8,
      signals,
      'tool-token-match'
    )
    score += this.scoreTokenOverlap(
      requestTokens,
      this.tokenize(tool.tool.description),
      3,
      signals,
      'description-token-match',
      4
    )

    if (isActiveApp) {
      score += 12
      signals.push('active-app-boost')
    }

    if (isActiveApp && this.looksLikeFollowUp(userRequest)) {
      score += 10
      signals.push('follow-up-intent')
    }

    return {
      appId: tool.appId,
      appName: tool.appName,
      appSlug: tool.appSlug,
      toolName: tool.toolName,
      score,
      signals,
      isActiveApp,
    }
  }

  private scoreTokenOverlap(
    requestTokens: Set<string>,
    candidateTokens: string[],
    perMatchScore: number,
    signals: ToolRoutingSignal[],
    signal: ToolRoutingSignal,
    maxMatches = 3
  ): number {
    let matches = 0
    let score = 0

    for (const token of candidateTokens) {
      if (requestTokens.has(token)) {
        matches += 1
        score += perMatchScore
        if (!signals.includes(signal)) {
          signals.push(signal)
        }
        if (matches >= maxMatches) {
          break
        }
      }
    }

    return score
  }

  private buildClarificationQuestion(candidates: ToolRouteCandidateSummary[]): string {
    const uniqueApps = [...new Map(candidates.map((candidate) => [candidate.appId, candidate])).values()]
      .slice(0, 3)
      .map((candidate) => candidate.appName)

    if (uniqueApps.length === 0) {
      return 'Which app should I use?'
    }

    if (uniqueApps.length === 1) {
      return `I can help with ${uniqueApps[0]}. Did you want that app or plain chat?`
    }

    if (uniqueApps.length === 2) {
      return `I can help with ${uniqueApps[0]} or ${uniqueApps[1]}. Which one do you mean?`
    }

    return `I can help with ${uniqueApps[0]}, ${uniqueApps[1]}, or ${uniqueApps[2]}. Which one do you mean?`
  }

  private looksAmbiguous(userRequest: string): boolean {
    const normalized = this.normalizeText(userRequest)
    return (
      normalized.includes(' or ') ||
      normalized.includes('either') ||
      normalized.includes('maybe') ||
      normalized.includes('which one') ||
      normalized.includes('help me choose')
    )
  }

  private looksLikeFollowUp(userRequest: string): boolean {
    const normalized = this.normalizeText(userRequest)
    return (
      normalized.includes('again') ||
      normalized.includes('continue') ||
      normalized.includes('resume') ||
      normalized.includes('same one') ||
      normalized.includes('that one') ||
      normalized.includes('keep going')
    )
  }

  private clarifyDecision(input: {
    conversationId: string
    userId: string
    userRequest: string
    evaluatedAt: string
    activeAppContext: ConversationAppContext | null
    candidates: Array<AvailableToolRecord & ToolRouteCandidateSummary>
    routingSignals: ToolRoutingSignal[]
    clarificationQuestion: string
  }): ClarifyToolRouteDecision {
    return {
      kind: 'clarify',
      conversationId: input.conversationId,
      userId: input.userId,
      userRequest: input.userRequest,
      evaluatedAt: input.evaluatedAt,
      activeAppId: input.activeAppContext?.activeApp?.appId ?? null,
      activeAppSessionId: input.activeAppContext?.activeApp?.appSessionId ?? null,
      candidateCount: input.candidates.length,
      candidates: input.candidates,
      routingSignals: input.routingSignals,
      clarificationQuestion: input.clarificationQuestion,
    }
  }

  private plainChatDecision(input: {
    conversationId: string
    userId: string
    userRequest: string
    evaluatedAt: string
    activeAppContext: ConversationAppContext | null
    candidates: Array<AvailableToolRecord & ToolRouteCandidateSummary>
    reason: string
    routingSignals: ToolRoutingSignal[]
  }): PlainChatRouteDecision {
    return {
      kind: 'plain-chat',
      conversationId: input.conversationId,
      userId: input.userId,
      userRequest: input.userRequest,
      evaluatedAt: input.evaluatedAt,
      activeAppId: input.activeAppContext?.activeApp?.appId ?? null,
      activeAppSessionId: input.activeAppContext?.activeApp?.appSessionId ?? null,
      candidateCount: input.candidates.length,
      candidates: input.candidates,
      routingSignals: input.routingSignals,
      reason: input.reason,
    }
  }

  private tokenize(text: string): string[] {
    return this.normalizeText(text)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
      .filter((token) => !this.stopwords.has(token))
  }

  private normalizeComparable(text: string): string {
    return this.normalizeText(text).replace(/[^a-z0-9]+/g, '')
  }

  private normalizeText(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  }

  private normalizeIdentifier(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  private normalizeTimestamp(timestamp: string | undefined): string {
    if (typeof timestamp === 'string' && timestamp.length > 0) {
      return timestamp
    }

    return this.now()
  }

  private readonly stopwords = new Set([
    'a',
    'an',
    'and',
    'ask',
    'can',
    'for',
    'from',
    'help',
    'i',
    'in',
    'is',
    'it',
    'me',
    'my',
    'of',
    'or',
    'please',
    'should',
    'the',
    'to',
    'try',
    'want',
    'what',
    'which',
    'with',
    'you',
  ])
}
