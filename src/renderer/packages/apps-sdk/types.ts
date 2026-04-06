import type { AppCategory, ApprovedApp, GradeRange } from '@/types/apps'

export type AppsSdkLaunchResolution =
  | {
      kind: 'match'
      app: ApprovedApp
      matchedTerm: string
    }
  | {
      kind: 'ambiguous'
      apps: ApprovedApp[]
    }

export interface AppsSdkState {
  isLibraryOpen: boolean
  requestedAppId: string | null
  activeAppId: string | null
  panelWidth: number | null
}

export interface AppsSdkAdapter {
  useStore<T>(selector: (state: AppsSdkState) => T): T
  getState(): AppsSdkState
  setLibraryOpen(open: boolean): void
  openLibrary(): void
  closeLibrary(): void
  requestOpen(appId: string): void
  completeOpen(appId: string): void
  clearRequested(appId?: string): void
  closeActive(): void
  setPanelWidth(width: number | null): void
}

export interface AppsSdkQuery {
  search?: string
  category?: AppCategory | 'all'
  gradeRange?: GradeRange | 'all'
  activeAppId?: string | null
}

export interface AppsSdkCatalog {
  apps: readonly ApprovedApp[]
  byId: ReadonlyMap<string, ApprovedApp>
  byRuntimeAppId: ReadonlyMap<string, ApprovedApp>
  getById(appId?: string | null): ApprovedApp | undefined
  getByRuntimeAppId(runtimeAppId?: string | null): ApprovedApp | undefined
  queryApps(query?: AppsSdkQuery): ApprovedApp[]
  resolveLaunchRequest(userRequest: string): AppsSdkLaunchResolution | null
}

export interface ChatBridgeAppsSdkConfig {
  apps: readonly ApprovedApp[]
  adapter: AppsSdkAdapter
  milestoneOrder?: readonly string[]
  resolveLaunchRequest?: (userRequest: string) => AppsSdkLaunchResolution | null
}

export interface ChatBridgeAppsSdk {
  config: Readonly<ChatBridgeAppsSdkConfig>
  adapter: AppsSdkAdapter
  catalog: AppsSdkCatalog
  getState(): AppsSdkState
  getAppById(appId?: string | null): ApprovedApp | undefined
  getAppByRuntimeAppId(runtimeAppId?: string | null): ApprovedApp | undefined
  queryApps(query?: AppsSdkQuery): ApprovedApp[]
  resolveLaunchRequest(userRequest: string): AppsSdkLaunchResolution | null
  setLibraryOpen(open: boolean): void
  openLibrary(): void
  closeLibrary(): void
  openApp(appId: string): void
  completeAppOpen(appId: string): void
  clearOpenRequest(appId?: string): void
  closeActiveApp(): void
  setPanelWidth(width: number | null): void
}
