import type { ConversationMessageRecord, ConversationRecord } from './types'

export interface ConversationRepository {
  getConversation(conversationId: string): Promise<ConversationRecord | undefined>
  listConversationsByUser(userId: string): Promise<ConversationRecord[]>
  saveConversation(record: ConversationRecord): Promise<void>
  getMessage(messageId: string): Promise<ConversationMessageRecord | undefined>
  getMessageByConversationAndSequence(
    conversationId: string,
    sequenceNo: number
  ): Promise<ConversationMessageRecord | undefined>
  listMessagesByConversation(conversationId: string): Promise<ConversationMessageRecord[]>
  saveMessage(record: ConversationMessageRecord): Promise<void>
}

export class InMemoryConversationRepository implements ConversationRepository {
  private readonly conversationsById = new Map<string, ConversationRecord>()

  private readonly messagesById = new Map<string, ConversationMessageRecord>()

  private readonly messagesByConversationId = new Map<string, Map<number, ConversationMessageRecord>>()

  async getConversation(conversationId: string): Promise<ConversationRecord | undefined> {
    const conversation = this.conversationsById.get(conversationId)
    return conversation ? structuredClone(conversation) : undefined
  }

  async listConversationsByUser(userId: string): Promise<ConversationRecord[]> {
    return Array.from(this.conversationsById.values())
      .filter((conversation) => conversation.userId === userId && conversation.deletedAt === null)
      .map((conversation) => structuredClone(conversation))
  }

  async saveConversation(record: ConversationRecord): Promise<void> {
    this.conversationsById.set(record.conversationId, structuredClone(record))
  }

  async getMessage(messageId: string): Promise<ConversationMessageRecord | undefined> {
    const message = this.messagesById.get(messageId)
    return message ? structuredClone(message) : undefined
  }

  async getMessageByConversationAndSequence(
    conversationId: string,
    sequenceNo: number
  ): Promise<ConversationMessageRecord | undefined> {
    const sequenceMap = this.messagesByConversationId.get(conversationId)
    const message = sequenceMap?.get(sequenceNo)
    return message ? structuredClone(message) : undefined
  }

  async listMessagesByConversation(conversationId: string): Promise<ConversationMessageRecord[]> {
    const sequenceMap = this.messagesByConversationId.get(conversationId)
    if (!sequenceMap) {
      return []
    }

    return Array.from(sequenceMap.values())
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
      .map((message) => structuredClone(message))
  }

  async saveMessage(record: ConversationMessageRecord): Promise<void> {
    this.messagesById.set(record.messageId, structuredClone(record))

    const sequenceMap = this.messagesByConversationId.get(record.conversationId) ?? new Map<number, ConversationMessageRecord>()
    sequenceMap.set(record.sequenceNo, structuredClone(record))
    this.messagesByConversationId.set(record.conversationId, sequenceMap)
  }
}
