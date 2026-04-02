import {
  type AppManifest,
  type AppSessionAuthState,
  type ConversationAppContext,
  exampleAuthenticatedPlannerManifest,
  exampleInternalChessManifest,
  examplePublicWeatherManifest,
  parseConversationAppContext,
  type ToolSchema,
} from '@shared/contracts/v1'
import type { JsonObject } from '@shared/contracts/v1/shared'
import { createMessage, type Message, type MessageEmbeddedAppPart } from '@shared/types'
import { v4 as uuidv4 } from 'uuid'
import {
  AvailableToolDiscoveryService,
  type ToolRouteDecision,
  ToolRoutingService,
} from '../../../../backend/orchestration'
import { type AppRegistryRecord, AppRegistryService, InMemoryAppRegistryRepository } from '../../../../backend/registry'

type LocalAppCategory = 'games' | 'utilities' | 'productivity'

type LocalAppDefinition = {
  routePath: `/embedded-apps/${string}`
  category: LocalAppCategory
  manifest: AppManifest
}

type LocalAppPlatform = {
  registry: AppRegistryService
  discovery: AvailableToolDiscoveryService
  routing: ToolRoutingService
  apps: AppRegistryRecord[]
  appsById: Map<string, AppRegistryRecord>
}

export type TutorMeAiInterceptionResult =
  | {
      kind: 'invoke-tool'
      message: Message
    }
  | {
      kind: 'clarify'
      message: Message
    }
  | {
      kind: 'pass-through'
    }

type RouteTutorMeAiAppRequestInput = {
  origin: string
  conversationId: string
  userId: string
  userRequest: string
  requestMessageId: string
  previousMessages: Message[]
}

const localPlatformCache = new Map<string, Promise<LocalAppPlatform>>()

function buildLocalManifest(
  origin: string,
  manifest: AppManifest,
  routePath: LocalAppDefinition['routePath']
): AppManifest {
  return {
    ...manifest,
    allowedOrigins: [origin],
    uiEmbedConfig: {
      ...manifest.uiEmbedConfig,
      entryUrl: `${origin}${routePath}`,
      targetOrigin: origin,
    },
    safetyMetadata: {
      ...manifest.safetyMetadata,
      reviewStatus: 'approved',
    },
  }
}

function getLocalAppDefinitions(origin: string): LocalAppDefinition[] {
  return [
    {
      category: 'games',
      routePath: '/embedded-apps/chess',
      manifest: buildLocalManifest(origin, exampleInternalChessManifest, '/embedded-apps/chess'),
    },
    {
      category: 'utilities',
      routePath: '/embedded-apps/weather',
      manifest: buildLocalManifest(origin, examplePublicWeatherManifest, '/embedded-apps/weather'),
    },
    {
      category: 'productivity',
      routePath: '/embedded-apps/planner',
      manifest: {
        ...buildLocalManifest(origin, exampleAuthenticatedPlannerManifest, '/embedded-apps/planner'),
        slug: 'planner',
      },
    },
  ]
}

async function createLocalAppPlatform(origin: string): Promise<LocalAppPlatform> {
  const repository = new InMemoryAppRegistryRepository()
  const registry = new AppRegistryService(repository)
  const definitions = getLocalAppDefinitions(origin)

  for (const definition of definitions) {
    const result = await registry.registerApp({
      category: definition.category,
      manifest: definition.manifest,
    })

    if (!result.ok) {
      throw new Error(`Failed to register local TutorMeAI app "${definition.manifest.appId}": ${result.message}`)
    }
  }

  const apps = await registry.listApps({ approvedOnly: true })

  return {
    registry,
    discovery: new AvailableToolDiscoveryService(registry),
    routing: new ToolRoutingService(),
    apps,
    appsById: new Map(apps.map((app) => [app.appId, app])),
  }
}

function getLocalAppPlatform(origin: string): Promise<LocalAppPlatform> {
  const normalizedOrigin = origin.trim()
  const existing = localPlatformCache.get(normalizedOrigin)
  if (existing) {
    return existing
  }

  const created = createLocalAppPlatform(normalizedOrigin)
  localPlatformCache.set(normalizedOrigin, created)
  return created
}

function hasSupportedOrigin(origin: string) {
  return /^https?:\/\//i.test(origin)
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ')
}

