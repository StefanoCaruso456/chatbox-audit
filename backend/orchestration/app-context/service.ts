import {
  type ActiveAppContext,
  type AppSessionContextSummary,
  appSessionStateToContextSummary,
  type CompletionContextSummary,
  completionSignalToContextSummary,
  parseConversationAppContext,
} from '@shared/contracts/v1'
import { failureResult } from '../../errors'
import type {
  AppContextFailure,
  AppContextResult,
  BuildConversationAppContextRequest,
  BuiltConversationAppContext,
  ConversationAppContextAssemblerDependencies,
  ConversationAppContextAssemblerOptions,
} from './types'

export class ConversationAppContextAssembler {
  private readonly now: () => string

  constructor(
    private readonly dependencies: ConversationAppContextAssemblerDependencies,
    options: ConversationAppContextAssemblerOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  async buildContext(
    request: BuildConversationAppContextRequest
  ): Promise<AppContextResult<BuiltConversationAppContext>> {
    const conversationId = request.conversationId.trim()
    if (conversationId.length === 0) {
      return this.failure('invalid-request', 'conversationId is required.')
    }

    const conversation = await this.dependencies.conversations.getConversation({ conversationId })
    if (!conversation.ok) {
      return this.failure('conversation-not-found', conversation.message)
    }

    const sessions = await this.dependencies.appSessions.listSessionsByConversation(conversationId)
    const invocations = request.includeInvocationNotes ?? true
      ? await this.dependencies.toolInvocations.listByConversation(conversationId)
      : []

    const timelineLimit = this.clampLimit(request.maxSessionTimeline, 5, 20)
    const completionLimit = this.clampLimit(request.maxRecentCompletions, 3, 10)

    const activeSession =
      this.resolveReferencedActiveSession(conversation.value.conversation.activeAppSessionId, sessions) ??
      (await this.dependencies.appSessions.getActiveSessionForConversation(conversationId))

    const sessionTimeline = this.buildSessionTimeline(sessions, activeSession?.appSessionId, timelineLimit)
    const recentCompletions = this.buildRecentCompletions(sessions, completionLimit)
    const selectionStrategy = activeSession
      ? 'active-plus-recent-completions'
      : recentCompletions.length > 0
        ? 'recent-completions-only'
        : 'session-history-only'
    const omittedSessionCount = Math.max(0, sessions.length - sessionTimeline.length)
    const notes = this.buildNotes({
      activeSession,
      invocations,
      omittedSessionCount,
      requestedActiveAppSessionId: conversation.value.conversation.activeAppSessionId,
    })

    try {
      return {
        ok: true,
        value: parseConversationAppContext({
          version: 'v1',
          conversationId,
          generatedAt: this.now(),
          activeApp: activeSession
            ? this.buildActiveAppContext(activeSession, request.availableToolNamesByAppId?.[activeSession.appId])
            : null,
          recentCompletions,
          sessionTimeline,
          selection: {
            strategy: selectionStrategy,
            includedSessionIds: sessionTimeline.map((session) => session.appSessionId),
            omittedSessionCount,
          },
          notes: notes.length > 0 ? notes : undefined,
        }),
      }
    } catch (error) {
      return this.failure('context-validation-failed', 'Conversation app context validation failed.', [
        error instanceof Error ? error.message : 'Unknown validation error.',
      ])
    }
  }

  private buildSessionTimeline(
    sessions: Parameters<typeof appSessionStateToContextSummary>[0][],
    activeAppSessionId: string | undefined,
    limit: number
  ): AppSessionContextSummary[] {
    return [...sessions]
      .sort((left, right) => {
        const leftPriority = left.appSessionId === activeAppSessionId ? 0 : 1
        const rightPriority = right.appSessionId === activeAppSessionId ? 0 : 1
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      })
      .slice(0, limit)
      .map((session) => appSessionStateToContextSummary(session))
  }

  private buildRecentCompletions(
    sessions: Parameters<typeof appSessionStateToContextSummary>[0][],
    limit: number
  ): CompletionContextSummary[] {
    return sessions
      .filter((session): session is typeof session & { completion: NonNullable<typeof session.completion> } =>
        Boolean(session.completion)
      )
      .sort((left, right) => new Date(right.completion.completedAt).getTime() - new Date(left.completion.completedAt).getTime())
      .slice(0, limit)
      .map((session) => completionSignalToContextSummary(session.completion))
  }

  private buildActiveAppContext(
    session: Parameters<typeof appSessionStateToContextSummary>[0],
    availableToolNames: string[] | undefined
  ): ActiveAppContext {
    const summary = appSessionStateToContextSummary(session)

    return {
      ...summary,
      authState: session.authState,
      currentToolCallId: session.currentToolCallId ?? undefined,
      resumableUntil: session.resumableUntil ?? undefined,
      availableToolNames: availableToolNames && availableToolNames.length > 0 ? [...availableToolNames] : undefined,
    }
  }

  private buildNotes(input: {
    activeSession: Parameters<typeof appSessionStateToContextSummary>[0] | undefined
    invocations: Awaited<ReturnType<ConversationAppContextAssemblerDependencies['toolInvocations']['listByConversation']>>
    omittedSessionCount: number
    requestedActiveAppSessionId: string | null
  }): string[] {
    const notes: string[] = []

    if (
      input.requestedActiveAppSessionId &&
      input.activeSession &&
      input.requestedActiveAppSessionId !== input.activeSession.appSessionId
    ) {
      notes.push(`Conversation referenced "${input.requestedActiveAppSessionId}", but "${input.activeSession.appSessionId}" was used as the active app session.`)
    }

    if (input.activeSession?.currentToolCallId) {
      const invocation = input.invocations.find(
        (candidate) => candidate.toolCallId === input.activeSession?.currentToolCallId
      )
      if (invocation) {
        notes.push(`Active app tool "${invocation.toolName}" is currently "${invocation.status}".`)
      }
    }

    if (input.omittedSessionCount > 0) {
      notes.push(`Omitted ${input.omittedSessionCount} older app sessions from the assembled context.`)
    }

    return notes.slice(0, 5)
  }

  private resolveReferencedActiveSession(
    activeAppSessionId: string | null,
    sessions: Parameters<typeof appSessionStateToContextSummary>[0][]
  ) {
    if (!activeAppSessionId) {
      return undefined
    }

    return sessions.find((session) => session.appSessionId === activeAppSessionId)
  }

  private clampLimit(value: number | undefined, fallback: number, maximum: number): number {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
      return fallback
    }

    return Math.min(Math.floor(value), maximum)
  }

  private failure(code: AppContextFailure['code'], message: string, details?: string[]): AppContextFailure {
    return failureResult('app-context', code, message, { details })
  }
}
