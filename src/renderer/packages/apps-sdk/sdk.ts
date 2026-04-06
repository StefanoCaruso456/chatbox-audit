import { createAppsCatalog } from './catalog'
import type { ChatBridgeAppsSdk, ChatBridgeAppsSdkConfig } from './types'

export function createChatBridgeAppsSdk(config: ChatBridgeAppsSdkConfig): ChatBridgeAppsSdk {
  const resolvedConfig: Readonly<ChatBridgeAppsSdkConfig> = {
    ...config,
    apps: [...config.apps],
    milestoneOrder: [...(config.milestoneOrder ?? [])],
  }
  const catalog = createAppsCatalog(resolvedConfig)

  return {
    config: resolvedConfig,
    adapter: resolvedConfig.adapter,
    catalog,
    getState() {
      return resolvedConfig.adapter.getState()
    },
    getAppById(appId) {
      return catalog.getById(appId)
    },
    getAppByRuntimeAppId(runtimeAppId) {
      return catalog.getByRuntimeAppId(runtimeAppId)
    },
    queryApps(query) {
      return catalog.queryApps(query)
    },
    resolveLaunchRequest(userRequest) {
      return catalog.resolveLaunchRequest(userRequest)
    },
    setLibraryOpen(open) {
      resolvedConfig.adapter.setLibraryOpen(open)
    },
    openLibrary() {
      resolvedConfig.adapter.openLibrary()
    },
    closeLibrary() {
      resolvedConfig.adapter.closeLibrary()
    },
    openApp(appId) {
      resolvedConfig.adapter.requestOpen(appId)
    },
    completeAppOpen(appId) {
      resolvedConfig.adapter.completeOpen(appId)
    },
    clearOpenRequest(appId) {
      resolvedConfig.adapter.clearRequested(appId)
    },
    closeActiveApp() {
      resolvedConfig.adapter.closeActive()
    },
    setPanelWidth(width) {
      resolvedConfig.adapter.setPanelWidth(width)
    },
  }
}
