/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteComponent } from '@/routes/settings/tutormeai-profile'
import { settingsStore } from '@/stores/settingsStore'
import { tutorMeAIAuthStore } from '@/stores/tutorMeAIAuthStore'

const { logoutTutorMeAIPlatformSession, closeSettings } = vi.hoisted(() => ({
  logoutTutorMeAIPlatformSession: vi.fn(),
  closeSettings: vi.fn(),
}))

vi.mock('@/packages/tutormeai-auth/client', async () => {
  const actual = await vi.importActual<typeof import('@/packages/tutormeai-auth/client')>(
    '@/packages/tutormeai-auth/client'
  )

  return {
    ...actual,
    logoutTutorMeAIPlatformSession,
  }
})

vi.mock('@/modals/Settings', () => ({
  closeSettings,
}))

describe('TutorMeAI profile settings', () => {
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
    localStorage.clear()
    settingsStore.setState({
      tutorMeAIProfile: {
        name: '',
        email: '',
        role: 'student',
      },
    })
    tutorMeAIAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      status: 'required',
      error: null,
      hasHydrated: true,
    })
    logoutTutorMeAIPlatformSession.mockReset()
    closeSettings.mockReset()
    vi.restoreAllMocks()
  })

  it('shows the signed-in account summary and signs out from the TutorMeAI profile page', async () => {
    settingsStore.setState({
      tutorMeAIProfile: {
        name: 'Stefano Carusos',
        email: 'stefanocaruso456@gmail.com',
        role: 'student',
      },
    })
    tutorMeAIAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        userId: 'user.google.demo',
        email: 'stefanocaruso456@gmail.com',
        username: 'stefanocaruso456',
        displayName: 'Stefano Carusos',
        role: 'teacher',
        pictureUrl: null,
        onboardingCompletedAt: '2026-04-05T04:59:43.916Z',
      },
      status: 'authenticated',
      error: null,
      hasHydrated: true,
    })

    render(
      <MantineProvider>
        <RouteComponent />
      </MantineProvider>
    )

    expect(screen.getByText(/signed in to tutormeai/i)).toBeTruthy()
    expect(screen.getByDisplayValue('stefanocaruso456@gmail.com')).toBeTruthy()
    expect(screen.getByText(/current role/i).textContent).toContain('teacher')

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => {
      expect(logoutTutorMeAIPlatformSession).toHaveBeenCalledWith({
        backendOrigin: 'https://chatbox-audit-production.up.railway.app',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    })

    expect(closeSettings).toHaveBeenCalled()
    expect(tutorMeAIAuthStore.getState().status).toBe('required')
    expect(tutorMeAIAuthStore.getState().accessToken).toBeNull()
    expect(tutorMeAIAuthStore.getState().user).toBeNull()
  })

  it('still clears the local session and closes settings when the backend logout selector is stale', async () => {
    logoutTutorMeAIPlatformSession.mockRejectedValueOnce(new Error('No platform session matched the supplied selector.'))

    settingsStore.setState({
      tutorMeAIProfile: {
        name: 'Stefano Carusos',
        email: 'stefanocaruso456@gmail.com',
        role: 'student',
      },
    })
    tutorMeAIAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        userId: 'user.google.demo',
        email: 'stefanocaruso456@gmail.com',
        username: 'stefanocaruso456',
        displayName: 'Stefano Carusos',
        role: 'teacher',
        pictureUrl: null,
        onboardingCompletedAt: '2026-04-05T04:59:43.916Z',
      },
      status: 'authenticated',
      error: null,
      hasHydrated: true,
    })

    render(
      <MantineProvider>
        <RouteComponent />
      </MantineProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => {
      expect(closeSettings).toHaveBeenCalled()
    })

    expect(tutorMeAIAuthStore.getState().status).toBe('required')
    expect(screen.queryByText(/no platform session matched the supplied selector/i)).toBeNull()
  })
})
