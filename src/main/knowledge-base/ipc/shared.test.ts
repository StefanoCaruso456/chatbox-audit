import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../adapters/sentry', () => ({
  sentry: {
    withScope: (callback: (scope: { setTag: () => void; setExtra: () => void }) => void) =>
      callback({
        setTag: () => {},
        setExtra: () => {},
      }),
    captureException: vi.fn(),
  },
}))

vi.mock('../../util', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('../db', () => ({
  getVectorStore: vi.fn(),
  parseSQLiteTimestamp: (value: string) => Date.parse(`${value} UTC`),
}))

let shared: typeof import('./shared')

beforeAll(async () => {
  shared = await import('./shared.js')
})

describe('knowledge-base ipc shared helpers', () => {
  it('parses document parser configs when present', () => {
    expect(shared.parseDocumentParser('{"type":"mineru","mineru":{"apiToken":"test"}}')).toEqual({
      type: 'mineru',
      mineru: { apiToken: 'test' },
    })
    expect(shared.parseDocumentParser(null)).toBeUndefined()
  })

  it('returns readable messages for unknown errors', () => {
    expect(shared.getErrorMessage(new Error('boom'))).toBe('boom')
    expect(shared.getErrorMessage('boom')).toBe('boom')
  })

  it('rejects invalid ids', () => {
    expect(() => shared.assertValidKnowledgeBaseId(0)).toThrow('Invalid knowledge base ID')
    expect(() => shared.assertValidFileId(-1)).toThrow('Invalid file ID')
  })
})
