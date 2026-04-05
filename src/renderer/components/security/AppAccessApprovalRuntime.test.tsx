/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppAccessApprovalRuntime from './AppAccessApprovalRuntime'
import { appAccessStore } from '@/stores/appAccessStore'
import { tutorMeAIAuthStore } from '@/stores/tutorMeAIAuthStore'
import { uiStore } from '@/stores/uiStore'

const {
  submitTutorMeAIAppAccessRequest,
  fetchTutorMeAIMyAppAccessRequest,
  listTutorMeAIPendingAppAccessRequests,
  decideTutorMeAIAppAccessRequest,
} = vi.hoisted(() => ({
  submitTutorMeAIAppAccessRequest: vi.fn(),
  fetchTutorMeAIMyAppAccessRequest: vi.fn(),
  listTutorMeAIPendingAppAccessRequests: vi.fn(),
  decideTutorMeAIAppAccessRequest: vi.fn(),
}))

vi.mock('@/packages/app-access/client', async () => {
  const actual = await vi.importActual<typeof import('@/packages/app-access/client')>('@/packages/app-access/client')
  return {
    ...actual,
    submitTutorMeAIAppAccessRequest,
    fetchTutorMeAIMyAppAccessRequest,
    listTutorMeAIPendingAppAccessRequests,
    decideTutorMeAIAppAccessRequest,
  }
})