function hasLaunchIntent(userRequest: string): boolean {
  const normalized = normalizeComparable(userRequest)
  const launchKeywords = [
    'play',
    'start',
    'launch',
    'open',
    'use',
    'show',
    'check',
    'connect',
    'resume',
    'forecast',
    'weather',
    'chess',
    'planner',
    'dashboard',
  ]

  return launchKeywords.some((keyword) => normalized.includes(keyword))
}

function extractLocation(userRequest: string): string {
  const zipMatch = userRequest.match(/\b\d{5}(?:-\d{4})?\b/)
  if (zipMatch) {
    return zipMatch[0]
  }

  const phraseMatch = userRequest.match(/\b(?:in|for|at)\s+([A-Za-z][A-Za-z\s,.-]{1,48})$/u)
  if (phraseMatch?.[1]) {
    return phraseMatch[1].trim().replace(/[?.!]+$/u, '')
  }

  const weatherMatch = userRequest.match(/\bweather\s+([A-Za-z][A-Za-z\s,.-]{1,48})$/iu)
  if (weatherMatch?.[1]) {
    return weatherMatch[1].trim().replace(/[?.!]+$/u, '')
  }

  return 'Chicago, IL'
}

function extractPlannerFocus(userRequest: string): 'today' | 'week' | 'overdue' {
  const normalized = normalizeComparable(userRequest)
  if (normalized.includes('overdue') || normalized.includes('late')) {
    return 'overdue'
  }
  if (normalized.includes('week') || normalized.includes('weekly')) {
    return 'week'
  }
  return 'today'
}

function buildToolArguments(tool: ToolSchema, userRequest: string): JsonObject {
  if (tool.name === 'chess.launch-game') {
    return {
      mode: normalizeComparable(userRequest).includes('analysis') ? 'analysis' : 'practice',
    }
  }

  if (tool.name === 'weather.lookup') {
    return {
      location: extractLocation(userRequest),
    }
  }

  if (tool.name === 'planner.open-dashboard') {
    return {
      focus: extractPlannerFocus(userRequest),
    }
  }

  return {}
}

function buildSandboxValue(manifest: AppManifest): string | undefined {
  const sandboxTokens = ['allow-scripts']

  if (manifest.uiEmbedConfig.sandbox.allowForms) {
    sandboxTokens.push('allow-forms')
  }

  if (manifest.uiEmbedConfig.sandbox.allowPopups) {
    sandboxTokens.push('allow-popups')
  }

  if (manifest.uiEmbedConfig.sandbox.allowSameOrigin) {
    sandboxTokens.push('allow-same-origin')
  }

  return sandboxTokens.join(' ')
}

function inferPartAuthState(part: MessageEmbeddedAppPart): AppSessionAuthState {
  const stateFromBootstrap = part.bridge?.bootstrap?.authState
  if (stateFromBootstrap) {
    return stateFromBootstrap
  }

  if (part.bridge?.completion && part.bridge.completion.status === 'succeeded') {
    return 'connected'
  }

  return 'not-required'
}

function partToActiveContext(
  conversationId: string,
  part: MessageEmbeddedAppPart,
  generatedAt: string
): ConversationAppContext | null {
  const completion = part.bridge?.completion
  const summary = part.summary ?? completion?.resultSummary ?? `${part.appName} is active in chat.`
  const latestStateDigest = completion?.result ?? part.bridge?.bootstrap?.initialState ?? undefined
  const authState = inferPartAuthState(part)
  const availableToolNames = part.bridge?.bootstrap?.availableTools?.map((tool) => tool.name)
  const appSessionId = part.bridge?.appSessionId ?? part.appSessionId
  if (!appSessionId) {
    return null
  }

  const sessionTimeline = [
    {
      appSessionId,
      appId: part.appId,
      status: completion ? 'completed' : part.status === 'loading' ? 'pending' : 'active',
      summary,
      updatedAt: generatedAt,
      latestSequence: completion ? 2 : 1,
      latestStateDigest,
    },
  ]

  return parseConversationAppContext({
    version: 'v1',
    conversationId,
    generatedAt,
    activeApp: completion
      ? null
      : {
          ...sessionTimeline[0],
          authState,
          currentToolCallId: part.bridge?.pendingInvocation?.toolCallId,
          resumableUntil: undefined,
          availableToolNames,
        },
    recentCompletions: completion
      ? [
          {
            appSessionId,
            appId: part.appId,
            status: completion.status,
            resultSummary: completion.resultSummary ?? summary,
            completedAt: generatedAt,
            followUpContext: {
              summary: completion.resultSummary ?? summary,
              userVisibleSummary: part.summary,
              stateDigest: completion.result,
            },
          },
        ]
      : [],
    sessionTimeline,
    selection: {
      strategy: completion ? 'recent-completions-only' : 'active-plus-recent-completions',
      includedSessionIds: [appSessionId],
      omittedSessionCount: 0,
    },
  })
}

