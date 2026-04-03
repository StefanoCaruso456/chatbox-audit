import type { EmbeddedAppHostRuntimeConfig } from '@/components/message-parts/embedded-app-host'
import type { ApprovedApp } from '@/types/apps'

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

export function resolveAppPanelLaunchUrl(launchUrl: string) {
  const trimmed = launchUrl.trim()
  if (/^https?:\/\//i.test(trimmed)) {
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

  return new URL(trimmed, window.location.origin).toString()
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
