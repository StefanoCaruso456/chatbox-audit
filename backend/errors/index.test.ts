import { describe, expect, it } from 'vitest'
import { failureResult, toApiErrorBody } from './index'

describe('backend/errors', () => {
  it('creates normalized failure results with a shared domain-aware shape', () => {
    expect(
      failureResult('conversation', 'conversation-not-found', 'Conversation "conversation.1" was not found.')
    ).toEqual({
      ok: false,
      domain: 'conversation',
      code: 'conversation-not-found',
      message: 'Conversation "conversation.1" was not found.',
      details: undefined,
      retryable: false,
    })
  })

  it('maps failures into a consistent API error body', () => {
    const failure = failureResult('registry', 'slug-conflict', 'App slug "weather" is already in use.', {
      details: ['slug must be unique'],
    })

    expect(toApiErrorBody(failure)).toEqual({
      ok: false,
      error: {
        domain: 'registry',
        code: 'slug-conflict',
        message: 'App slug "weather" is already in use.',
        details: ['slug must be unique'],
        retryable: false,
      },
    })
  })
})
