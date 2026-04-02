import type { ConversationAppContext, ToolJsonSchema } from '@shared/contracts/v1'
import type { AvailableToolRecord } from '../tool-discovery'
import type {
  BuildToolInjectionRequest,
  CompactToolSchemaPreview,
  ToolInjectionErrorCode,
  ToolInjectionPayload,
  ToolInjectionPayloadResult,
  ToolInjectionSchemaPreview,
  ToolInjectionToolDeclaration,
} from './types'

export interface ToolInjectionServiceOptions {
  now?: () => string
}

export class ToolInjectionService {
  private readonly now: () => string

  constructor(options: ToolInjectionServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  buildInjectionPayload(request: BuildToolInjectionRequest): ToolInjectionPayloadResult {
    const normalizedTools = this.normalizeEligibleTools(request.eligibleTools)
    const conversationContext = request.conversationContext ?? null
    const activeAppId = this.normalizeIdentifier(conversationContext?.activeApp?.appId)
    const activeToolNames = this.normalizeToolNameList(conversationContext?.activeApp?.availableToolNames)
    const preferActiveApp = true
    const maxToolCount = this.normalizeBound(request.maxToolCount, 6, 1, 20)
    const maxToolsPerApp = this.normalizeBound(request.maxToolsPerApp, 3, 1, 10)
    const maxSchemaDepth = this.normalizeBound(request.maxSchemaDepth, 3, 1, 6)
    const maxSchemaProperties = this.normalizeBound(request.maxSchemaProperties, 6, 1, 12)
    const maxPromptLineLength = this.normalizeBound(request.maxPromptLineLength, 220, 80, 400)

    const orderedTools = this.orderTools(normalizedTools, activeAppId, activeToolNames, preferActiveApp)
    const selectedTools = this.applyLimits(orderedTools, maxToolCount, maxToolsPerApp)
    const omittedTools = orderedTools.slice(selectedTools.length)

    const toolDeclarations = selectedTools.map((tool, index) =>
      this.toToolDeclaration(tool, index, {
        activeAppId,
        activeToolNames,
        maxSchemaDepth,
        maxSchemaProperties,
        maxPromptLineLength,
      })
    )

    const promptFragments = this.buildPromptFragments({
      conversationContext,
      activeAppId,
      activeToolNames,
      toolDeclarations,
      selectedToolCount: selectedTools.length,
      omittedToolCount: omittedTools.length,
    })

    const includedAppIds = [...new Set(toolDeclarations.map((tool) => tool.appId))]
    const omittedAppIds = [...new Set(omittedTools.map((tool) => tool.appId))].filter(
      (appId) => !includedAppIds.includes(appId)
    )

    return {
      ok: true,
      value: {
        version: 'v1',
        generatedAt: this.now(),
        conversationId: conversationContext?.conversationId ?? null,
        activeAppId,
        activeToolNames,
        selection: {
          maxToolCount,
          maxToolsPerApp,
          includedToolCount: toolDeclarations.length,
          omittedToolCount: omittedTools.length,
          includedAppIds,
          omittedAppIds,
          activeAppId,
          preferActiveApp,
          activeAppToolNameCount: activeToolNames.length,
        },
        toolDeclarations,
        promptFragments,
      },
    }
  }

  private toToolDeclaration(
    tool: AvailableToolRecord,
    index: number,
    options: {
      activeAppId: string | null
      activeToolNames: string[]
      maxSchemaDepth: number
      maxSchemaProperties: number
      maxPromptLineLength: number
    }
  ): ToolInjectionToolDeclaration {
    const schemaPreview = this.buildSchemaPreview(tool.tool.inputSchema, {
      maxDepth: options.maxSchemaDepth,
      maxProperties: options.maxSchemaProperties,
    })
    const schemaPreviewJson = this.stableStringify(schemaPreview)
    const schemaPreviewRecord: ToolInjectionSchemaPreview = {
      schemaJson: schemaPreviewJson,
      truncated: schemaPreview.truncated === true,
      characters: schemaPreviewJson.length,
    }

    const isPreferredByContext =
      options.activeAppId === tool.appId &&
      (options.activeToolNames.length === 0 || options.activeToolNames.includes(tool.toolName))

    const promptLine = this.truncateText(
      [
        `#${index + 1}`,
      `app=${tool.appName}`,
      `tool=${tool.toolName}`,
      `auth=${tool.authRequirement}`,
      `mode=${tool.tool.invocationMode}`,
      `active=${tool.isFromActiveApp ? 'yes' : 'no'}`,
      `priority=${isPreferredByContext ? 'high' : 'normal'}`,
      `schema=${schemaPreviewJson}`,
    ].join(' | '),
      options.maxPromptLineLength
    ) ?? ''

    return {
      appId: tool.appId,
      appName: tool.appName,
      appSlug: tool.appSlug,
      appVersionId: tool.appVersionId,
      appVersion: tool.appVersion,
      category: tool.category,
      distribution: tool.distribution,
      authType: tool.authType,
      toolName: tool.toolName,
      description: tool.tool.description,
      authRequirement: tool.authRequirement,
      invocationMode: tool.tool.invocationMode,
      idempotent: tool.tool.idempotent,
      timeoutMs: tool.tool.timeoutMs,
      requiredPermissions: tool.tool.requiredPermissions,
      availabilityReason: tool.availabilityReason,
      isFromActiveApp: tool.isFromActiveApp || options.activeAppId === tool.appId,
      isPreferredByContext,
      tool: tool.tool,
      schemaPreview: schemaPreviewRecord,
      promptLine,
    }
  }

  private buildPromptFragments(input: {
    conversationContext: ConversationAppContext | null
    activeAppId: string | null
    activeToolNames: string[]
    toolDeclarations: ToolInjectionToolDeclaration[]
    selectedToolCount: number
    omittedToolCount: number
  }): string[] {
    const fragments: string[] = []

    fragments.push('Use only the injected tools below when a tool call is needed.')
    fragments.push('Prefer the active app first, then the remaining tools in the order provided.')

    if (input.toolDeclarations.length === 0) {
      fragments.push('No tools are currently eligible; continue with plain chat.')
    }

    if (input.activeAppId) {
      fragments.push(
        input.activeToolNames.length > 0
          ? `Active app ${input.activeAppId} exposes tools: ${input.activeToolNames.join(', ')}.`
          : `Active app ${input.activeAppId} is available for follow-up context.`
      )
    }

    if (input.conversationContext) {
      fragments.push(
        `Conversation context strategy: ${input.conversationContext.selection.strategy}; included sessions: ${input.conversationContext.selection.includedSessionIds.join(', ')}.`
      )
    }

    for (const declaration of input.toolDeclarations) {
      fragments.push(declaration.promptLine)
    }

    fragments.push(
      `Injected ${input.selectedToolCount} tool${input.selectedToolCount === 1 ? '' : 's'}; omitted ${input.omittedToolCount}.`
    )

    return fragments
  }

  private buildSchemaPreview(
    schema: ToolJsonSchema,
    limits: { maxDepth: number; maxProperties: number }
  ): CompactToolSchemaPreview {
    return this.buildSchemaPreviewInner(schema, 0, limits)
  }

  private buildSchemaPreviewInner(
    schema: ToolJsonSchema,
    depth: number,
    limits: { maxDepth: number; maxProperties: number }
  ): CompactToolSchemaPreview {
    if (depth >= limits.maxDepth) {
      return {
        type: schema.type,
        truncated: true,
      }
    }

    const preview: CompactToolSchemaPreview = {
      type: schema.type,
      title: this.truncateText(schema.title ?? '', 80),
      description: this.truncateText(schema.description ?? '', 120),
      nullable: schema.nullable,
      truncated: false,
    }

    if (schema.default !== undefined) {
      preview.default = schema.default
    }

    if (schema.examples) {
      preview.examples = schema.examples.slice(0, 4)
      if (schema.examples.length > 4) {
        preview.truncated = true
      }
    }

    if (schema.enum) {
      preview.enum = schema.enum.slice(0, 6)
      if (schema.enum.length > 6) {
        preview.truncated = true
      }
    }

    if (schema.required) {
      preview.required = schema.required.slice(0, limits.maxProperties)
      if (schema.required.length > limits.maxProperties) {
        preview.truncated = true
      }
    }

    if (schema.type === 'object' && schema.properties) {
      const propertyEntries = Object.entries(schema.properties)
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, limits.maxProperties)

      const properties = Object.fromEntries(
        propertyEntries.map(([name, propertySchema]) => [
          name,
          this.buildSchemaPreviewInner(propertySchema, depth + 1, limits),
        ])
      )
      preview.properties = properties

      if (Object.values(properties).some((property) => property.truncated === true)) {
        preview.truncated = true
      }

      if (Object.keys(schema.properties).length > limits.maxProperties) {
        preview.truncated = true
      }
    }

    if (schema.type === 'array' && schema.items) {
      preview.items = Array.isArray(schema.items)
        ? schema.items.slice(0, limits.maxProperties).map((item) =>
            this.buildSchemaPreviewInner(item, depth + 1, limits)
          )
        : this.buildSchemaPreviewInner(schema.items, depth + 1, limits)

      if (
        (Array.isArray(preview.items) && preview.items.some((item) => item.truncated === true)) ||
        (!Array.isArray(preview.items) && preview.items.truncated === true)
      ) {
        preview.truncated = true
      }

      if (Array.isArray(schema.items) && schema.items.length > limits.maxProperties) {
        preview.truncated = true
      }
    }

    if (schema.additionalProperties !== undefined) {
      preview.additionalProperties =
        typeof schema.additionalProperties === 'boolean'
          ? schema.additionalProperties
          : this.buildSchemaPreviewInner(schema.additionalProperties, depth + 1, limits)
    }

    return preview
  }

