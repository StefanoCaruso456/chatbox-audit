import type { ConversationAppContext } from '@shared/contracts/v1'
import type { AvailableToolRecord } from '../tool-discovery'
import type {
  BuildToolInvocationRequestInput,
  ClarifyToolRouteDecision,
  ClarifyToolRouteDecisionReason,
  InvokeToolRouteDecision,
  PlainChatRouteDecision,
  PlainChatRouteDecisionReason,
  RouteToolRequest,
  ToolRouteCandidateSummary,
  ToolRouteClarificationOption,
  ToolRouteDecision,
  ToolRoutingIntentSignals,
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
    const intentSignals = this.detectIntentSignals(userRequest, request.availableTools, request.activeAppContext)

    if (!conversationId || !userId) {
      return this.plainChatDecision({
        conversationId: conversationId ?? 'unknown',
        userId: userId ?? 'unknown',
        userRequest,
        evaluatedAt,
        activeAppContext: request.activeAppContext ?? null,
        candidates: [],
        reason: 'invalid-request',
        routingSignals: ['no-match', 'invalid-routing-request'],
      })
    }

    const scoredCandidates = this.scoreCandidates(request.availableTools, userRequest, request.activeAppContext)
    const activeAppId = request.activeAppContext?.activeApp?.appId ?? null
    const activeAppSessionId = request.activeAppContext?.activeApp?.appSessionId ?? null

    if (intentSignals.hasConflictingExplicitMentions) {
      return this.clarifyDecision({
        conversationId,
        userId,
        userRequest,
        evaluatedAt,
        activeAppContext: request.activeAppContext ?? null,
        candidates: scoredCandidates,
        reason: 'explicit-app-conflict',
        routingSignals: ['explicit-app-conflict'],
        clarificationQuestion: this.buildClarificationQuestion(scoredCandidates, 'explicit-app-conflict'),
      })
    }

    if (this.shouldClarifyGenericAction(intentSignals, scoredCandidates)) {
      return this.clarifyDecision({
        conversationId,
        userId,
        userRequest,
        evaluatedAt,
        activeAppContext: request.activeAppContext ?? null,
        candidates: scoredCandidates,
        reason: 'generic-tool-request',
        routingSignals: ['generic-action-request'],
        clarificationQuestion: this.buildClarificationQuestion(scoredCandidates, 'generic-tool-request'),
      })
    }

    if (scoredCandidates.length === 0 || scoredCandidates[0].score <= 0) {
      return this.plainChatDecision({
        conversationId,
        userId,
        userRequest,
        evaluatedAt,
        activeAppContext: request.activeAppContext ?? null,
        candidates: scoredCandidates,
        reason: this.resolvePlainChatReason(intentSignals),
        routingSignals: this.resolvePlainChatSignals(intentSignals),
      })
    }

    const [topCandidate, secondCandidate] = scoredCandidates
    const topScore = topCandidate.score
    const secondScore = secondCandidate?.score ?? 0
    const closeMatch = secondCandidate && secondScore > 0 && topScore - secondScore <= 3
    const weakMatch = topScore < 10

    if (weakMatch) {
      return this.plainChatDecision({
        conversationId,
        userId,
        userRequest,
        evaluatedAt,
        activeAppContext: request.activeAppContext ?? null,
        candidates: scoredCandidates,
        reason: this.resolveWeakMatchReason(intentSignals),
        routingSignals: this.resolveWeakMatchSignals(intentSignals),
      })
    }

    if (closeMatch || intentSignals.explicitAmbiguity) {
      return this.clarifyDecision({
        conversationId,
        userId,
        userRequest,
        evaluatedAt,
        activeAppContext: request.activeAppContext ?? null,
        candidates: scoredCandidates,
        reason: closeMatch ? 'multiple-close-matches' : 'explicit-ambiguity',
        routingSignals: closeMatch ? ['multiple-close-matches'] : ['explicit-ambiguity'],
        clarificationQuestion: this.buildClarificationQuestion(
          scoredCandidates,
          closeMatch ? 'multiple-close-matches' : 'explicit-ambiguity'
        ),
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

  private buildClarificationQuestion(
    candidates: ToolRouteCandidateSummary[],
    reason: ClarifyToolRouteDecisionReason
  ): string {
    const uniqueApps = [...new Map(candidates.map((candidate) => [candidate.appId, candidate])).values()]
      .slice(0, 3)
      .map((candidate) => candidate.appName)

    if (uniqueApps.length === 0) {
      return 'Which app should I use?'
    }

    if (reason === 'generic-tool-request') {
      if (uniqueApps.length === 1) {
        return `I can open ${uniqueApps[0]}, or we can stay in chat. Which would you like?`
      }

      if (uniqueApps.length === 2) {
        return `I can use ${uniqueApps[0]} or ${uniqueApps[1]}. Which app should I open?`
      }

      return `I can use ${uniqueApps[0]}, ${uniqueApps[1]}, or ${uniqueApps[2]}. Which app should I open?`
    }

    if (uniqueApps.length === 1) {
      return `I can help with ${uniqueApps[0]}. Did you want that app or plain chat?`
    }

    if (uniqueApps.length === 2) {
      return `I can help with ${uniqueApps[0]} or ${uniqueApps[1]}. Which one do you mean?`
    }

    return `I can help with ${uniqueApps[0]}, ${uniqueApps[1]}, or ${uniqueApps[2]}. Which one do you mean?`
  }

  private detectIntentSignals(
    userRequest: string,
    availableTools: AvailableToolRecord[],
    activeAppContext: ConversationAppContext | null | undefined
  ): ToolRoutingIntentSignals {
    const normalized = this.normalizeText(userRequest)
    const requestTokens = new Set(this.tokenize(normalized))
    const allAppNames = new Set<string>()
    const explicitMentions = new Set<string>()

    for (const tool of availableTools) {
      const normalizedAppName = this.normalizeText(tool.appName)
      const normalizedAppSlug = this.normalizeText(tool.appSlug)
      const normalizedToolName = this.normalizeText(tool.toolName)
      const normalizedToolDisplayName = this.normalizeText(tool.tool.displayName ?? '')

      for (const token of this.tokenize(tool.appName)) {
        allAppNames.add(token)
      }
      for (const token of this.tokenize(tool.appSlug)) {
        allAppNames.add(token)
      }

      if (
        (normalizedAppName.length > 0 && normalized.includes(normalizedAppName)) ||
        (normalizedAppSlug.length > 0 && normalized.includes(normalizedAppSlug)) ||
        (normalizedToolName.length > 0 && normalized.includes(normalizedToolName)) ||
        (normalizedToolDisplayName.length > 0 && normalized.includes(normalizedToolDisplayName))
      ) {
        explicitMentions.add(tool.appId)
      }
    }

    const generalConversationCue = this.generalConversationVerbs.some((cue) => normalized.includes(cue))
    const launchIntent = this.launchIntentTokens.some((token) => requestTokens.has(token))
    const genericActionOnly =
      launchIntent &&
      requestTokens.size <= 2 &&
      ![...requestTokens].some((token) => allAppNames.has(token)) &&
      !this.looksLikeFollowUp(userRequest)

    return {
      explicitAmbiguity: this.looksAmbiguous(userRequest),
      followUpIntent: this.looksLikeFollowUp(userRequest),
      launchIntent,
      activeAppMentioned: false,
      generalConversationCue,
      genericActionOnly,
      mentionedAppCount: explicitMentions.size,
      hasConflictingExplicitMentions: explicitMentions.size > 1,
    }
  }

  private shouldClarifyGenericAction(
    intentSignals: ToolRoutingIntentSignals,
    candidates: Array<AvailableToolRecord & ToolRouteCandidateSummary>
  ): boolean {
    if (!intentSignals.genericActionOnly) {
      return false
    }

    const candidateApps = new Set(candidates.filter((candidate) => candidate.score > 0).map((candidate) => candidate.appId))
    return candidateApps.size > 1
  }

  private resolvePlainChatReason(intentSignals: ToolRoutingIntentSignals): PlainChatRouteDecisionReason {
    if (intentSignals.generalConversationCue && !intentSignals.launchIntent && !intentSignals.followUpIntent) {
      return 'unrelated-request'
    }

    if (intentSignals.followUpIntent) {
      return 'missing-active-app'
    }

    return 'no-eligible-tool-match'
  }

  private resolvePlainChatSignals(intentSignals: ToolRoutingIntentSignals): ToolRoutingSignal[] {
    if (intentSignals.generalConversationCue && !intentSignals.launchIntent && !intentSignals.followUpIntent) {
      return ['unrelated-request', 'no-match']
    }

    if (intentSignals.followUpIntent) {
      return ['missing-active-app', 'no-match']
    }

    return ['no-match']
  }

  private resolveWeakMatchReason(intentSignals: ToolRoutingIntentSignals): PlainChatRouteDecisionReason {
    if (intentSignals.generalConversationCue && !intentSignals.launchIntent && !intentSignals.followUpIntent) {
      return 'unrelated-request'
    }

    return 'low-confidence-tool-match'
  }

  private resolveWeakMatchSignals(intentSignals: ToolRoutingIntentSignals): ToolRoutingSignal[] {
    if (intentSignals.generalConversationCue && !intentSignals.launchIntent && !intentSignals.followUpIntent) {
      return ['unrelated-request', 'low-confidence-match']
    }

    return ['low-confidence-match']
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

  private buildClarificationOptions(
    candidates: Array<AvailableToolRecord & ToolRouteCandidateSummary>
  ): ToolRouteClarificationOption[] {
    return [...new Map(candidates.map((candidate) => [candidate.appId, candidate])).values()].slice(0, 3).map((candidate) => ({
      appId: candidate.appId,
      appName: candidate.appName,
      appSlug: candidate.appSlug,
      toolName: candidate.toolName,
      isActiveApp: candidate.isActiveApp,
    }))
  }

  private clarifyDecision(input: {
    conversationId: string
    userId: string
    userRequest: string
    evaluatedAt: string
    activeAppContext: ConversationAppContext | null
    candidates: Array<AvailableToolRecord & ToolRouteCandidateSummary>
    reason: ClarifyToolRouteDecisionReason
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
      reason: input.reason,
      options: this.buildClarificationOptions(input.candidates),
    }
  }

  private plainChatDecision(input: {
    conversationId: string
    userId: string
    userRequest: string
    evaluatedAt: string
    activeAppContext: ConversationAppContext | null
    candidates: Array<AvailableToolRecord & ToolRouteCandidateSummary>
    reason: PlainChatRouteDecisionReason
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
      refusalMessage: this.buildPlainChatRefusalMessage(input.reason),
    }
  }

  private buildPlainChatRefusalMessage(reason: PlainChatRouteDecisionReason): string {
    switch (reason) {
      case 'invalid-request':
        return 'I could not validate that tool-routing request, so I will stay in plain chat.'
      case 'missing-active-app':
        return 'There is no active app session to continue, so I will stay in plain chat.'
      case 'low-confidence-tool-match':
        return 'The request did not match a tool clearly enough, so I will stay in plain chat.'
      case 'unrelated-request':
        return 'This request looks unrelated to the available apps, so I will answer in plain chat.'
      case 'no-eligible-tool-match':
      default:
        return 'No eligible app tool matched the request strongly enough, so I will stay in plain chat.'
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

  private readonly launchIntentTokens = [
    'open',
    'launch',
    'start',
    'play',
    'use',
    'connect',
    'create',
    'show',
    'run',
  ]

  private readonly generalConversationVerbs = [
    'tell me',
    'explain',
    'why is',
    'what is',
    'who is',
    'write',
    'joke',
    'summarize',
  ]
}