function deriveConversationAppContext(
  conversationId: string,
  previousMessages: Message[],
  generatedAt: string
): ConversationAppContext | null {
  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const message = previousMessages[index]
    const parts = message.contentParts ?? []
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex]
      if (part.type !== 'embedded-app') {
        continue
      }

      return partToActiveContext(conversationId, part, generatedAt)
    }
  }

  return null
}

function deriveAppOAuthStates(previousMessages: Message[]): Record<string, 'connected' | 'expired' | 'missing'> {
  const states: Record<string, 'connected' | 'expired' | 'missing'> = {}

  for (const message of previousMessages) {
    for (const part of message.contentParts ?? []) {
      if (part.type !== 'embedded-app') {
        continue
      }

      const authState = inferPartAuthState(part)
      if (authState === 'connected') {
        states[part.appId] = 'connected'
      } else if (authState === 'expired') {
        states[part.appId] = 'expired'
      } else if (!states[part.appId]) {
        states[part.appId] = 'missing'
      }
    }
  }

  return states
}

function shouldInterceptInvoke(decision: Extract<ToolRouteDecision, { kind: 'invoke-tool' }>, userRequest: string) {
  if (hasLaunchIntent(userRequest)) {
    return true
  }

  return decision.routingSignals.some((signal) =>
    ['exact-tool-name', 'exact-tool-display-name', 'exact-app-name', 'exact-app-slug'].includes(signal)
  )
}

function buildClarificationMessage(text: string): Message {
  const message = createMessage('assistant', text)
  message.generating = false
  message.status = []
  return message
}

function buildLaunchCopy(appName: string, authState: AppSessionAuthState) {
  if (authState === 'required') {
    return `Opening ${appName}. You'll need to connect your account before the app can finish the request.`
  }

  return `Launching ${appName} inside chat.`
}

function buildEmbeddedAppMessagePart(input: {
  app: AppRegistryRecord
  conversationId: string
  userRequest: string
  tool: ToolSchema
  toolArguments: JsonObject
  authState: AppSessionAuthState
}): MessageEmbeddedAppPart {
  const manifest = input.app.currentVersion.manifest
  const appSessionId = `app-session.${input.app.slug}.${uuidv4()}`
  const toolCallId = `tool-call.${input.app.slug}.${uuidv4()}`
  const correlationId = `corr.${input.app.slug}.${uuidv4()}`
  const expectedOrigin = manifest.uiEmbedConfig.targetOrigin
  const launchSummary =
    input.authState === 'required'
      ? `Connect ${input.app.name} to continue with ${input.tool.displayName ?? input.tool.name}.`
      : `${input.app.name} is preparing ${input.tool.displayName ?? input.tool.name}.`

  return {
    type: 'embedded-app',
    appId: input.app.appId,
    appName: input.app.name,
    appSessionId,
    sourceUrl: manifest.uiEmbedConfig.entryUrl,
    title: input.app.name,
    summary: launchSummary,
    status: 'loading',
    minHeight: manifest.uiEmbedConfig.preferredSize?.defaultHeight ?? 520,
    aspectRatio: undefined,
    sandbox: buildSandboxValue(manifest),
    allowedOrigin: expectedOrigin,
    bridge: {
      expectedOrigin,
      conversationId: input.conversationId,
      appSessionId,
      handshakeToken: `runtime.${input.app.slug}.${uuidv4()}`,
      heartbeatTimeoutMs: input.tool.timeoutMs,
      bootstrap: {
        launchReason: 'chat-tool',
        authState: input.authState,
        grantedPermissions: manifest.permissions,
        messageId: `bootstrap.${input.app.slug}.${uuidv4()}`,
        correlationId,
        initialState: {
          requestedByUser: input.userRequest,
          toolName: input.tool.name,
        },
        availableTools: manifest.toolDefinitions,
      },
      pendingInvocation: {
        toolCallId,
        toolName: input.tool.name,
        arguments: input.toolArguments,
        timeoutMs: input.tool.timeoutMs,
        messageId: `invoke.${input.app.slug}.${uuidv4()}`,
        correlationId,
      },
    },
  }
}

