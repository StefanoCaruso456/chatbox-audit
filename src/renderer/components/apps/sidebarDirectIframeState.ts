import type { JsonObject, RuntimeAppStatus } from '@shared/contracts/v1'

export type SidebarDirectIframeStateMessage = {
  source: 'chatbridge-sidebar-app'
  type: 'sidebar-state'
  appId: string
  payload: {
    status: RuntimeAppStatus
    summary: string
    state?: JsonObject
  }
}

const validStatuses = new Set<RuntimeAppStatus>([
  'pending',
  'active',
  'waiting-auth',
  'waiting-user',
  'completed',
  'failed',
])

export function createSidebarDirectIframeStateMessage(input: {
  appId: string
  status: RuntimeAppStatus
  summary: string
  state?: JsonObject
}): SidebarDirectIframeStateMessage {
  return {
    source: 'chatbridge-sidebar-app',
    type: 'sidebar-state',
    appId: input.appId,
    payload: {
      status: input.status,
      summary: input.summary,
      state: input.state,
    },
  }
}

export function postSidebarDirectIframeStateMessage(input: {
  appId: string
  status: RuntimeAppStatus
  summary: string
  state?: JsonObject
}) {
  if (typeof window === 'undefined' || window.parent === window) {
    return
  }

  const targetOrigin = /^https?:$/i.test(window.location.protocol) ? window.location.origin : '*'
  window.parent.postMessage(createSidebarDirectIframeStateMessage(input), targetOrigin)
}

export function isSidebarDirectIframeStateMessage(value: unknown): value is SidebarDirectIframeStateMessage {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  if (
    candidate.source !== 'chatbridge-sidebar-app' ||
    candidate.type !== 'sidebar-state' ||
    typeof candidate.appId !== 'string'
  ) {
    return false
  }

  const payload = candidate.payload
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const payloadRecord = payload as Record<string, unknown>
  return typeof payloadRecord.summary === 'string' && validStatuses.has(payloadRecord.status as RuntimeAppStatus)
}
