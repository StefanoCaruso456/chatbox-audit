import {
  exampleAuthenticatedPlannerManifest,
  exampleInternalChessManifest,
  examplePublicFlashcardsManifest,
} from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { InMemoryAppRegistryRepository } from '../../registry'
import { AppRegistryService } from '../../registry/service'
import { AvailableToolDiscoveryService } from './service'

async function createDiscoveryService() {
  const registry = new AppRegistryService(new InMemoryAppRegistryRepository(), {
    now: () => '2026-04-01T12:00:00.000Z',
  })

  await registry.registerApp({
    manifest: exampleInternalChessManifest,
    category: 'games',
  })
  await registry.registerApp({
    manifest: examplePublicFlashcardsManifest,
    category: 'study',
  })
  await registry.registerApp({
    manifest: exampleAuthenticatedPlannerManifest,
    category: 'productivity',
  })

  return new AvailableToolDiscoveryService(registry)
}

describe('AvailableToolDiscoveryService', () => {
  it('returns only currently eligible tools based on approval and auth readiness', async () => {
    const service = await createDiscoveryService()

    const result = await service.discoverAvailableTools({
      platformAuthenticated: false,
      appOAuthStates: {},
    })

    expect(result.tools.map((tool) => tool.toolName)).toEqual(['flashcards.start-session'])
    expect(result.selection.includedAppIds).toEqual([
      exampleInternalChessManifest.appId,
      examplePublicFlashcardsManifest.appId,
    ])
  })

  it('includes platform-session and app-oauth tools when the caller is auth-ready', async () => {
    const service = await createDiscoveryService()

    const result = await service.discoverAvailableTools({
      approvedOnly: false,
      platformAuthenticated: true,
      appOAuthStates: {
        [exampleAuthenticatedPlannerManifest.appId]: 'connected',
      },
    })

    expect(result.tools.map((tool) => tool.toolName)).toEqual([
      'chess.launch-game',
      'flashcards.start-session',
      'planner.open-dashboard',
    ])
    expect(result.tools.map((tool) => tool.availabilityReason)).toEqual([
      'platform-authenticated',
      'none-required',
      'app-oauth-connected',
    ])
  })

  it('prioritizes tools from the active app when requested', async () => {
    const service = await createDiscoveryService()

    const result = await service.discoverAvailableTools({
      platformAuthenticated: true,
      appOAuthStates: {
        [exampleAuthenticatedPlannerManifest.appId]: 'connected',
      },
      activeAppId: examplePublicFlashcardsManifest.appId,
      preferActiveApp: true,
    })

    expect(result.tools[0].appId).toBe(examplePublicFlashcardsManifest.appId)
    expect(result.tools[0].isFromActiveApp).toBe(true)
  })

  it('supports deterministic app filtering with include and exclude lists', async () => {
    const service = await createDiscoveryService()

    const result = await service.discoverAvailableTools({
      platformAuthenticated: true,
      includeAppIds: [exampleInternalChessManifest.appId, examplePublicFlashcardsManifest.appId],
      excludeAppIds: [exampleInternalChessManifest.appId],
    })

    expect(result.tools.map((tool) => tool.appId)).toEqual([examplePublicFlashcardsManifest.appId])
    expect(result.selection.includedAppIds).toEqual([examplePublicFlashcardsManifest.appId])
    expect(result.selection.omittedAppIds).toEqual([
      exampleInternalChessManifest.appId,
    ])
  })

  it('supports registry-level auth type and distribution filtering', async () => {
    const service = await createDiscoveryService()

    const result = await service.discoverAvailableTools({
      approvedOnly: true,
      authType: 'none',
      distribution: 'public-external',
    })

    expect(result.tools.map((tool) => tool.toolName)).toEqual(['flashcards.start-session'])
  })
})