function buildLaunchMessage(input: {
  app: AppRegistryRecord
  conversationId: string
  userRequest: string
  tool: ToolSchema
  toolArguments: JsonObject
  authState: AppSessionAuthState
}): Message {
  const launchMessage = createMessage('assistant', buildLaunchCopy(input.app.name, input.authState))
  launchMessage.contentParts = [
    {
      type: 'text',
      text: buildLaunchCopy(input.app.name, input.authState),
    },
    buildEmbeddedAppMessagePart(input),
  ]
  launchMessage.generating = false
  launchMessage.status = []
  return launchMessage
}

function findAuthGatedAppMatch(
  userRequest: string,
  apps: AppRegistryRecord[],
  appOAuthStates: Record<string, 'connected' | 'expired' | 'missing'>
) {
  const normalized = normalizeComparable(userRequest)
  return apps.find((app) => {
    if (app.authType !== 'oauth2') {
      return false
    }

    if (appOAuthStates[app.appId] === 'connected') {
      return false
    }

    return normalized.includes(normalizeComparable(app.name)) || normalized.includes(normalizeComparable(app.slug))
  })
}

export async function routeTutorMeAiAppRequest(
  input: RouteTutorMeAiAppRequestInput
): Promise<TutorMeAiInterceptionResult> {
  if (!hasSupportedOrigin(input.origin)) {
    return { kind: 'pass-through' }
  }

  const platform = await getLocalAppPlatform(input.origin)
  const generatedAt = new Date().toISOString()
  const activeAppContext = deriveConversationAppContext(input.conversationId, input.previousMessages, generatedAt)
  const appOAuthStates = deriveAppOAuthStates(input.previousMessages)

  const discoveryResult = await platform.discovery.discoverAvailableTools({
    approvedOnly: true,
    activeAppId: activeAppContext?.activeApp?.appId ?? null,
    platformAuthenticated: true,
    appOAuthStates,
  })

  const routingDecision = platform.routing.routeToolRequest({
    conversationId: input.conversationId,
    userId: input.userId,
    userRequest: input.userRequest,
    availableTools: discoveryResult.tools,
    activeAppContext,
    requestMessageId: input.requestMessageId,
  })

  if (
    routingDecision.kind === 'clarify' &&
    (hasLaunchIntent(input.userRequest) || routingDecision.reason === 'generic-tool-request')
  ) {
    return {
      kind: 'clarify',
      message: buildClarificationMessage(routingDecision.clarificationQuestion),
    }
  }

  if (routingDecision.kind === 'invoke-tool' && shouldInterceptInvoke(routingDecision, input.userRequest)) {
    const selectedApp = platform.appsById.get(routingDecision.selectedTool.appId)
    if (!selectedApp) {
      return { kind: 'pass-through' }
    }

    const authState =
      selectedApp.authType === 'oauth2'
        ? appOAuthStates[selectedApp.appId] === 'connected'
          ? 'connected'
          : appOAuthStates[selectedApp.appId] === 'expired'
            ? 'expired'
            : 'required'
        : 'connected'

    return {
      kind: 'invoke-tool',
      message: buildLaunchMessage({
        app: selectedApp,
        conversationId: input.conversationId,
        userRequest: input.userRequest,
        tool: routingDecision.selectedTool.tool,
        toolArguments: buildToolArguments(routingDecision.selectedTool.tool, input.userRequest),
        authState,
      }),
    }
  }

  if (routingDecision.kind === 'plain-chat' && hasLaunchIntent(input.userRequest)) {
    const authGatedApp = findAuthGatedAppMatch(input.userRequest, platform.apps, appOAuthStates)
    if (authGatedApp) {
      const tool = authGatedApp.currentVersion.manifest.toolDefinitions[0]
      return {
        kind: 'invoke-tool',
        message: buildLaunchMessage({
          app: authGatedApp,
          conversationId: input.conversationId,
          userRequest: input.userRequest,
          tool,
          toolArguments: buildToolArguments(tool, input.userRequest),
          authState: appOAuthStates[authGatedApp.appId] === 'expired' ? 'expired' : 'required',
        }),
      }
    }

    const normalizedRequest = normalizeComparable(input.userRequest)
    if (normalizedRequest.includes('app') || normalizedRequest.includes('tool')) {
      return {
        kind: 'clarify',
        message: buildClarificationMessage(
          'Which app would you like to open: Chess Tutor, Weather Lookup, or Planner Connect?'
        ),
      }
    }
  }

  return { kind: 'pass-through' }
}
