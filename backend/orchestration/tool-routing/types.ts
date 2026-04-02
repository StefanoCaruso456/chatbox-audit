import type { ConversationAppContext, JsonObject } from '@shared/contracts/v1'
import type {
  QueueToolInvocationRequest,
  ToolInvocationMetadata,
} from '../../tool-invocations'
import type { AvailableToolRecord } from '../tool-discovery'

export type ToolRoutingDecisionKind = 'invoke-tool' | 'clarify' | 'plain-chat'

export type ToolRoutingSignal =
  | 'exact-tool-name'
  | 'exact-tool-display-name'
  | 'exact-app-name'
  | 'exact-app-slug'
  | 'tool-token-match'
  | 'app-token-match'
  | 'description-token-match'
  | 'active-app-boost'
  | 'follow-up-intent'
  | 'multiple-close-matches'
  | 'no-match'

export interface RouteToolRequest {
  conversationId: string
  userId: string
  userRequest: string
  availableTools: AvailableToolRecord[]
  activeAppContext?: ConversationAppContext | null
  requestMessageId?: string
  correlationId?: string
  evaluatedAt?: string
}

export interface ToolRouteCandidateSummary {
  appId: string
  appName: string
  appSlug: string
  toolName: string
  score: number
  signals: ToolRoutingSignal[]
  isActiveApp: boolean
}

export interface ToolRouteDecisionBase {
  kind: ToolRoutingDecisionKind
  conversationId: string
  userId: string
  userRequest: string
  evaluatedAt: string
  activeAppId: string | null
  activeAppSessionId: string | null
  candidateCount: number
  candidates: ToolRouteCandidateSummary[]
}

export interface InvokeToolRouteDecision extends ToolRouteDecisionBase {
  kind: 'invoke-tool'
  selectedTool: AvailableToolRecord
  selectedCandidate: ToolRouteCandidateSummary
  routingSignals: ToolRoutingSignal[]
}

export interface ClarifyToolRouteDecision extends ToolRouteDecisionBase {
  kind: 'clarify'
  clarificationQuestion: string
  routingSignals: ToolRoutingSignal[]
}

export interface PlainChatRouteDecision extends ToolRouteDecisionBase {
  kind: 'plain-chat'
  reason: string
  routingSignals: ToolRoutingSignal[]
}

export type ToolRouteDecision =
  | InvokeToolRouteDecision
  | ClarifyToolRouteDecision
  | PlainChatRouteDecision

export interface BuildToolInvocationRequestInput {
  toolCallId: string
  requestPayloadJson: JsonObject
  queuedAt?: string
  requestMessageId?: string
  correlationId?: string
  appSessionId?: string
  metadata?: ToolInvocationMetadata
}

export interface ToolRoutingInvocationAdapterResult extends QueueToolInvocationRequest {
  routing: {
    decisionKind: Extract<ToolRouteDecisionKind, 'invoke-tool'>
    score: number
    signals: ToolRoutingSignal[]
    activeAppId: string | null
  }
}
