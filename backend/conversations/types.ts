import type { JsonObject, JsonValue } from '@shared/contracts/v1'
import type { BackendFailureResult, BackendResult } from '../errors'

export type ConversationStatus = 'active' | 'archived' | 'deleted'

export type ConversationMessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ConversationRecord {
  conversationId: string
  userId: string
  title: string | null
  status: ConversationStatus
  activeAppSessionId: string | null
  metadata: JsonObject
  lastMessageAt: string | null
  lastActivityAt: string
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  deletedAt: string | null
}

export interface ConversationMessageRecord {
  messageId: string
  conversationId: string
  userId: string | null
  role: ConversationMessageRole
  sequenceNo: number
  contentText: string | null
  contentParts: JsonValue[]
  metadata: JsonObject
  createdAt: string
}

export interface ConversationThreadRecord {
  conversation: ConversationRecord
  messages: ConversationMessageRecord[]
}

export interface CreateConversationRequest {
  conversationId: string
  userId: string
  title?: string | null
  metadata?: JsonObject
  activeAppSessionId?: string | null
}

export interface AppendConversationMessageRequest {
  messageId: string
  conversationId: string
  userId?: string | null
  role: ConversationMessageRole
  sequenceNo: number
  contentText?: string | null
  contentParts?: JsonValue[]
  metadata?: JsonObject
}

export interface UpdateConversationMetadataRequest {
  conversationId: string
  title?: string | null
  metadata?: JsonObject
}

export interface SetConversationActiveAppSessionRequest {
  conversationId: string
  activeAppSessionId: string | null
}

export interface ListRecentConversationsRequest {
  userId: string
  limit?: number
}

export interface GetConversationRequest {
  conversationId: string
}

export type ConversationServiceErrorCode =
  | 'invalid-request'
  | 'conversation-not-found'
  | 'conversation-already-exists'
  | 'conversation-not-open'
  | 'message-already-exists'
  | 'message-sequence-conflict'

export type ConversationServiceFailure = BackendFailureResult<ConversationServiceErrorCode, 'conversation'>

export type ConversationServiceResult<T> = BackendResult<T, ConversationServiceErrorCode, 'conversation'>
