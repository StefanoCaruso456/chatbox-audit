import type { JsonObject } from '@shared/contracts/v1'
import type { ConversationRepository } from './repository'
import type {
  AppendConversationMessageRequest,
  ConversationMessageRecord,
  ConversationRecord,
  ConversationServiceFailure,
  ConversationServiceResult,
  ConversationThreadRecord,
  CreateConversationRequest,
  GetConversationRequest,
  ListRecentConversationsRequest,
  SetConversationActiveAppSessionRequest,
  UpdateConversationMetadataRequest,
} from './types'

export interface ConversationServiceOptions {
  now?: () => string
}

export class ConversationService {
  private readonly now: () => string

  constructor(
    private readonly repository: ConversationRepository,
    options: ConversationServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  async createConversation(
    request: CreateConversationRequest
  ): Promise<ConversationServiceResult<ConversationThreadRecord>> {
    const conversationId = this.normalizeIdentifier(request.conversationId)
    const userId = this.normalizeIdentifier(request.userId)
    if (!conversationId || !userId) {
      return this.failure('invalid-request', 'conversationId and userId are required.')
    }

    const existingConversation = await this.repository.getConversation(conversationId)
    if (existingConversation) {
      return this.failure(
        'conversation-already-exists',
        `Conversation "${conversationId}" already exists.`
      )
    }

    if (request.metadata !== undefined && !this.isPlainObject(request.metadata)) {
      return this.failure('invalid-request', 'metadata must be a plain object when provided.')
    }

    const createdAt = this.now()
    const conversation: ConversationRecord = {
      conversationId,
      userId,
      title: this.normalizeOptionalText(request.title),
      status: 'active',
      activeAppSessionId: this.normalizeOptionalIdentifier(request.activeAppSessionId),
      metadata: this.normalizeMetadata(request.metadata),
      lastMessageAt: null,
      lastActivityAt: createdAt,
      createdAt,
      updatedAt: createdAt,
      archivedAt: null,
      deletedAt: null,
    }

    await this.repository.saveConversation(conversation)
    return { ok: true, value: { conversation, messages: [] } }
  }

  async getConversation(
    request: GetConversationRequest
  ): Promise<ConversationServiceResult<ConversationThreadRecord>> {
    const conversationId = this.normalizeIdentifier(request.conversationId)
    if (!conversationId) {
      return this.failure('invalid-request', 'conversationId is required.')
    }

    const conversation = await this.repository.getConversation(conversationId)
    if (!conversation) {
      return this.failure('conversation-not-found', `Conversation "${conversationId}" was not found.`)
    }

    const messages = await this.repository.listMessagesByConversation(conversationId)
    return { ok: true, value: { conversation, messages } }
  }

  async listRecentConversations(request: ListRecentConversationsRequest): Promise<ConversationRecord[]> {
    const userId = this.normalizeIdentifier(request.userId)
    if (!userId) {
      return []
    }

    const limit = this.normalizeLimit(request.limit)
    const conversations = await this.repository.listConversationsByUser(userId)

    return conversations
      .filter((conversation) => conversation.deletedAt === null)
      .sort((left, right) => {
        const activityDelta = Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt)
        if (activityDelta !== 0) {
          return activityDelta
        }

        const updateDelta = Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
        if (updateDelta !== 0) {
          return updateDelta
        }

        return Date.parse(right.createdAt) - Date.parse(left.createdAt)
      })
      .slice(0, limit)
  }

  async appendMessage(
    request: AppendConversationMessageRequest
  ): Promise<ConversationServiceResult<ConversationThreadRecord>> {
    const conversationId = this.normalizeIdentifier(request.conversationId)
    const messageId = this.normalizeIdentifier(request.messageId)
    if (!conversationId || !messageId) {
      return this.failure('invalid-request', 'conversationId and messageId are required.')
    }

    const sequenceNo = this.normalizeSequence(request.sequenceNo)
    if (sequenceNo === undefined) {
      return this.failure('invalid-request', 'sequenceNo must be a non-negative integer.')
    }

    if (request.contentParts !== undefined && !Array.isArray(request.contentParts)) {
      return this.failure('invalid-request', 'contentParts must be an array when provided.')
    }

    if (request.metadata !== undefined && !this.isPlainObject(request.metadata)) {
      return this.failure('invalid-request', 'metadata must be a plain object when provided.')
    }

    const conversation = await this.repository.getConversation(conversationId)
    if (!conversation) {
      return this.failure('conversation-not-found', `Conversation "${conversationId}" was not found.`)
    }

    if (conversation.status !== 'active') {
      return this.failure(
        'conversation-not-open',
        `Conversation "${conversationId}" is not active and cannot receive new messages.`
      )
    }

    const existingMessage = await this.repository.getMessage(messageId)
    const existingSequenceMessage = await this.repository.getMessageByConversationAndSequence(
      conversationId,
      sequenceNo
    )

    const nextMessage: ConversationMessageRecord = {
      messageId,
      conversationId,
      userId: this.normalizeOptionalIdentifier(request.userId),
      role: request.role,
      sequenceNo,
      contentText: this.normalizeOptionalText(request.contentText),
      contentParts: request.contentParts ? [...request.contentParts] : [],
      metadata: this.normalizeMetadata(request.metadata),
      createdAt: this.now(),
    }

    if (existingMessage) {
      if (this.isSameMessage(existingMessage, nextMessage)) {
        const messages = await this.repository.listMessagesByConversation(conversationId)
        return { ok: true, value: { conversation, messages } }
      }

      return this.failure(
        'message-already-exists',
        `Message "${messageId}" already exists with different contents.`
      )
    }

    if (existingSequenceMessage) {
      return this.failure(
        'message-sequence-conflict',
        `Conversation "${conversationId}" already has a message at sequence ${sequenceNo}.`
      )
    }

    await this.repository.saveMessage(nextMessage)

    const updatedConversation: ConversationRecord = {
      ...conversation,
      lastMessageAt: nextMessage.createdAt,
      lastActivityAt: nextMessage.createdAt,
      updatedAt: nextMessage.createdAt,
    }
    await this.repository.saveConversation(updatedConversation)

    const messages = await this.repository.listMessagesByConversation(conversationId)
    return { ok: true, value: { conversation: updatedConversation, messages } }
  }

