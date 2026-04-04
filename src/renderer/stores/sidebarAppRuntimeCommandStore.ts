import type { CompletionSignal, JsonObject } from '@shared/contracts/v1'

export interface SidebarAppRuntimeCommand {
  hostSessionId: string
  runtimeAppId: string
  appSessionId: string
  toolCallId: string
  toolName: string
  arguments: JsonObject
  timeoutMs?: number
  createdAt: string
}

type SidebarAppRuntimeCommandSuccess = {
  ok: true
  command: SidebarAppRuntimeCommand
  completion: CompletionSignal
}

type SidebarAppRuntimeCommandFailure = {
  ok: false
  command: SidebarAppRuntimeCommand
  error: string
}

export type SidebarAppRuntimeCommandResult = SidebarAppRuntimeCommandSuccess | SidebarAppRuntimeCommandFailure

type PendingSidebarCommand = {
  command: SidebarAppRuntimeCommand
  resolve: (result: SidebarAppRuntimeCommandResult) => void
  timeoutId: number
}

const sidebarRuntimeCommands = new Map<string, Map<string, SidebarAppRuntimeCommand>>()
const pendingSidebarRuntimeCommands = new Map<string, PendingSidebarCommand>()
const sidebarRuntimeCommandListeners = new Set<() => void>()

function notifySidebarRuntimeCommandListeners() {
  sidebarRuntimeCommandListeners.forEach((listener) => listener())
}

function getSessionBucket(hostSessionId: string, createIfMissing = false) {
  const existing = sidebarRuntimeCommands.get(hostSessionId)
  if (existing || !createIfMissing) {
    return existing ?? null
  }

  const created = new Map<string, SidebarAppRuntimeCommand>()
  sidebarRuntimeCommands.set(hostSessionId, created)
  return created
}

function clearCommandFromBucket(command: SidebarAppRuntimeCommand) {
  const bucket = getSessionBucket(command.hostSessionId)
  if (!bucket) {
    return
  }

  const current = bucket.get(command.runtimeAppId)
  if (current?.toolCallId === command.toolCallId) {
    bucket.delete(command.runtimeAppId)
  }

  if (bucket.size === 0) {
    sidebarRuntimeCommands.delete(command.hostSessionId)
  }
}

export function subscribeSidebarAppRuntimeCommands(listener: () => void) {
  sidebarRuntimeCommandListeners.add(listener)
  return () => {
    sidebarRuntimeCommandListeners.delete(listener)
  }
}

export function getSidebarAppRuntimeCommand(hostSessionId: string, runtimeAppId: string) {
  return getSessionBucket(hostSessionId)?.get(runtimeAppId) ?? null
}

export function enqueueSidebarAppRuntimeCommand(command: SidebarAppRuntimeCommand) {
  const bucket = getSessionBucket(command.hostSessionId, true)
  bucket?.set(command.runtimeAppId, command)
  notifySidebarRuntimeCommandListeners()

  return new Promise<SidebarAppRuntimeCommandResult>((resolve) => {
    const timeoutMs = command.timeoutMs ?? 8_000
    const timeoutId = globalThis.setTimeout(() => {
      pendingSidebarRuntimeCommands.delete(command.toolCallId)
      clearCommandFromBucket(command)
      notifySidebarRuntimeCommandListeners()
      resolve({
        ok: false,
        command,
        error: 'The sidebar app did not confirm the move before the timeout expired.',
      })
    }, timeoutMs)

    pendingSidebarRuntimeCommands.set(command.toolCallId, {
      command,
      resolve,
      timeoutId,
    })
  })
}

export function resolveSidebarAppRuntimeCommand(toolCallId: string, completion: CompletionSignal) {
  const pending = pendingSidebarRuntimeCommands.get(toolCallId)
  if (!pending) {
    return
  }

  globalThis.clearTimeout(pending.timeoutId)
  pendingSidebarRuntimeCommands.delete(toolCallId)
  clearCommandFromBucket(pending.command)
  notifySidebarRuntimeCommandListeners()
  pending.resolve({
    ok: true,
    command: pending.command,
    completion,
  })
}

export function rejectSidebarAppRuntimeCommand(toolCallId: string, error: string) {
  const pending = pendingSidebarRuntimeCommands.get(toolCallId)
  if (!pending) {
    return
  }

  globalThis.clearTimeout(pending.timeoutId)
  pendingSidebarRuntimeCommands.delete(toolCallId)
  clearCommandFromBucket(pending.command)
  notifySidebarRuntimeCommandListeners()
  pending.resolve({
    ok: false,
    command: pending.command,
    error,
  })
}

export function resetSidebarAppRuntimeCommands() {
  pendingSidebarRuntimeCommands.forEach((pending) => {
    globalThis.clearTimeout(pending.timeoutId)
    pending.resolve({
      ok: false,
      command: pending.command,
      error: 'The sidebar runtime command queue was reset.',
    })
  })
  pendingSidebarRuntimeCommands.clear()
  sidebarRuntimeCommands.clear()
  notifySidebarRuntimeCommandListeners()
}
