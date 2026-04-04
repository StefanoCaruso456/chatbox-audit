import type { EmbeddedAppHostRuntimeConfig } from '@/components/message-parts/embedded-app-host'
import type { ApprovedApp } from '@/types/apps'

type ResolveAppPanelLaunchUrlOptions = {
  cacheBustKey?: string
  launchArguments?: Record<string, unknown>
}

function getLaunchOrigin(launchUrl: string): string | null {
  try {
    const parsed = new URL(launchUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }

    return parsed.origin
  } catch {
    return null
  }
}

function appendCacheBustKey(url: URL, cacheBustKey?: string) {
  if (!cacheBustKey) {
    return
  }

  url.searchParams.set('chatbridge_panel', '1')
  url.searchParams.set('chatbridge_launch', cacheBustKey)
}

function appendLaunchArguments(url: URL, launchArguments?: Record<string, unknown>) {
  if (!launchArguments) {
    return
  }

  Object.entries(launchArguments).forEach(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      url.searchParams.set(key, String(value))
    }
  })
}

export function resolveAppPanelLaunchUrl(launchUrl: string, options?: ResolveAppPanelLaunchUrlOptions) {
  const trimmed = launchUrl.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
        appendCacheBustKey(parsed, options?.cacheBustKey)
        appendLaunchArguments(parsed, options?.launchArguments)
        return parsed.toString()
      }
    } catch {
      return trimmed
    }

    return trimmed
  }

  if (!trimmed.startsWith('/')) {
    return trimmed
  }

  if (typeof window === 'undefined') {
    return trimmed
  }

  if (window.location.protocol === 'file:') {
    return `${window.location.href.split('#')[0]}#${trimmed}`
  }

  const resolved = new URL(trimmed, window.location.origin)
  appendCacheBustKey(resolved, options?.cacheBustKey)
  appendLaunchArguments(resolved, options?.launchArguments)
  return resolved.toString()
}

export function buildSidebarEmbeddedAppRuntime(
  app: ApprovedApp,
  resolvedLaunchUrl: string,
  restartNonce: number
): EmbeddedAppHostRuntimeConfig | null {
  const runtimeBridge = app.runtimeBridge
  if (!runtimeBridge) {
    return null
  }

  const expectedOrigin = getLaunchOrigin(resolvedLaunchUrl)
  if (!expectedOrigin) {
    return null
  }

  const conversationId = `conversation.sidebar.${app.id}`
  const appSessionId = `app-session.sidebar.${app.id}`
  const correlationId = `sidebar.${app.id}.${restartNonce}`

  return {
    expectedOrigin,
    conversationId,
    appSessionId,
    handshakeToken: `sidebar.${runtimeBridge.appId}.${app.id}.${restartNonce}`,
    restartNonce: correlationId,
    bootstrap: {
      launchReason: 'manual-open',
      authState: runtimeBridge.authState ?? 'not-required',
      grantedPermissions: runtimeBridge.grantedPermissions ?? [],
      initialState: {
        source: 'approved-app-sidebar',
        approvedAppId: app.id,
        approvedAppName: app.name,
        ...(runtimeBridge.pendingInvocation?.arguments
          ? {
              toolArguments: runtimeBridge.pendingInvocation.arguments,
            }
          : {}),
        ...(runtimeBridge.initialState ?? {}),
      },
      availableTools: runtimeBridge.availableTools ?? [],
    },
    pendingInvocation: runtimeBridge.pendingInvocation
      ? {
          toolCallId: runtimeBridge.pendingInvocation.toolCallId ?? `tool-call.sidebar.${app.id}`,
          toolName: runtimeBridge.pendingInvocation.toolName,
          arguments: runtimeBridge.pendingInvocation.arguments ?? {},
          timeoutMs: runtimeBridge.pendingInvocation.timeoutMs,
          correlationId,
        }
      : undefined,
  }
}
