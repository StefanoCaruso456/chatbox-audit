import {
  exampleAuthenticatedPlannerManifest,
  exampleConversationAppContext,
  exampleInternalChessManifest,
  examplePublicFlashcardsManifest,
} from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { AppRegistryService, InMemoryAppRegistryRepository } from '../../registry'
import { AvailableToolDiscoveryService } from '../tool-discovery'
import { ToolInjectionService } from './service'

async function createEligibleTools() {
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

  const discovery = new AvailableToolDiscoveryService(registry)
  const result = await discovery.discoverAvailableTools({
    approvedOnly: false,
    platformAuthenticated: true,
    appOAuthStates: {
      [exampleAuthenticatedPlannerManifest.appId]: 'connected',
    },
  })

  return result.tools
}

describe('ToolInjectionService', () => {
  it('builds deterministic tool declarations and prompt fragments', async () => {
    const service = new ToolInjectionService({
      now: () => '2026-04-01T12:00:00.000Z',
    })
    const eligibleTools = await createEligibleTools()

    const result = service.buildInjectionPayload({
      eligibleTools,
      conversationContext: exampleConversationAppContext,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.version).toBe('v1')
    expect(result.value.toolDeclarations).toHaveLength(3)
    expect(result.value.toolDeclarations[0].isFromActiveApp).toBe(true)
    expect(result.value.promptFragments[0]).toBe('Use only the injected tools below when a tool call is needed.')
    expect(result.value.promptFragments.at(-1)).toBe('Injected 3 tools; omitted 0.')
  })

  it('prioritizes active-app tools and marks context preference explicitly', async () => {
    const service = new ToolInjectionService({
      now: () => '2026-04-01T12:00:00.000Z',
    })
    const eligibleTools = await createEligibleTools()
    const conversationContext = {
      ...exampleConversationAppContext,
      activeApp: {
        ...exampleConversationAppContext.activeApp!,
        appId: examplePublicFlashcardsManifest.appId,
        appSessionId: 'app-session.flashcards.active',
        availableToolNames: ['flashcards.start-session'],
      },
    }

    const result = service.buildInjectionPayload({
      eligibleTools,
      conversationContext,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.activeAppId).toBe(examplePublicFlashcardsManifest.appId)
    expect(result.value.toolDeclarations[0].appId).toBe(examplePublicFlashcardsManifest.appId)
    expect(result.value.toolDeclarations[0].isPreferredByContext).toBe(true)
  })

  it('enforces bounded truncation when tool and schema limits are low', async () => {
    const service = new ToolInjectionService({
      now: () => '2026-04-01T12:00:00.000Z',
    })
    const eligibleTools = await createEligibleTools()

    const result = service.buildInjectionPayload({
      eligibleTools,
      conversationContext: exampleConversationAppContext,
      maxToolCount: 1,
      maxToolsPerApp: 1,
      maxSchemaDepth: 1,
      maxSchemaProperties: 1,
      maxPromptLineLength: 80,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.toolDeclarations).toHaveLength(1)
    expect(result.value.selection.omittedToolCount).toBeGreaterThan(0)
    expect(result.value.toolDeclarations[0].schemaPreview.truncated).toBe(true)
    expect(result.value.toolDeclarations[0].promptLine.length).toBeLessThanOrEqual(80)
  })

  it('produces stable output for the same inputs', async () => {
    const service = new ToolInjectionService({
      now: () => '2026-04-01T12:00:00.000Z',
    })
    const eligibleTools = await createEligibleTools()

    const first = service.buildInjectionPayload({
      eligibleTools,
      conversationContext: exampleConversationAppContext,
    })
    const second = service.buildInjectionPayload({
      eligibleTools,
      conversationContext: exampleConversationAppContext,
    })

    expect(first).toEqual(second)
  })
})