describe('AppAccessApprovalRuntime', () => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  }

  if (!globalThis.ResizeObserver) {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    submitTutorMeAIAppAccessRequest.mockReset()
    fetchTutorMeAIMyAppAccessRequest.mockReset()
    listTutorMeAIPendingAppAccessRequests.mockReset()
    decideTutorMeAIAppAccessRequest.mockReset()

    appAccessStore.setState({
      studentRequest: null,
      teacherPendingRequests: [],
      studentSubmittingAppId: null,
      reviewerBusyRequestId: null,
      error: null,
    })
    tutorMeAIAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      status: 'required',
      error: null,
      hasHydrated: true,
    })
    uiStore.setState({
      requestedApprovedAppId: null,
      activeApprovedAppId: null,
      approvedAppsModalOpen: false,
    })
  })

  it('blocks a student behind a waiting-for-teacher modal until approval exists', async () => {
    submitTutorMeAIAppAccessRequest.mockResolvedValueOnce({
      access: 'pending',
      request: {
        appAccessRequestId: 'request-1',
        appId: 'chess-tutor',
        appName: 'Chess Tutor',
        studentUserId: 'student.user',
        studentDisplayName: 'Student Demo',
        studentEmail: 'student@example.com',
        studentRole: 'student',
        status: 'pending',
        decisionReason: null,
        decidedByUserId: null,
        decidedByDisplayName: null,
        requestedAt: '2026-04-05T05:00:00.000Z',
        decidedAt: null,
        updatedAt: '2026-04-05T05:00:00.000Z',
      },
    })

    tutorMeAIAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        userId: 'student.user',
        email: 'student@example.com',
        username: 'student.demo',
        displayName: 'Student Demo',
        role: 'student',
        pictureUrl: null,
        onboardingCompletedAt: '2026-04-05T05:00:00.000Z',
      },
      status: 'authenticated',
      error: null,
      hasHydrated: true,
    })
    uiStore.setState({
      requestedApprovedAppId: 'chess-tutor',
    })

    render(
      <MantineProvider>
        <AppAccessApprovalRuntime />
      </MantineProvider>
    )

    await waitFor(() => {
      expect(submitTutorMeAIAppAccessRequest).toHaveBeenCalledWith({
        accessToken: 'access-token',
        appId: 'chess-tutor',
        appName: 'Chess Tutor',
      })
    })

    expect(await screen.findByText(/waiting for teacher approval/i)).toBeTruthy()
    expect(uiStore.getState().activeApprovedAppId).toBeNull()
    expect(appAccessStore.getState().studentRequest?.status).toBe('pending')
    expect(appAccessStore.getState().studentSubmittingAppId).toBeNull()
  })

  it('shows a teacher popup and lets the teacher approve the pending student request', async () => {
    listTutorMeAIPendingAppAccessRequests.mockResolvedValueOnce([
      {
        appAccessRequestId: 'request-1',
        appId: 'chess-tutor',
        appName: 'Chess Tutor',
        studentUserId: 'student.user',
        studentDisplayName: 'Student Demo',
        studentEmail: 'student@example.com',
        studentRole: 'student',
        status: 'pending',
        decisionReason: null,
        decidedByUserId: null,
        decidedByDisplayName: null,
        requestedAt: '2026-04-05T05:00:00.000Z',
        decidedAt: null,
        updatedAt: '2026-04-05T05:00:00.000Z',
      },
    ])
    decideTutorMeAIAppAccessRequest.mockResolvedValueOnce({
      appAccessRequestId: 'request-1',
      appId: 'chess-tutor',
      appName: 'Chess Tutor',
      studentUserId: 'student.user',
      studentDisplayName: 'Student Demo',
      studentEmail: 'student@example.com',
      studentRole: 'student',
      status: 'approved',
      decisionReason: null,
      decidedByUserId: 'teacher.user',
      decidedByDisplayName: 'Teacher Demo',
      requestedAt: '2026-04-05T05:00:00.000Z',
      decidedAt: '2026-04-05T05:00:10.000Z',
      updatedAt: '2026-04-05T05:00:10.000Z',
    })

    tutorMeAIAuthStore.setState({
      accessToken: 'teacher-access-token',
      refreshToken: 'teacher-refresh-token',
      user: {
        userId: 'teacher.user',
        email: 'teacher@example.com',
        username: 'teacher.demo',
        displayName: 'Teacher Demo',
        role: 'teacher',
        pictureUrl: null,
        onboardingCompletedAt: '2026-04-05T05:00:00.000Z',
      },
      status: 'authenticated',
      error: null,
      hasHydrated: true,
    })

    render(
      <MantineProvider>
        <AppAccessApprovalRuntime />
      </MantineProvider>
    )

    expect(await screen.findByText(/student app approval needed/i)).toBeTruthy()
    expect(screen.getByText(/student demo/i)).toBeTruthy()
    expect(screen.getByText(/chess tutor/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /approve/i }))

    await waitFor(() => {
      expect(decideTutorMeAIAppAccessRequest).toHaveBeenCalledWith({
        accessToken: 'teacher-access-token',
        appAccessRequestId: 'request-1',
        status: 'approved',
      })
    })
  })

  it('clears the student requesting overlay once a pending request is approved and the app opens', async () => {
    fetchTutorMeAIMyAppAccessRequest.mockResolvedValueOnce({
      appAccessRequestId: 'request-1',
      appId: 'chess-tutor',
      appName: 'Chess Tutor',
      studentUserId: 'student.user',
      studentDisplayName: 'Student Demo',
      studentEmail: 'student@example.com',
      studentRole: 'student',
      status: 'approved',
      decisionReason: null,
      decidedByUserId: 'teacher.user',
      decidedByDisplayName: 'Teacher Demo',
      requestedAt: '2026-04-05T05:00:00.000Z',
      decidedAt: '2026-04-05T05:00:10.000Z',
      updatedAt: '2026-04-05T05:00:10.000Z',
    })

    tutorMeAIAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        userId: 'student.user',
        email: 'student@example.com',
        username: 'student.demo',
        displayName: 'Student Demo',
        role: 'student',
        pictureUrl: null,
        onboardingCompletedAt: '2026-04-05T05:00:00.000Z',
      },
      status: 'authenticated',
      error: null,
      hasHydrated: true,
    })
    appAccessStore.setState({
      studentRequest: {
        appAccessRequestId: 'request-1',
        appId: 'chess-tutor',
        appName: 'Chess Tutor',
        studentUserId: 'student.user',
        studentDisplayName: 'Student Demo',
        studentEmail: 'student@example.com',
        studentRole: 'student',
        status: 'pending',
        decisionReason: null,
        decidedByUserId: null,
        decidedByDisplayName: null,
        requestedAt: '2026-04-05T05:00:00.000Z',
        decidedAt: null,
        updatedAt: '2026-04-05T05:00:00.000Z',
      },
      studentSubmittingAppId: 'chess-tutor',
      teacherPendingRequests: [],
      reviewerBusyRequestId: null,
      error: null,
    })

    render(
      <MantineProvider>
        <AppAccessApprovalRuntime />
      </MantineProvider>
    )

    await waitFor(() => {
      expect(fetchTutorMeAIMyAppAccessRequest).toHaveBeenCalledWith({
        accessToken: 'access-token',
        appId: 'chess-tutor',
      })
    })

    await waitFor(() => {
      expect(uiStore.getState().activeApprovedAppId).toBe('chess-tutor')
    })

    expect(appAccessStore.getState().studentRequest).toBeNull()
    expect(appAccessStore.getState().studentSubmittingAppId).toBeNull()
    expect(screen.queryByText(/sending your app request to the teacher approval queue/i)).toBeNull()
  })
})
