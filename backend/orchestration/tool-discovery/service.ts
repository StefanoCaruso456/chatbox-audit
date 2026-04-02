import type { ToolSchema } from '@shared/contracts/v1'
import type { AppRegistryRecord, AppRegistryService } from '../../registry'
import type {
  AppOAuthAvailability,
  AvailableToolDiscoveryResult,
  AvailableToolRecord,
  DiscoverAvailableToolsRequest,
  ToolAvailabilityReason,
} from './types'

type RegistryReader = Pick<AppRegistryService, 'listApps'>

export class AvailableToolDiscoveryService {
  constructor(private readonly registry: RegistryReader) {}

  async discoverAvailableTools(
    request: DiscoverAvailableToolsRequest = {}
  ): Promise<AvailableToolDiscoveryResult> {
    const approvedOnly = request.approvedOnly ?? true
    const preferActiveApp = request.preferActiveApp ?? true
    const activeAppId = this.normalizeIdentifier(request.activeAppId)
    const includeSet = this.toIdentifierSet(request.includeAppIds)
    const excludeSet = this.toIdentifierSet(request.excludeAppIds)

    const registeredApps = await this.registry.listApps({
      approvedOnly,
      distribution: request.distribution,
      authType: request.authType,
    })

    const filteredApps = registeredApps.filter((app) => {
      if (includeSet && !includeSet.has(app.appId)) {
        return false
      }

      if (excludeSet?.has(app.appId)) {
        return false
      }

      return true
    })

    const tools = filteredApps
      .flatMap((app) => this.collectAvailableToolsForApp(app, request, activeAppId))
      .sort((left, right) => this.compareTools(left, right, preferActiveApp))

    return {
      tools,
      selection: {
        approvedOnly,
        includedAppIds: filteredApps.map((app) => app.appId),
        omittedAppIds: registeredApps
          .map((app) => app.appId)
          .filter((appId) => !filteredApps.some((app) => app.appId === appId)),
        activeAppId,
        preferActiveApp,
      },
    }
  }

  private collectAvailableToolsForApp(
    app: AppRegistryRecord,
    request: DiscoverAvailableToolsRequest,
    activeAppId: string | null
  ): AvailableToolRecord[] {
    return app.currentVersion.manifest.toolDefinitions.flatMap((tool) => {
      const availabilityReason = this.resolveAvailabilityReason(tool, app.appId, request)
      if (!availabilityReason) {
        return []
      }

      return [
        {
          appId: app.appId,
          appName: app.name,
          appSlug: app.slug,
          appVersionId: app.currentVersionId,
          appVersion: app.currentVersion.appVersion,
          category: app.category,
          distribution: app.distribution,
          authType: app.authType,
          toolName: tool.name,
          tool,
          authRequirement: tool.authRequirement,
          availabilityReason,
          isFromActiveApp: activeAppId === app.appId,
        },
      ]
    })
  }

  private resolveAvailabilityReason(
    tool: ToolSchema,
    appId: string,
    request: DiscoverAvailableToolsRequest
  ): ToolAvailabilityReason | undefined {
    switch (tool.authRequirement) {
      case 'none':
        return 'none-required'
      case 'platform-session':
        return request.platformAuthenticated ? 'platform-authenticated' : undefined
      case 'app-oauth':
        return this.resolveAppOAuthState(appId, request.appOAuthStates) === 'connected'
          ? 'app-oauth-connected'
          : undefined
    }
  }

  private resolveAppOAuthState(
    appId: string,
    appOAuthStates: Record<string, AppOAuthAvailability> | undefined
  ): AppOAuthAvailability {
    return appOAuthStates?.[appId] ?? 'missing'
  }

  private compareTools(left: AvailableToolRecord, right: AvailableToolRecord, preferActiveApp: boolean): number {
    if (preferActiveApp && left.isFromActiveApp !== right.isFromActiveApp) {
      return left.isFromActiveApp ? -1 : 1
    }

    const appNameComparison = left.appName.localeCompare(right.appName)
    if (appNameComparison !== 0) {
      return appNameComparison
    }

    return left.toolName.localeCompare(right.toolName)
  }

  private normalizeIdentifier(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  private toIdentifierSet(values: string[] | undefined): Set<string> | undefined {
    if (!values || values.length === 0) {
      return undefined
    }

    const normalized = values
      .map((value) => this.normalizeIdentifier(value))
      .filter((value): value is string => value !== null)

    return normalized.length > 0 ? new Set(normalized) : undefined
  }
}