  async updateConversationMetadata(
    request: UpdateConversationMetadataRequest
  ): Promise<ConversationServiceResult<ConversationRecord>> {
    const conversationId = this.normalizeIdentifier(request.conversationId)
    if (!conversationId) {
      return this.failure('invalid-request', 'conversationId is required.')
    }

    const conversation = await this.repository.getConversation(conversationId)
    if (!conversation) {
      return this.failure('conversation-not-found', `Conversation "${conversationId}" was not found.`)
    }

    if (request.metadata !== undefined && !this.isPlainObject(request.metadata)) {
      return this.failure('invalid-request', 'metadata must be a plain object when provided.')
    }

    const updatedAt = this.now()
    const updatedConversation: ConversationRecord = {
      ...conversation,
      title:
        request.title === undefined ? conversation.title : this.normalizeOptionalText(request.title),
      metadata:
        request.metadata === undefined
          ? conversation.metadata
          : {
              ...conversation.metadata,
              ...request.metadata,
            },
      updatedAt,
      lastActivityAt: updatedAt,
    }

    await this.repository.saveConversation(updatedConversation)
    return { ok: true, value: updatedConversation }
  }

  async archiveConversation(
    conversationId: string
  ): Promise<ConversationServiceResult<ConversationRecord>> {
    const normalizedConversationId = this.normalizeIdentifier(conversationId)
    if (!normalizedConversationId) {
      return this.failure('invalid-request', 'conversationId is required.')
    }

    const conversation = await this.repository.getConversation(normalizedConversationId)
    if (!conversation) {
      return this.failure(
        'conversation-not-found',
        `Conversation "${normalizedConversationId}" was not found.`
      )
    }

    if (conversation.status === 'deleted') {
      return this.failure(
        'conversation-not-open',
        `Conversation "${normalizedConversationId}" is deleted and cannot be archived.`
      )
    }

    const updatedAt = this.now()
    const updatedConversation: ConversationRecord = {
      ...conversation,
      status: 'archived',
      archivedAt: conversation.archivedAt ?? updatedAt,
      updatedAt,
      lastActivityAt: updatedAt,
    }

    await this.repository.saveConversation(updatedConversation)
    return { ok: true, value: updatedConversation }
  }

  async setActiveAppSessionReference(
    request: SetConversationActiveAppSessionRequest
  ): Promise<ConversationServiceResult<ConversationRecord>> {
    const conversationId = this.normalizeIdentifier(request.conversationId)
    if (!conversationId) {
      return this.failure('invalid-request', 'conversationId is required.')
    }

    const conversation = await this.repository.getConversation(conversationId)
    if (!conversation) {
      return this.failure('conversation-not-found', `Conversation "${conversationId}" was not found.`)
    }

    if (conversation.status !== 'active') {
      return this.failure(
        'conversation-not-open',
        `Conversation "${conversationId}" is not active and cannot update active app context.`
      )
    }

    const activeAppSessionId = this.normalizeOptionalIdentifier(request.activeAppSessionId)
    const updatedAt = this.now()
    const updatedConversation: ConversationRecord = {
      ...conversation,
      activeAppSessionId,
      updatedAt,
      lastActivityAt: updatedAt,
    }

    await this.repository.saveConversation(updatedConversation)
    return { ok: true, value: updatedConversation }
  }

  private isSameMessage(
    left: ConversationMessageRecord,
    right: ConversationMessageRecord
  ): boolean {
    return (
      left.conversationId === right.conversationId &&
      left.userId === right.userId &&
      left.role === right.role &&
      left.sequenceNo === right.sequenceNo &&
      left.contentText === right.contentText &&
      JSON.stringify(left.contentParts) === JSON.stringify(right.contentParts) &&
      JSON.stringify(left.metadata) === JSON.stringify(right.metadata)
    )
  }

  private normalizeIdentifier(value: string | null | undefined): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : undefined
  }

  private normalizeOptionalIdentifier(value: string | null | undefined): string | null {
    const normalized = this.normalizeIdentifier(value)
    return normalized ?? null
  }

  private normalizeOptionalText(value: string | null | undefined): string | null {
    if (value === undefined) {
      return null
    }

    if (value === null) {
      return null
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  private normalizeMetadata(metadata: JsonObject | undefined): JsonObject {
    return metadata ? { ...metadata } : {}
  }

  private isPlainObject(value: unknown): value is JsonObject {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  private normalizeLimit(limit: number | undefined): number {
    if (typeof limit !== 'number' || Number.isNaN(limit) || limit <= 0) {
      return 20
    }

    return Math.min(Math.floor(limit), 100)
  }

  private normalizeSequence(sequenceNo: number): number | undefined {
    if (!Number.isInteger(sequenceNo) || sequenceNo < 0) {
      return undefined
    }

    return sequenceNo
  }

  private failure(
    code: ConversationServiceFailure['code'],
    message: string,
    details?: string[]
  ): ConversationServiceFailure {
    return {
      ok: false,
      code,
      message,
      details,
    }
  }
}
