import { describe, expect, it } from 'vitest'
import { InMemoryConversationRepository } from './repository'
import { ConversationService } from './service'

function createClock() {
  let current = new Date('2026-04-01T12:00:00.000Z').getTime()

  return () => {
    const timestamp = new Date(current).toISOString()
    current += 1000
    return timestamp
  }
}

function createService() {
  return new ConversationService(new InMemoryConversationRepository(), {
    now: createClock(),
  })
}

describe('ConversationService', () => {
  it('creates a conversation and appends ordered messages', async () => {
    const service = createService()

    const created = await service.createConversation({
      conversationId: 'conversation.1',
      userId: 'user.1',
      title: 'Lesson 1',
      metadata: {
        subject: 'math',
      },
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    expect(created.value.conversation.conversationId).toBe('conversation.1')
    expect(created.value.conversation.activeAppSessionId).toBeNull()

    const firstMessage = await service.appendMessage({
      conversationId: 'conversation.1',
      messageId: 'message.1',
      userId: 'user.1',
      role: 'user',
      sequenceNo: 0,
      contentText: 'Hi',
      contentParts: [{ type: 'text', value: 'Hi' }],
      metadata: {
        source: 'chat',
      },
    })

    expect(firstMessage.ok).toBe(true)
    if (!firstMessage.ok) {
      return
    }

    const secondMessage = await service.appendMessage({
      conversationId: 'conversation.1',
      messageId: 'message.2',
      role: 'assistant',
      sequenceNo: 1,
      contentText: 'Hello there',
    })

    expect(secondMessage.ok).toBe(true)
    if (!secondMessage.ok) {
      return
    }

    expect(secondMessage.value.conversation.lastMessageAt).toBe('2026-04-01T12:00:02.000Z')
    expect(secondMessage.value.messages.map((message) => message.messageId)).toEqual(['message.1', 'message.2'])
  })

  it('returns the thread with persisted messages on fetch', async () => {
    const service = createService()

    await service.createConversation({
      conversationId: 'conversation.2',
      userId: 'user.2',
    })
    await service.appendMessage({
      conversationId: 'conversation.2',
      messageId: 'message.3',
      userId: 'user.2',
      role: 'user',
      sequenceNo: 0,
      contentText: 'Show me chess.',
    })

    const result = await service.getConversation({ conversationId: 'conversation.2' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.conversation.conversationId).toBe('conversation.2')
      expect(result.value.messages).toHaveLength(1)
      expect(result.value.messages[0].messageId).toBe('message.3')
    }
  })

  it('lists recent conversations for a user in recency order', async () => {
    const service = createService()

    const first = await service.createConversation({
      conversationId: 'conversation.3',
      userId: 'user.3',
    })
    expect(first.ok).toBe(true)

    const second = await service.createConversation({
      conversationId: 'conversation.4',
      userId: 'user.3',
    })
    expect(second.ok).toBe(true)

    await service.appendMessage({
      conversationId: 'conversation.4',
      messageId: 'message.4',
      userId: 'user.3',
      role: 'user',
      sequenceNo: 0,
      contentText: 'Latest thread',
    })

    const recent = await service.listRecentConversations({ userId: 'user.3', limit: 10 })

    expect(recent.map((conversation) => conversation.conversationId)).toEqual(['conversation.4', 'conversation.3'])
  })

  it('updates active app references and metadata independently from message history', async () => {
    const service = createService()

    await service.createConversation({
      conversationId: 'conversation.5',
      userId: 'user.4',
    })

    const updatedReference = await service.setActiveAppSessionReference({
      conversationId: 'conversation.5',
      activeAppSessionId: 'app-session.chess.1',
    })

    expect(updatedReference.ok).toBe(true)
    if (!updatedReference.ok) {
      return
    }

    expect(updatedReference.value.activeAppSessionId).toBe('app-session.chess.1')

    const updatedMetadata = await service.updateConversationMetadata({
      conversationId: 'conversation.5',
      title: 'Updated title',
      metadata: {
        topic: 'lesson-review',
      },
    })

    expect(updatedMetadata.ok).toBe(true)
    if (!updatedMetadata.ok) {
      return
    }

    expect(updatedMetadata.value.title).toBe('Updated title')
    expect(updatedMetadata.value.metadata.topic).toBe('lesson-review')
  })

  it('rejects duplicate conversations and duplicate message sequence numbers', async () => {
    const service = createService()

    const created = await service.createConversation({
      conversationId: 'conversation.6',
      userId: 'user.5',
    })
    expect(created.ok).toBe(true)

    const duplicateConversation = await service.createConversation({
      conversationId: 'conversation.6',
      userId: 'user.5',
    })
    expect(duplicateConversation).toEqual({
      ok: false,
      code: 'conversation-already-exists',
      message: 'Conversation "conversation.6" already exists.',
      details: undefined,
    })

    const firstMessage = await service.appendMessage({
      conversationId: 'conversation.6',
      messageId: 'message.6',
      userId: 'user.5',
      role: 'user',
      sequenceNo: 0,
      contentText: 'First',
    })
    expect(firstMessage.ok).toBe(true)

    const duplicateSequence = await service.appendMessage({
      conversationId: 'conversation.6',
      messageId: 'message.7',
      role: 'assistant',
      sequenceNo: 0,
      contentText: 'Second',
    })

    expect(duplicateSequence).toEqual({
      ok: false,
      code: 'message-sequence-conflict',
      message: 'Conversation "conversation.6" already has a message at sequence 0.',
      details: undefined,
    })
  })

  it('archives a conversation and stops new message appends', async () => {
    const service = createService()

    await service.createConversation({
      conversationId: 'conversation.7',
      userId: 'user.6',
    })

    const archived = await service.archiveConversation('conversation.7')
    expect(archived.ok).toBe(true)
    if (!archived.ok) {
      return
    }

    expect(archived.value.status).toBe('archived')

    const appendAfterArchive = await service.appendMessage({
      conversationId: 'conversation.7',
      messageId: 'message.8',
      userId: 'user.6',
      role: 'user',
      sequenceNo: 0,
      contentText: 'Should not be appended',
    })

    expect(appendAfterArchive).toEqual({
      ok: false,
      code: 'conversation-not-open',
      message: 'Conversation "conversation.7" is not active and cannot receive new messages.',
      details: undefined,
    })
  })
})
