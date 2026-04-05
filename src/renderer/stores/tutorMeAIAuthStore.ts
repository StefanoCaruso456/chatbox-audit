import { createStore, useStore } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { TutorMeAIPlatformUser } from '@/packages/tutormeai-auth/client'

export type TutorMeAIAuthStatus = 'checking' | 'authenticated' | 'required' | 'error'

interface TutorMeAIAuthState {
  accessToken: string | null
  refreshToken: string | null
  user: TutorMeAIPlatformUser | null
  status: TutorMeAIAuthStatus
  error: string | null
  hasHydrated: boolean
}

interface TutorMeAIAuthActions {
  setSession: (input: {
    accessToken: string
    refreshToken: string
    user: TutorMeAIPlatformUser
  }) => void
  clearSession: () => void
  setStatus: (status: TutorMeAIAuthStatus, error?: string | null) => void
  markHydrated: () => void
}

const initialState: TutorMeAIAuthState = {
  accessToken: null,
  refreshToken: null,
  user: null,
  status: 'checking',
  error: null,
  hasHydrated: false,
}

export const tutorMeAIAuthStore = createStore<TutorMeAIAuthState & TutorMeAIAuthActions>()(
  subscribeWithSelector(
    persist(
      immer((set) => ({
        ...initialState,
        setSession: ({ accessToken, refreshToken, user }) => {
          set((state) => {
            state.accessToken = accessToken
            state.refreshToken = refreshToken
            state.user = user
            state.status = 'authenticated'
            state.error = null
          })
        },
        clearSession: () => {
          set((state) => {
            state.accessToken = null
            state.refreshToken = null
            state.user = null
            state.status = 'required'
            state.error = null
          })
        },
        setStatus: (status, error = null) => {
          set((state) => {
            state.status = status
            state.error = error
          })
        },
        markHydrated: () => {
          set((state) => {
            state.hasHydrated = true
          })
        },
      })),
      {
        name: 'tutormeai-platform-auth',
        version: 1,
        partialize: (state) => ({
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
          user: state.user,
        }),
        onRehydrateStorage: () => {
          return (state, error) => {
            if (state) {
              state.markHydrated()
              state.setStatus(state.accessToken && state.refreshToken && state.user ? 'authenticated' : 'required')
            }
            if (error) {
              console.error('Failed to hydrate TutorMeAI auth store', error)
            }
          }
        },
      }
    )
  )
)

if (typeof window !== 'undefined') {
  queueMicrotask(() => {
    const state = tutorMeAIAuthStore.getState()
    if (!state.hasHydrated) {
      state.markHydrated()
      state.setStatus(state.accessToken && state.refreshToken && state.user ? 'authenticated' : 'required')
    }
  })
}

export function useTutorMeAIAuthStore<U>(
  selector: Parameters<typeof useStore<typeof tutorMeAIAuthStore, U>>[1]
) {
  return useStore<typeof tutorMeAIAuthStore, U>(tutorMeAIAuthStore, selector)
}
