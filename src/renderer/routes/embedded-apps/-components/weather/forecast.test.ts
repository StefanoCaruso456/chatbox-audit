import { describe, expect, it } from 'vitest'
import { buildDeterministicForecast } from './forecast'

describe('buildDeterministicForecast', () => {
  it('returns the same forecast for the same location', () => {
    const left = buildDeterministicForecast('Austin, TX')
    const right = buildDeterministicForecast('Austin, TX')

    expect(left).toEqual(right)
  })

  it('falls back to a default location for blank input', () => {
    expect(buildDeterministicForecast('   ').location).toBe('Chicago, IL')
  })
})
