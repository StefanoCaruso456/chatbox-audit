import type { ConversationAppContext } from '@shared/contracts/v1'
import { parseConversationAppContext } from '@shared/contracts/v1'
import type { CompletionStatus } from '@shared/contracts/v1/completion-signal'
import type { Message, MessageEmbeddedAppPart } from '@shared/types'

export interface EmbeddedAppConversationIndicator {
  label: string
  tone: 'blue' | 'gray'
}

export interface EmbeddedAppReference {
  key: string
  messageId: string
  partIndex: number
  timestamp: number
  appId: string
  appName: string
  appSessionId: string
  part: MessageEmbeddedAppPart
  normalizedNames: string[]
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ')
}

function inferAppSlug(part: MessageEmbeddedAppPart): string | null {
  try {
    const pathname = new URL(part.sourceUrl).pathname
    const segments = pathname.split('/').filter(Boolean)
    return segments.at(-1) ?? null
  } catch {
    return null
  }
}

function buildNormalizedNames(part: MessageEmbeddedAppPart): string[] {
  const values = new Set<string>()
  values.add(normalizeComparable(part.appId))
  values.add(normalizeComparable(part.appName))

  const slug = inferAppSlug(part)
  if (slug) {
    values.add(normalizeComparable(slug))
  }

  for (const token of part.appId.split(/[.:_-]+/u)) {
    if (token.trim()) {
      values.add(normalizeComparable(token))
    }
  }

  return [...values].filter(Boolean)
}

function getMessageTimestamp(message: Message, fallbackIndex: number): number {
  if (typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)) {
    return message.timestamp
  }

  return fallbackIndex
}

export function collectEmbeddedAppReferences(messages: Message[]): EmbeddedAppReference[] {
  const refs: EmbeddedAppReference[] = []

  messages.forEach((message, messageIndex) => {
    for (const [partIndex, part] of (message.contentParts ?? []).entries()) {
      if (part.type !== 'embedded-app') {
        continue
      }

      const appSessionId = part.bridge?.appSessionId ?? part.appSessionId
      if (!appSessionId) {
        continue
      }

      refs.push({
        key: `${message.id}:${partIndex}`,
        messageId: message.id,
        partIndex,
        timestamp: getMessageTimestamp(message, messageIndex),
        appId: part.appId,
        appName: part.appName,
        appSessionId,
        part,
        normalizedNames: buildNormalizedNames(part),
      })
    }
  })

  return refs
}

function getCompletionStatus(part: MessageEmbeddedAppPart): CompletionStatus | null {
  return part.bridge?.completion?.status ?? null
}

function isRecoverableFailure(part: MessageEmbeddedAppPart) {
  return part.status === 'error' && !part.bridge?.completion
}

function isActivePart(part: MessageEmbeddedAppPart) {
  return !part.bridge?.completion && part.status !== 'error'
}

function compareByRecency(a: EmbeddedAppReference, b: EmbeddedAppReference) {
  return b.timestamp - a.timestamp
}

export function selectConversationAppReference(messages: Message[], userRequest: string): EmbeddedAppReference | null {
  const refs = collectEmbeddedAppReferences(messages)
  if (refs.length === 0) {
    return null
  }

  const normalizedRequest = normalizeComparable(userRequest)
  const explicitlyReferenced = refs
    .filter((ref) => ref.normalizedNames.some((name) => name && normalizedRequest.includes(name)))
    .sort(compareByRecency)

  if (explicitlyReferenced.length > 0) {
    return explicitlyReferenced[0]
  }

  const activeRefs = refs.filter((ref) => isActivePart(ref.part)).sort(compareByRecency)
  if (activeRefs.length > 0) {
    return activeRefs[0]
  }

  const recoverableRefs = refs.filter((ref) => isRecoverableFailure(ref.part)).sort(compareByRecency)
  if (recoverableRefs.length > 0) {
    return recoverableRefs[0]
  }

  return [...refs].sort(compareByRecency)[0]
}

