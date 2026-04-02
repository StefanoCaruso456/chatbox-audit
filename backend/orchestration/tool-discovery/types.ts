import type { AppAuthType, AppDistribution, ToolAuthRequirement, ToolSchema } from '@shared/contracts/v1'

export type AppOAuthAvailability = 'connected' | 'expired' | 'missing'

export interface DiscoverAvailableToolsRequest {
  approvedOnly?: boolean
  distribution?: AppDistribution
  authType?: AppAuthType
  includeAppIds?: string[]
  excludeAppIds?: string[]
  activeAppId?: string | null
  preferActiveApp?: boolean
  platformAuthenticated?: boolean
  appOAuthStates?: Record<string, AppOAuthAvailability>
}

export type ToolAvailabilityReason = 'none-required' | 'platform-authenticated' | 'app-oauth-connected'

export interface AvailableToolRecord {
  appId: string
  appName: string
  appSlug: string
  appVersionId: string
  appVersion: string
  category: string
  distribution: AppDistribution
  authType: AppAuthType
  toolName: string
  tool: ToolSchema
  authRequirement: ToolAuthRequirement
  availabilityReason: ToolAvailabilityReason
  isFromActiveApp: boolean
}

export interface ToolDiscoverySelectionSummary {
  approvedOnly: boolean
  includedAppIds: string[]
  omittedAppIds: string[]
  activeAppId: string | null
  preferActiveApp: boolean
}

export interface AvailableToolDiscoveryResult {
  tools: AvailableToolRecord[]
  selection: ToolDiscoverySelectionSummary
}
