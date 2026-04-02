import {
  exampleChessLaunchToolSchema,
  exampleConversationAppContext,
  exampleInternalChessManifest,
  examplePlannerDashboardToolSchema,
  examplePublicWeatherManifest,
  exampleWeatherLookupToolSchema,
} from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import type { AvailableToolRecord } from '../tool-discovery'
import { ToolRoutingService } from './service'

function createToolRecord(
  overrides: Partial<AvailableToolRecord> & Pick<AvailableToolRecord, 'appId' | 'appName' | 'appSlug' | 'appVersionId' | 'appVersion' | 'category' | 'distribution' | 'authType' | 'toolName' | 'tool' | 'authRequirement' | 'availabilityReason'>,
): AvailableToolRecord {
  return {
    isFromActiveApp: false,
    ...overrides,
  }
}

function createService() {
  return new ToolRoutingService({
    now: () => '2026-04-01T12:00:00.000Z',
  })
}

describe('ToolRoutingService', () => {
  it('routes clear requests to the expected app tool', () => {
    const service = createService()
    const decision = service.routeToolRequest({
      conversationId: 'conversation.1',
      userId: 'user.1',
      userRequest: "Let's play chess.",
      availableTools: [
        createToolRecord({
          appId: exampleInternalChessManifest.appId,
          appName: exampleInternalChessManifest.name,
          appSlug: exampleInternalChessManifest.slug,
          appVersionId: `${exampleInternalChessManifest.appId}@${exampleInternalChessManifest.appVersion}`,
          appVersion: exampleInternalChessManifest.appVersion,
          category: 'games',
          distribution: exampleInternalChessManifest.distribution,
          authType: exampleInternalChessManifest.authType,
          toolName: exampleChessLaunchToolSchema.name,
          tool: exampleChessLaunchToolSchema,
          authRequirement: exampleChessLaunchToolSchema.authRequirement,
          availabilityReason: 'platform-authenticated',
        }),
        createToolRecord({
          appId: examplePublicWeatherManifest.appId,
          appName: examplePublicWeatherManifest.name,
          appSlug: examplePublicWeatherManifest.slug,
          appVersionId: `${examplePublicWeatherManifest.appId}@${examplePublicWeatherManifest.appVersion}`,
          appVersion: examplePublicWeatherManifest.appVersion,
          category: 'weather',
          distribution: examplePublicWeatherManifest.distribution,
          authType: examplePublicWeatherManifest.authType,
          toolName: exampleWeatherLookupToolSchema.name,
          tool: exampleWeatherLookupToolSchema,
          authRequirement: exampleWeatherLookupToolSchema.authRequirement,
          availabilityReason: 'none-required',
        }),
      ],
    })

    expect(decision.kind).toBe('invoke-tool')
    if (decision.kind !== 'invoke-tool') {
      return
    }

    expect(decision.selectedTool.appId).toBe(exampleInternalChessManifest.appId)
    expect(decision.selectedTool.toolName).toBe(exampleChessLaunchToolSchema.name)
    expect(decision.routingSignals).toContain('tool-token-match')
  })

  it('asks for clarification when multiple tools are equally plausible', () => {
    const service = createService()
    const decision = service.routeToolRequest({
      conversationId: 'conversation.2',
      userId: 'user.2',
      userRequest: 'open',
      availableTools: [
        createToolRecord({
          appId: 'planner.app',
          appName: 'Planner App',
          appSlug: 'planner',
          appVersionId: 'planner.app@1.0.0',
          appVersion: '1.0.0',
          category: 'productivity',
          distribution: 'authenticated-external',
          authType: 'oauth2',
          toolName: 'planner.open-dashboard',
          tool: examplePlannerDashboardToolSchema,
          authRequirement: examplePlannerDashboardToolSchema.authRequirement,
          availabilityReason: 'app-oauth-connected',
        }),
        createToolRecord({
          appId: 'notes.app',
          appName: 'Notes App',
          appSlug: 'notes',
          appVersionId: 'notes.app@1.0.0',
          appVersion: '1.0.0',
          category: 'productivity',
          distribution: 'internal',
          authType: 'platform-session',
          toolName: 'notes.open-dashboard',
          tool: {
            ...examplePlannerDashboardToolSchema,
            name: 'notes.open-dashboard',
          },
          authRequirement: 'platform-session',
          availabilityReason: 'platform-authenticated',
        }),
      ],
    })

    expect(decision.kind).toBe('clarify')
    if (decision.kind !== 'clarify') {
      return
    }

    expect(decision.clarificationQuestion).toContain('Planner App')
    expect(decision.clarificationQuestion).toContain('Notes App')
    expect(decision.reason).toBe('generic-tool-request')
    expect(decision.routingSignals).toContain('generic-action-request')
    expect(decision.options).toHaveLength(2)
  })

  it('falls back to plain chat for unrelated requests', () => {
    const service = createService()
    const decision = service.routeToolRequest({
      conversationId: 'conversation.3',
      userId: 'user.3',
      userRequest: 'Tell me a joke about penguins.',
      availableTools: [
        createToolRecord({
          appId: examplePublicWeatherManifest.appId,
          appName: examplePublicWeatherManifest.name,
          appSlug: examplePublicWeatherManifest.slug,
          appVersionId: `${examplePublicWeatherManifest.appId}@${examplePublicWeatherManifest.appVersion}`,
          appVersion: examplePublicWeatherManifest.appVersion,
          category: 'weather',
          distribution: examplePublicWeatherManifest.distribution,
          authType: examplePublicWeatherManifest.authType,
          toolName: exampleWeatherLookupToolSchema.name,
          tool: exampleWeatherLookupToolSchema,
          authRequirement: exampleWeatherLookupToolSchema.authRequirement,
          availabilityReason: 'none-required',
        }),
      ],
    })

    expect(decision.kind).toBe('plain-chat')
    if (decision.kind !== 'plain-chat') {
      return
    }

    expect(decision.reason).toBe('unrelated-request')
    expect(decision.refusalMessage).toContain('unrelated')
    expect(decision.routingSignals).toContain('unrelated-request')
  })

  it('prefers the active app when it is the best available follow-up target', () => {
    const service = createService()
    const decision = service.routeToolRequest({
      conversationId: 'conversation.4',
      userId: 'user.4',
      userRequest: 'continue',
      activeAppContext: exampleConversationAppContext,
      availableTools: [
        createToolRecord({
          appId: 'chess.internal',
          appName: 'Chess Tutor',
          appSlug: 'chess',
          appVersionId: 'chess.internal@1.0.0',
          appVersion: '1.0.0',
          category: 'games',
          distribution: 'internal',
          authType: 'platform-session',
          toolName: exampleChessLaunchToolSchema.name,
          tool: exampleChessLaunchToolSchema,
          authRequirement: exampleChessLaunchToolSchema.authRequirement,
          availabilityReason: 'platform-authenticated',
          isFromActiveApp: true,
        }),
      ],
    })

    expect(decision.kind).toBe('invoke-tool')
    if (decision.kind !== 'invoke-tool') {
      return
    }

    expect(decision.selectedCandidate.isActiveApp).toBe(true)
    expect(decision.activeAppId).toBe(exampleConversationAppContext.activeApp?.appId ?? null)
  })

  it('builds a traceable queue request for the logging layer', () => {
    const service = createService()
    const decision = service.routeToolRequest({
      conversationId: 'conversation.5',
      userId: 'user.5',
      userRequest: 'weather in Chicago',
      availableTools: [
        createToolRecord({
          appId: examplePublicWeatherManifest.appId,
          appName: examplePublicWeatherManifest.name,
          appSlug: examplePublicWeatherManifest.slug,
          appVersionId: `${examplePublicWeatherManifest.appId}@${examplePublicWeatherManifest.appVersion}`,
          appVersion: examplePublicWeatherManifest.appVersion,
          category: 'weather',
          distribution: examplePublicWeatherManifest.distribution,
          authType: examplePublicWeatherManifest.authType,
          toolName: exampleWeatherLookupToolSchema.name,
          tool: exampleWeatherLookupToolSchema,
          authRequirement: exampleWeatherLookupToolSchema.authRequirement,
          availabilityReason: 'none-required',
        }),
      ],
    })

    expect(decision.kind).toBe('invoke-tool')
    if (decision.kind !== 'invoke-tool') {
      return
    }

    const invocation = service.buildToolInvocationRequest(decision, {
      toolCallId: 'tool-call.weather.1',
      requestPayloadJson: {
        location: 'Chicago, IL',
      },
      correlationId: 'correlation.1',
      requestMessageId: 'message.1',
    })

    expect(invocation.toolCallId).toBe('tool-call.weather.1')
    expect(invocation.appId).toBe(examplePublicWeatherManifest.appId)
    expect(invocation.toolName).toBe(exampleWeatherLookupToolSchema.name)
    expect(invocation.routing.decisionKind).toBe('invoke-tool')
    expect(invocation.metadata).toBeDefined()
    const metadata = invocation.metadata
    if (!metadata) {
      return
    }

    expect(metadata.routing).toMatchObject({
      decisionKind: 'invoke-tool',
      activeAppId: null,
    })
    expect(metadata.transitionLog?.[0].status).toBe('queued')
  })

  it('asks for clarification when the request explicitly mentions multiple apps', () => {
    const service = createService()
    const decision = service.routeToolRequest({
      conversationId: 'conversation.6',
      userId: 'user.6',
      userRequest: 'Should I use chess or weather?',
      availableTools: [
        createToolRecord({
          appId: exampleInternalChessManifest.appId,
          appName: exampleInternalChessManifest.name,
          appSlug: exampleInternalChessManifest.slug,
          appVersionId: `${exampleInternalChessManifest.appId}@${exampleInternalChessManifest.appVersion}`,
          appVersion: exampleInternalChessManifest.appVersion,
          category: 'games',
          distribution: exampleInternalChessManifest.distribution,
          authType: exampleInternalChessManifest.authType,
          toolName: exampleChessLaunchToolSchema.name,
          tool: exampleChessLaunchToolSchema,
          authRequirement: exampleChessLaunchToolSchema.authRequirement,
          availabilityReason: 'platform-authenticated',
        }),
        createToolRecord({
          appId: examplePublicWeatherManifest.appId,
          appName: examplePublicWeatherManifest.name,
          appSlug: examplePublicWeatherManifest.slug,
          appVersionId: `${examplePublicWeatherManifest.appId}@${examplePublicWeatherManifest.appVersion}`,
          appVersion: examplePublicWeatherManifest.appVersion,
          category: 'weather',
          distribution: examplePublicWeatherManifest.distribution,
          authType: examplePublicWeatherManifest.authType,
          toolName: exampleWeatherLookupToolSchema.name,
          tool: exampleWeatherLookupToolSchema,
          authRequirement: exampleWeatherLookupToolSchema.authRequirement,
          availabilityReason: 'none-required',
        }),
      ],
    })

    expect(decision.kind).toBe('clarify')
    if (decision.kind !== 'clarify') {
      return
    }

    expect(decision.reason).toBe('explicit-app-conflict')
    expect(decision.routingSignals).toContain('explicit-app-conflict')
    expect(decision.options.map((option) => option.appSlug)).toEqual(
      expect.arrayContaining([exampleInternalChessManifest.slug, examplePublicWeatherManifest.slug])
    )
  })

  it('stays in plain chat for follow-up language when there is no active app session', () => {
    const service = createService()
    const decision = service.routeToolRequest({
      conversationId: 'conversation.7',
      userId: 'user.7',
      userRequest: 'continue with that one',
      availableTools: [
        createToolRecord({
          appId: examplePublicWeatherManifest.appId,
          appName: examplePublicWeatherManifest.name,
          appSlug: examplePublicWeatherManifest.slug,
          appVersionId: `${examplePublicWeatherManifest.appId}@${examplePublicWeatherManifest.appVersion}`,
          appVersion: examplePublicWeatherManifest.appVersion,
          category: 'weather',
          distribution: examplePublicWeatherManifest.distribution,
          authType: examplePublicWeatherManifest.authType,
          toolName: exampleWeatherLookupToolSchema.name,
          tool: exampleWeatherLookupToolSchema,
          authRequirement: exampleWeatherLookupToolSchema.authRequirement,
          availabilityReason: 'none-required',
        }),
      ],
    })

    expect(decision.kind).toBe('plain-chat')
    if (decision.kind !== 'plain-chat') {
      return
    }

    expect(decision.reason).toBe('missing-active-app')
    expect(decision.routingSignals).toContain('missing-active-app')
    expect(decision.refusalMessage).toContain('no active app session')
  })
})
