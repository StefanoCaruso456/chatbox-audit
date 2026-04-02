import type {
  AppAuthType,
  AppDistribution,
  ConversationAppContext,
  ToolAuthRequirement,
  ToolInvocationMode,
  ToolSchema,
} from '@shared/contracts/v1'
import type { AvailableToolRecord } from '../tool-discovery'

export interface BuildToolInjectionRequest {
  eligibleTools: AvailableToolRecord[]
  conversationContext?: ConversationAppContext | null
  maxToolCount?: number
  maxToolsPerApp?: number
  maxSchemaDepth?: number
  maxSchemaProperties?: number
  maxPromptLineLength?: number
}

export interface ToolInjectionSelectionSummary {
  maxToolCount: number
  maxToolsPerApp: number
  includedToolCount: number
  omittedToolCount: number
  includedAppIds: string[]
  omittedAppIds: string[]
  activeAppId: string | null
  preferActiveApp: boolean
  activeAppToolNameCount: number
}

export interface CompactToolSchemaPreview {
  type?: string
  title?: string
  description?: string
  properties?: Record<string, CompactToolSchemaPreview>
  items?: CompactToolSchemaPreview | CompactToolSchemaPreview[]
  required?: string[]
  enum?: unknown[]
  additionalProperties?: boolean | CompactToolSchemaPreview
  nullable?: boolean
  default?: unknown
  examples?: unknown[]
  truncated?: boolean
}

export interface ToolInjectionSchemaPreview {
  schemaJson: string
  truncated: boolean
  characters: number
}

export interface ToolInjectionToolDeclaration {
  appId: string
  appName: string
  appSlug: string
  appVersionId: string
  appVersion: string
  category: string
  distribution: AppDistribution
  authType: AppAuthType
  toolName: string
  description: string
  authRequirement: ToolAuthRequirement
  invocationMode: ToolInvocationMode
  idempotent: boolean
  timeoutMs: number
  requiredPermissions?: string[]
  availabilityReason: string
  isFromActiveApp: boolean
  isPreferredByContext: boolean
  tool: ToolSchema
  schemaPreview: ToolInjectionSchemaPreview
  promptLine: string
}

export interface ToolInjectionPayload {
  version: 'v1'
  generatedAt: string
  conversationId: string | null
  activeAppId: string | null
  activeToolNames: string[]
  selection: ToolInjectionSelectionSummary
  toolDeclarations: ToolInjectionToolDeclaration[]
  promptFragments: string[]
}

export type ToolInjectionErrorCode = 'invalid-request'

export interface ToolInjectionFailure {
  ok: false
  domain: 'tool-injection'
  code: ToolInjectionErrorCode
  message: string
  details?: string[]
  retryable?: boolean
}

export type ToolInjectionPayloadResult = { ok: true; value: ToolInjectionPayload } | ToolInjectionFailure
