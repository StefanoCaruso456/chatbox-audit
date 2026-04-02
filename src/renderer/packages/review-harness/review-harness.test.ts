import { describe, expect, it } from 'vitest'
import { buildReviewHarnessConfig } from '@/packages/review-harness/review-harness'

describe('buildReviewHarnessConfig', () => {
  it('derives a stable runtime config from search params', () => {
    const config = buildReviewHarnessConfig({
      appId: 'flashcards.public',
      appName: 'Flashcards Coach',
      entryUrl: 'https://staging.example.com/flashcards',
      allowedOrigins: 'https://staging.example.com',
    })

    expect(config.appId).toBe('flashcards.public')
    expect(config.appName).toBe('Flashcards Coach')
    expect(config.targetOrigin).toBe('https://staging.example.com')
    expect(config.allowedOrigins).toEqual(['https://staging.example.com'])
    expect(config.appSessionId).toBe('review.flashcards.public')
    expect(config.runtimeWarnings).toEqual([])
  })

  it('flags mismatched target origin and allowlist issues for reviewers', () => {
    const config = buildReviewHarnessConfig({
      entryUrl: 'https://staging.example.com/app',
      targetOrigin: 'https://review.example.com',
      allowedOrigins: 'https://staging.example.com',
    })

    expect(config.runtimeWarnings).toEqual([
      'Target origin is not present in the declared allowlist.',
      'Entry URL origin does not match the expected target origin.',
    ])
  })

  it('normalizes bare domain allowlist entries into https origins', () => {
    const config = buildReviewHarnessConfig({
      entryUrl: 'https://candidate.example.com/app',
      allowedOrigins: 'candidate.example.com, candidate.example.com ',
    })

    expect(config.allowedOrigins).toEqual(['https://candidate.example.com'])
  })
})
