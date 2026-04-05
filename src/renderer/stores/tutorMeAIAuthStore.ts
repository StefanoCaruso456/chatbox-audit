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
  updateUser: (user: TutorMeAIPlatformUser) => void
  clearSession: () => void
  setStatus: (status: TutorMeAIAuthStatus, error?: string | null) => void
  markHydrated: () => void
}

type PersistedTutorMeAIAuthState = Pick<TutorMeAIAuthState, 'accessToken' | 'refreshToken' | 'user'>

function normalizeTutorMeAIAuthUser(user: TutorMeAIPlatformUser): TutorMeAIPlatformUser {
  return {
    ...user,
    username: user.username ?? null,
    role: user.role ?? null,
    onboardingCompletedAt: user.onboardingCompletedAt ?? null,
    students: Array.isArray(user.students)
      ? [
          ...new Set(
            user.students.filter(
              (studentId): studentId is string => typeof studentId === 'string' && studentId.trim().length > 0
            )
          ),
        ]
      : [],
  }
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
            state.user = normalizeTutorMeAIAuthUser(user)
            state.status = 'authenticated'
            state.error = null
          })
        },
        updateUser: (user) => {
          set((state) => {
            state.user = normalizeTutorMeAIAuthUser(user)
            state.status = state.accessToken && state.refreshToken ? 'authenticated' : state.status
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
        version: 3,
        partialize: (state) => ({
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
          user: state.user,
        }),
        migrate: (persistedState, _version): PersistedTutorMeAIAuthState => {
          const state = persistedState as Partial<PersistedTutorMeAIAuthState> | undefined
          const user = state?.user
          return {
            accessToken: state?.accessToken ?? null,
            refreshToken: state?.refreshToken ?? null,
            user: user ? normalizeTutorMeAIAuthUser(user as TutorMeAIPlatformUser) : null,
          }
        },
        onRehydrateStorage: () => {
          return (state, error) => {
            if (state) {
              if (state.user) {
                state.updateUser(normalizeTutorMeAIAuthUser(state.user))
              }
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
