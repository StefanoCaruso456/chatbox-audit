import {
  exampleAuthenticatedPlannerManifest,
  exampleInternalChessManifest,
  examplePublicFlashcardsManifest,
} from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { InMemoryAppRegistryRepository } from './repository'
import { AppRegistryService } from './service'

function createService() {
  return new AppRegistryService(new InMemoryAppRegistryRepository(), {
    now: () => '2026-04-01T12:00:00.000Z',
  })
}

describe('AppRegistryService', () => {
  it('registers a valid app manifest', async () => {
    const service = createService()

    const result = await service.registerApp({
      manifest: exampleInternalChessManifest,
      category: 'games',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.appId).toBe(exampleInternalChessManifest.appId)
      expect(result.value.currentVersion.appVersion).toBe(exampleInternalChessManifest.appVersion)
      expect(result.value.currentVersionId).toBe(`${exampleInternalChessManifest.appId}@${exampleInternalChessManifest.appVersion}`)
      expect(result.value.category).toBe('games')
      expect(result.value.reviewStatus).toBe('approved')
    }
  })

  it('rejects invalid manifests with validation details', async () => {
    const service = createService()

    const result = await service.registerApp({
      manifest: {
        ...examplePublicFlashcardsManifest,
        authType: 'magic-ticket',
      },
      category: 'utilities',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('invalid-manifest')
      expect(result.details?.some((detail) => detail.includes('authType'))).toBe(true)
    }
  })

  it('enforces non-empty category metadata', async () => {
    const service = createService()

    const result = await service.registerApp({
      manifest: examplePublicFlashcardsManifest,
      category: '   ',
    })

    expect(result).toEqual({
      ok: false,
      domain: 'registry',
      code: 'invalid-category',
      message: 'App registration requires a non-empty category.',
      details: undefined,
      retryable: false,
    })
  })

  it('blocks slug conflicts across different app ids', async () => {
    const service = createService()

    await service.registerApp({
      manifest: exampleInternalChessManifest,
      category: 'games',
    })

    const result = await service.registerApp({
      manifest: {
        ...examplePublicFlashcardsManifest,
        slug: exampleInternalChessManifest.slug,
      },
      category: 'study',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('slug-conflict')
    }
  })

  it('tracks version history and updates the current version pointer', async () => {
    const service = createService()

    const first = await service.registerApp({
      manifest: examplePublicFlashcardsManifest,
      category: 'study',
    })
    expect(first.ok).toBe(true)

    const second = await service.registerApp({
      manifest: {
        ...examplePublicFlashcardsManifest,
        appVersion: '1.1.0',
        shortDescription: 'Review topic-based flashcards with guided study prompts inside chat.',
      },
      category: 'study',
    })

    expect(second.ok).toBe(true)
    if (second.ok) {
      expect(second.value.currentVersion.appVersion).toBe('1.1.0')
      expect(second.value.versions).toHaveLength(2)
    }
  })

  it('rejects re-registering the same app version with different manifest contents', async () => {
    const service = createService()

    await service.registerApp({
      manifest: exampleAuthenticatedPlannerManifest,
      category: 'productivity',
    })

    const result = await service.registerApp({
      manifest: {
        ...exampleAuthenticatedPlannerManifest,
        shortDescription: 'Changed description for the same version.',
      },
      category: 'productivity',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('version-conflict')
    }
  })

  it('supports approved-only filtering for list and get operations', async () => {
    const service = createService()

    await service.registerApp({
      manifest: exampleInternalChessManifest,
      category: 'games',
    })
    await service.registerApp({
      manifest: exampleAuthenticatedPlannerManifest,
      category: 'productivity',
    })

    const approvedApps = await service.listApps({ approvedOnly: true })
    expect(approvedApps.map((app) => app.appId)).toEqual([exampleInternalChessManifest.appId])

    const blockedLookup = await service.getApp({
      appId: exampleAuthenticatedPlannerManifest.appId,
      approvedOnly: true,
    })
    expect(blockedLookup).toEqual({
      ok: false,
      domain: 'registry',
      code: 'not-approved',
      message: `App "${exampleAuthenticatedPlannerManifest.appId}" is not approved for registry exposure.`,
      details: undefined,
      retryable: false,
    })
  })
})