  private orderTools(
    tools: AvailableToolRecord[],
    activeAppId: string | null,
    activeToolNames: string[],
    preferActiveApp: boolean
  ): AvailableToolRecord[] {
    return [...tools].sort((left, right) => {
      if (preferActiveApp && activeAppId) {
        const leftActive = left.appId === activeAppId
        const rightActive = right.appId === activeAppId
        if (leftActive !== rightActive) {
          return leftActive ? -1 : 1
        }

        if (leftActive && rightActive && activeToolNames.length > 0) {
          const leftIndex = activeToolNames.indexOf(left.toolName)
          const rightIndex = activeToolNames.indexOf(right.toolName)
          if (leftIndex !== rightIndex) {
            const normalizedLeft = leftIndex === -1 ? Number.POSITIVE_INFINITY : leftIndex
            const normalizedRight = rightIndex === -1 ? Number.POSITIVE_INFINITY : rightIndex
            if (normalizedLeft !== normalizedRight) {
              return normalizedLeft - normalizedRight
            }
          }
        }
      }

      const appNameComparison = left.appName.localeCompare(right.appName)
      if (appNameComparison !== 0) {
        return appNameComparison
      }

      const appIdComparison = left.appId.localeCompare(right.appId)
      if (appIdComparison !== 0) {
        return appIdComparison
      }

      return left.toolName.localeCompare(right.toolName)
    })
  }

