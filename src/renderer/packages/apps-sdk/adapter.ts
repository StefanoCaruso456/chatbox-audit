import { uiStore, useUIStore } from '@/stores/uiStore'
import type { AppsSdkAdapter, AppsSdkState } from './types'

function mapUiStoreToAppsSdkState(state: ReturnType<typeof uiStore.getState>): AppsSdkState {
  return {
    isLibraryOpen: state.approvedAppsModalOpen,
    requestedAppId: state.requestedApprovedAppId,
    activeAppId: state.activeApprovedAppId,
    panelWidth: state.approvedAppPanelWidth,
  }
}

function useUiStoreAppsSdkState<T>(selector: (state: AppsSdkState) => T) {
  return useUIStore((state) => selector(mapUiStoreToAppsSdkState(state)))
}

export function createUiStoreAppsSdkAdapter(): AppsSdkAdapter {
  return {
    useStore: useUiStoreAppsSdkState,
    getState() {
      return mapUiStoreToAppsSdkState(uiStore.getState())
    },
    setLibraryOpen(open) {
      uiStore.getState().setApprovedAppsModalOpen(open)
    },
    openLibrary() {
      uiStore.getState().setApprovedAppsModalOpen(true)
    },
    closeLibrary() {
      uiStore.getState().setApprovedAppsModalOpen(false)
    },
    requestOpen(appId) {
      uiStore.getState().openApprovedApp(appId)
    },
    completeOpen(appId) {
      uiStore.getState().completeApprovedAppOpen(appId)
    },
    clearRequested(appId) {
      uiStore.getState().clearApprovedAppOpenRequest(appId)
    },
    closeActive() {
      uiStore.getState().closeApprovedApp()
    },
    setPanelWidth(width) {
      uiStore.getState().setApprovedAppPanelWidth(width)
    },
  }
}
