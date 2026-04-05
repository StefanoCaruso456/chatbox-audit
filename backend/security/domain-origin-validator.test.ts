import { exampleAuthenticatedPlannerManifest, exampleInternalChessManifest, examplePublicFlashcardsManifest } from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { validateDomainOriginSubmission, validateManifestOriginConsistency } from './domain-origin-validator'

describe('domain-origin-validator', () => {
  it('accepts a consistent HTTPS submission with matching declared domains and origins', () => {
    const report = validateDomainOriginSubmission({
      appId: 'flashcards.public',
      appVersionId: '1.0.0',
      entryUrl: 'https://apps.chatbridge.dev/flashcards',
      targetOrigin: 'https://apps.chatbridge.dev',
      allowedOrigins: ['https://apps.chatbridge.dev'],
      declaredDomains: ['apps.chatbridge.dev'],
      declaredOrigins: ['https://apps.chatbridge.dev'],
    })

    expect(report.ok).toBe(true)
    expect(report.issues).toHaveLength(0)
    expect(report.entryOrigin).toBe('https://apps.chatbridge.dev')
  })

  it('rejects wildcard origins and non-HTTPS values', () => {
    const report = validateDomainOriginSubmission({
      appId: 'planner.oauth',
      appVersionId: '2.0.0',
      entryUrl: 'http://*.chatbridge.dev/planner',
      targetOrigin: 'http://*.chatbridge.dev',
      allowedOrigins: ['https://*.chatbridge.dev'],
    })

    expect(report.ok).toBe(false)
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['unsafe-wildcard-usage', 'origin-not-https'])
    )
  })

  it('rejects entryUrl and targetOrigin mismatches', () => {
    const report = validateDomainOriginSubmission({
      appId: 'chess.internal',
      appVersionId: '1.0.0',
      entryUrl: 'https://apps.chatbridge.dev/chess',
      targetOrigin: 'https://embedded.chatbridge.dev',
      allowedOrigins: ['https://apps.chatbridge.dev'],
    })

    expect(report.ok).toBe(false)
    expect(report.issues.some((issue) => issue.code === 'entry-origin-mismatch')).toBe(true)
    expect(report.issues.some((issue) => issue.code === 'target-origin-not-allowed')).toBe(true)
  })

  it('rejects declared origin mismatches even when the platform allowlist is valid', () => {
    const report = validateDomainOriginSubmission({
      appId: 'flashcards.public',
      appVersionId: '1.0.0',
      entryUrl: 'https://apps.chatbridge.dev/flashcards',
      targetOrigin: 'https://apps.chatbridge.dev',
      allowedOrigins: ['https://apps.chatbridge.dev'],
      declaredOrigins: ['https://elsewhere.example.com'],
    })

    expect(report.ok).toBe(false)
    expect(report.issues.some((issue) => issue.code === 'declared-origin-mismatch')).toBe(true)
  })

  it('rejects declared domains that do not normalize to the approved origins', () => {
    const report = validateDomainOriginSubmission({
      appId: 'planner.oauth',
      appVersionId: '2.0.0',
      entryUrl: 'https://planner.chatbridge.dev',
      targetOrigin: 'https://planner.chatbridge.dev',
      allowedOrigins: ['https://planner.chatbridge.dev'],
      declaredDomains: ['planner.example.com'],
    })

    expect(report.ok).toBe(false)
    expect(report.issues.some((issue) => issue.code === 'declared-domain-mismatch')).toBe(true)
  })

  it('validates manifest origin consistency with declared domains and origins', () => {
    const report = validateManifestOriginConsistency(
      exampleAuthenticatedPlannerManifest,
      ['planner.chatbridge.dev'],
      ['https://planner.chatbridge.dev']
    )

    expect(report.ok).toBe(true)
    expect(report.issues).toHaveLength(0)
  })

  it('rejects manifests that have an approved target origin but a mismatched declared domain', () => {
    const report = validateManifestOriginConsistency(
      {
        ...examplePublicFlashcardsManifest,
        uiEmbedConfig: {
          ...examplePublicFlashcardsManifest.uiEmbedConfig,
          entryUrl: 'https://flashcards.chatbridge.dev',
          targetOrigin: 'https://flashcards.chatbridge.dev',
        },
        allowedOrigins: ['https://flashcards.chatbridge.dev'],
      },
      ['study.chatbridge.dev']
    )

    expect(report.ok).toBe(false)
    expect(report.issues.some((issue) => issue.code === 'declared-domain-mismatch')).toBe(true)
  })

  it('rejects empty allowed origins', () => {
    const report = validateDomainOriginSubmission({
      appId: exampleInternalChessManifest.appId,
      appVersionId: exampleInternalChessManifest.appVersion,
      entryUrl: exampleInternalChessManifest.uiEmbedConfig.entryUrl,
      targetOrigin: exampleInternalChessManifest.uiEmbedConfig.targetOrigin,
      allowedOrigins: [],
    })

    expect(report.ok).toBe(false)
    expect(report.issues.some((issue) => issue.code === 'empty-origin-set')).toBe(true)
  })
})
