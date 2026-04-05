import type { JsonObject } from '@shared/contracts/v1/shared'
import { createStore, useStore } from 'zustand'

export type ApprovedAppOpenedEvent = {
  eventId: string
  sessionId: string
  approvedAppId: string
  runtimeAppId: string
  appSessionId: string
  conversationId: string
  summary: string
  latestStateDigest?: JsonObject
  availableToolNames: string[]
  openedAt: string
}

type ApprovedAppEventState = {
  latestOpenedEvent: ApprovedAppOpenedEvent | null
  publishOpenedEvent: (event: ApprovedAppOpenedEvent) => void
  reset: () => void
}

export const approvedAppEventStore = createStore<ApprovedAppEventState>()((set) => ({
  latestOpenedEvent: null,
  publishOpenedEvent: (event) => {
    set({ latestOpenedEvent: event })
  },
  reset: () => {
    set({ latestOpenedEvent: null })
  },
}))

export function publishApprovedAppOpenedEvent(event: ApprovedAppOpenedEvent) {
  approvedAppEventStore.getState().publishOpenedEvent(event)
}

export function resetApprovedAppOpenedEvents() {
  approvedAppEventStore.getState().reset()
}

export function useApprovedAppEventStore<U>(selector: (state: ApprovedAppEventState) => U) {
  return useStore(approvedAppEventStore, selector)
}
