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

export type ApprovedAppStateObservedEvent = {
  eventId: string
  sessionId: string
  approvedAppId: string
  runtimeAppId: string
  appSessionId: string
  conversationId: string
  summary: string
  latestStateDigest?: JsonObject
  availableToolNames: string[]
  observedAt: string
}

type ApprovedAppEventState = {
  latestOpenedEvent: ApprovedAppOpenedEvent | null
  latestObservedStateEvent: ApprovedAppStateObservedEvent | null
  publishOpenedEvent: (event: ApprovedAppOpenedEvent) => void
  publishStateObservedEvent: (event: ApprovedAppStateObservedEvent) => void
  reset: () => void
}

export const approvedAppEventStore = createStore<ApprovedAppEventState>()((set) => ({
  latestOpenedEvent: null,
  latestObservedStateEvent: null,
  publishOpenedEvent: (event) => {
    set({ latestOpenedEvent: event })
  },
  publishStateObservedEvent: (event) => {
    set({ latestObservedStateEvent: event })
  },
  reset: () => {
    set({ latestOpenedEvent: null, latestObservedStateEvent: null })
  },
}))

export function publishApprovedAppOpenedEvent(event: ApprovedAppOpenedEvent) {
  approvedAppEventStore.getState().publishOpenedEvent(event)
}

export function publishApprovedAppStateObservedEvent(event: ApprovedAppStateObservedEvent) {
  approvedAppEventStore.getState().publishStateObservedEvent(event)
}

export function resetApprovedAppOpenedEvents() {
  approvedAppEventStore.getState().reset()
}

export function useApprovedAppEventStore<U>(selector: (state: ApprovedAppEventState) => U) {
  return useStore(approvedAppEventStore, selector)
}
