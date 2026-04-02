import type { ConversationAppContext } from '@shared/contracts/v1'
import type { AppSessionRecord } from '../../app-sessions'
import type { ConversationServiceResult, ConversationThreadRecord } from '../../conversations'
import type { BackendFailureResult, BackendResult } from '../../errors'
import type { ToolInvocationRecord } from '../../tool-invocations'

export interface BuildConversationAppContextRequest {
  conversationId: string
  maxRecentCompletions?: number
  maxSessionTimeline?: number
  availableToolNamesByAppId?: Record<string, string[]>
  includeInvocationNotes?: boolean
}

export type AppContextErrorCode = 'invalid-request' | 'conversation-not-found' | 'context-validation-failed'

export type AppContextFailure = BackendFailureResult<AppContextErrorCode, 'app-context'>

export type AppContextResult<T> = BackendResult<T, AppContextErrorCode, 'app-context'>

export interface ConversationLookup {
  getConversation(request: { conversationId: string }): Promise<ConversationServiceResult<ConversationThreadRecord>>
}

export interface AppSessionLookup {
  listSessionsByConversation(conversationId: string): Promise<AppSessionRecord[]>
  getActiveSessionForConversation(conversationId: string): Promise<AppSessionRecord | undefined>
}

export interface ToolInvocationLookup {
  listByConversation(conversationId: string): Promise<ToolInvocationRecord[]>
}

export interface ConversationAppContextAssemblerDependencies {
  conversations: ConversationLookup
  appSessions: AppSessionLookup
  toolInvocations: ToolInvocationLookup
}

export interface ConversationAppContextAssemblerOptions {
  now?: () => string
}

export type BuiltConversationAppContext = ConversationAppContext
