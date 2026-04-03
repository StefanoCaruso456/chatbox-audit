import type { RemoteConfig } from '@shared/types'
import { createStore, useStore } from 'zustand'
import { createJSONStorage, persist, subscribeWithSelector } from 'zustand/middleware'
import storage, { StorageKey } from '@/storage'

type RemoteConfigState = {
  remoteConfig: Partial<RemoteConfig>
}

type RemoteConfigActions = {
  setRemoteConfig: (
    nextStateOrUpdater:
      | Partial<RemoteConfig>
      | ((state: Partial<RemoteConfig>) => Partial<RemoteConfig>)
  ) => void
  mergeRemoteConfig: (patch: Partial<RemoteConfig>) => void
  getRemoteConfig: () => Partial<RemoteConfig>
}

export const remoteConfigStore = createStore<RemoteConfigState & RemoteConfigActions>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        remoteConfig: {},
        setRemoteConfig: (nextStateOrUpdater) =>
          set((state) => ({
            remoteConfig:
              typeof nextStateOrUpdater === 'function'
                ? nextStateOrUpdater(state.remoteConfig)
                : nextStateOrUpdater,
          })),
        mergeRemoteConfig: (patch) =>
          set((state) => ({
            remoteConfig: {
              ...state.remoteConfig,
              ...patch,
            },
          })),
        getRemoteConfig: () => get().remoteConfig,
      }),
      {
        name: StorageKey.RemoteConfig,
        storage: createJSONStorage(() => ({
          getItem: async (key) => {
            const res = await storage.getItem<Partial<RemoteConfig> | null>(key, null)
            if (res === null) {
              return null
            }

            return JSON.stringify({
              state: { remoteConfig: res },
              version: 0,
            })
          },
          setItem: async (name, value) => {
            const { state } = JSON.parse(value) as { state: RemoteConfigState; version?: number }
            await storage.setItem(name, state.remoteConfig)
          },
          removeItem: async (name) => await storage.removeItem(name),
        })),
        partialize: (state) => ({ remoteConfig: state.remoteConfig }),
        skipHydration: true,
      }
    )
  )
)

let _initRemoteConfigStorePromise: Promise<Partial<RemoteConfig>> | undefined

export const initRemoteConfigStore = async () => {
  if (!_initRemoteConfigStorePromise) {
    _initRemoteConfigStorePromise = new Promise<Partial<RemoteConfig>>((resolve) => {
      const unsub = remoteConfigStore.persist.onFinishHydration((val) => {
        unsub()
        resolve(val?.remoteConfig || {})
      })
      remoteConfigStore.persist.rehydrate()
    })
  }

  return await _initRemoteConfigStorePromise
}

export function useRemoteConfigStore<U>(
  selector: Parameters<typeof useStore<typeof remoteConfigStore, U>>[1]
) {
  return useStore<typeof remoteConfigStore, U>(remoteConfigStore, selector)
}

export const useRemoteConfig = () => useRemoteConfigStore((state) => state.remoteConfig)
