import { createStore, useStore } from 'zustand'
import { combine } from 'zustand/middleware'
import type { TutorMeAIAppAccessRequest } from '@/packages/app-access/client'

export const appAccessStore = createStore(
  combine(
    {
      studentRequest: null as TutorMeAIAppAccessRequest | null,
      teacherPendingRequests: [] as TutorMeAIAppAccessRequest[],
      studentSubmittingAppId: null as string | null,
      reviewerBusyRequestId: null as string | null,
      error: null as string | null,
    },
    (set) => ({
      setStudentRequest: (studentRequest: TutorMeAIAppAccessRequest | null) => {
        set({ studentRequest })
      },
      setTeacherPendingRequests: (teacherPendingRequests: TutorMeAIAppAccessRequest[]) => {
        set({ teacherPendingRequests })
      },
      setStudentSubmittingAppId: (studentSubmittingAppId: string | null) => {
        set({ studentSubmittingAppId })
      },
      setReviewerBusyRequestId: (reviewerBusyRequestId: string | null) => {
        set({ reviewerBusyRequestId })
      },
      setAppAccessError: (error: string | null) => {
        set({ error })
      },
      clearAppAccessState: () => {
        set({
          studentRequest: null,
          teacherPendingRequests: [],
          studentSubmittingAppId: null,
          reviewerBusyRequestId: null,
          error: null,
        })
      },
    })
  )
)

export function useAppAccessStore<U>(selector: Parameters<typeof useStore<typeof appAccessStore, U>>[1]) {
  return useStore<typeof appAccessStore, U>(appAccessStore, selector)
}
