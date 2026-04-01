import platform from '@/platform'

export const featureFlags = {
  mcp: platform.capabilities.mcp,
  knowledgeBase: platform.capabilities.knowledgeBase,
}