  private applyLimits(
    orderedTools: AvailableToolRecord[],
    maxToolCount: number,
    maxToolsPerApp: number
  ): AvailableToolRecord[] {
    const perAppCount = new Map<string, number>()
    const selected: AvailableToolRecord[] = []

    for (const tool of orderedTools) {
      if (selected.length >= maxToolCount) {
        break
      }

      const currentCount = perAppCount.get(tool.appId) ?? 0
      if (currentCount >= maxToolsPerApp) {
        continue
      }

      selected.push(tool)
      perAppCount.set(tool.appId, currentCount + 1)
    }

    return selected
  }

  private normalizeEligibleTools(tools: AvailableToolRecord[]): AvailableToolRecord[] {
    const deduped = new Map<string, AvailableToolRecord>()

    for (const tool of tools) {
      const key = `${tool.appId}::${tool.toolName}`
      if (!deduped.has(key)) {
        deduped.set(key, tool)
      }
    }

    return [...deduped.values()]
  }

  private normalizeIdentifier(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  private normalizeToolNameList(values: string[] | undefined): string[] {
    if (!values || values.length === 0) {
      return []
    }

    return values
      .map((value) => this.normalizeIdentifier(value))
      .filter((value): value is string => value !== null)
  }

  private normalizeBound(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
      return fallback
    }

    return Math.min(Math.max(Math.floor(value), minimum), maximum)
  }

  private truncateText(value: string | undefined, maxLength: number): string {
    if (!value) {
      return ''
    }

    if (value.length === 0) {
      return value
    }

    if (value.length <= maxLength) {
      return value
    }

    return `${value.slice(0, maxLength - 1)}…`
  }

  private stableStringify(value: unknown): string {
    return JSON.stringify(this.sortValue(value))
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortValue(item))
    }

    if (!value || typeof value !== 'object') {
      return value
    }

    const record = value as Record<string, unknown>
    return Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = this.sortValue(record[key])
        return accumulator
      }, {})
  }

  private failure(code: ToolInjectionErrorCode, message: string): ToolInjectionPayloadResult {
    return {
      ok: false,
      domain: 'tool-injection',
      code,
      message,
      retryable: false,
    }
  }
}
