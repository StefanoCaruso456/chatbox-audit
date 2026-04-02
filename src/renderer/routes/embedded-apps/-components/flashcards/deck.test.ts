import { describe, expect, it } from 'vitest'
import { buildStudyDeck } from './deck'

describe('buildStudyDeck', () => {
  it('returns the same deck for the same topic', () => {
    const left = buildStudyDeck('fractions')
    const right = buildStudyDeck('fractions')

    expect(left).toEqual(right)
  })

  it('falls back to a default topic for blank input', () => {
    expect(buildStudyDeck('   ').topic).toBe('fractions')
  })
})