export function buildConversationAppContextFromReference(
  conversationId: string,
  reference: EmbeddedAppReference,
  generatedAt: string
): ConversationAppContext {
  const completion = reference.part.bridge?.completion
  const summary =
    reference.part.summary ??
    completion?.resultSummary ??
    (reference.part.status === 'error'
      ? reference.part.errorMessage ?? `${reference.part.appName} needs attention.`
      : `${reference.part.appName} is active in chat.`)
  const latestStateDigest = completion?.result ?? reference.part.bridge?.bootstrap?.initialState ?? undefined
  const availableToolNames = reference.part.bridge?.bootstrap?.availableTools?.map((tool) => tool.name)
  const authState = reference.part.bridge?.bootstrap?.authState ?? 'not-required'

  const sessionStatus = completion
    ? 'completed'
    : reference.part.status === 'loading'
      ? 'pending'
      : reference.part.status === 'error'
        ? 'failed'
        : 'active'

  const activeApp = completion || reference.part.status === 'error'
    ? null
    : {
        appSessionId: reference.appSessionId,
        appId: reference.appId,
        status: sessionStatus,
        summary,
        updatedAt: generatedAt,
        latestSequence: 1,
        latestStateDigest,
        authState,
        currentToolCallId: reference.part.bridge?.pendingInvocation?.toolCallId,
        resumableUntil: undefined,
        availableToolNames,
      }

  const recentCompletions = completion
    ? [
        {
          appSessionId: reference.appSessionId,
          appId: reference.appId,
          status: completion.status,
          resultSummary: completion.resultSummary ?? summary,
          completedAt: generatedAt,
          followUpContext: {
            summary: completion.resultSummary ?? summary,
            userVisibleSummary: reference.part.summary,
            stateDigest: completion.result,
          },
        },
      ]
    : reference.part.status === 'error'
      ? [
          {
            appSessionId: reference.appSessionId,
            appId: reference.appId,
            status: 'failed' as const,
            resultSummary: reference.part.errorMessage ?? `${reference.part.appName} failed before completing.`,
            completedAt: generatedAt,
            followUpContext: {
              summary: reference.part.errorMessage ?? `${reference.part.appName} failed before completing.`,
              userVisibleSummary: reference.part.summary,
              stateDigest: latestStateDigest,
            },
          },
        ]
      : []

  return parseConversationAppContext({
    version: 'v1',
    conversationId,
    generatedAt,
    activeApp,
    recentCompletions,
    sessionTimeline: [
      {
        appSessionId: reference.appSessionId,
        appId: reference.appId,
        status: sessionStatus,
        summary,
        updatedAt: generatedAt,
        latestSequence: completion ? 2 : 1,
        latestStateDigest,
      },
    ],
    selection: {
      strategy: activeApp ? 'active-plus-recent-completions' : 'recent-completions-only',
      includedSessionIds: [reference.appSessionId],
      omittedSessionCount: 0,
    },
  })
}

export function buildEmbeddedAppConversationIndicators(
  messages: Message[]
): Record<string, EmbeddedAppConversationIndicator> {
  const refs = collectEmbeddedAppReferences(messages)
  const uniqueSessions = new Set(refs.map((ref) => ref.appSessionId))
  if (uniqueSessions.size <= 1) {
    return {}
  }

  const sorted = [...refs].sort(compareByRecency)
  const currentRef = sorted.find((ref) => isActivePart(ref.part)) ?? sorted[0]
  const indicators: Record<string, EmbeddedAppConversationIndicator> = {}

  for (const ref of sorted) {
    indicators[ref.key] =
      ref.key === currentRef.key
        ? {
            label: 'Current app',
            tone: 'blue',
          }
        : {
            label: 'Recent app',
            tone: 'gray',
          }
  }

  return indicators
}

export function getEmbeddedAppReferenceKey(messageId: string, partIndex: number) {
  return `${messageId}:${partIndex}`
}
