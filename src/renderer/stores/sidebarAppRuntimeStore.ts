import type { AppSessionAuthState, JsonObject, RuntimeAppStatus } from '@shared/contracts/v1'

export interface SidebarAppRuntimeSnapshot {
  hostSessionId: string
  approvedAppId: string
  runtimeAppId: string
  appSessionId: string
  conversationId: string
  expectedOrigin: string
  sourceUrl: string
  authState: AppSessionAuthState
  availableToolNames: string[]
  status: RuntimeAppStatus
  summary: string
  latestStateDigest?: JsonObject
  updatedAt: string
  errorMessage?: string
}

const sidebarRuntimeSnapshots = new Map<string, Map<string, SidebarAppRuntimeSnapshot>>()

function getSessionBucket(hostSessionId: string, createIfMissing = false) {
  const existing = sidebarRuntimeSnapshots.get(hostSessionId)
  if (existing || !createIfMissing) {
    return existing ?? null
  }

  const created = new Map<string, SidebarAppRuntimeSnapshot>()
  sidebarRuntimeSnapshots.set(hostSessionId, created)
  return created
}

export function upsertSidebarAppRuntimeSnapshot(snapshot: SidebarAppRuntimeSnapshot) {
  const bucket = getSessionBucket(snapshot.hostSessionId, true)
  bucket?.set(snapshot.runtimeAppId, snapshot)
}

export function getSidebarAppRuntimeSnapshot(hostSessionId: string, runtimeAppId: string) {
  return getSessionBucket(hostSessionId)?.get(runtimeAppId) ?? null
}

export function getSidebarAppRuntimeSnapshotByAppSessionId(hostSessionId: string, appSessionId: string) {
  const bucket = getSessionBucket(hostSessionId)
  if (!bucket) {
    return null
  }

  for (const snapshot of bucket.values()) {
    if (snapshot.appSessionId === appSessionId) {
      return snapshot
    }
  }

  return null
}

export function clearSidebarAppRuntimeSnapshot(hostSessionId: string, runtimeAppId?: string) {
  if (!runtimeAppId) {
    sidebarRuntimeSnapshots.delete(hostSessionId)
    return
  }

  const bucket = getSessionBucket(hostSessionId)
  if (!bucket) {
    return
  }

  bucket.delete(runtimeAppId)
  if (bucket.size === 0) {
    sidebarRuntimeSnapshots.delete(hostSessionId)
  }
}

export function resetSidebarAppRuntimeSnapshots() {
  sidebarRuntimeSnapshots.clear()
}
