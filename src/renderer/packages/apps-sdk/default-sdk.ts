import { APP_MILESTONE_ORDER, approvedApps, resolveApprovedAppLaunchRequest } from '@/data/approvedApps'
import { createUiStoreAppsSdkAdapter } from './adapter'
import { createChatBridgeAppsSdk } from './sdk'

export const defaultChatBridgeAppsSdk = createChatBridgeAppsSdk({
  apps: approvedApps,
  adapter: createUiStoreAppsSdkAdapter(),
  milestoneOrder: APP_MILESTONE_ORDER,
  resolveLaunchRequest: resolveApprovedAppLaunchRequest,
})
