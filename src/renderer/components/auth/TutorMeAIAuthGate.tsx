import { Alert, Box, Button, Paper, Stack, Text, Title } from '@mantine/core'
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  buildTutorMeAIPlatformGoogleStartUrl,
  fetchTutorMeAIPlatformProfile,
  isTutorMeAIPlatformCallbackMessage,
  refreshTutorMeAIPlatformSession,
  resolveTutorMeAIBackendOrigin,
} from '@/packages/tutormeai-auth/client'
import { tutorMeAIAuthStore, useTutorMeAIAuthStore } from '@/stores/tutorMeAIAuthStore'

export function TutorMeAIAuthGate(props: { children: ReactNode }) {
  const { children } = props
  const accessToken = useTutorMeAIAuthStore((state) => state.accessToken)
  const refreshToken = useTutorMeAIAuthStore((state) => state.refreshToken)
  const user = useTutorMeAIAuthStore((state) => state.user)
  const status = useTutorMeAIAuthStore((state) => state.status)
  const error = useTutorMeAIAuthStore((state) => state.error)
  const hasHydrated = useTutorMeAIAuthStore((state) => state.hasHydrated)
  const setSession = useTutorMeAIAuthStore((state) => state.setSession)
  const clearSession = useTutorMeAIAuthStore((state) => state.clearSession)
  const setStatus = useTutorMeAIAuthStore((state) => state.setStatus)

  const backendOrigin = useMemo(() => resolveTutorMeAIBackendOrigin(), [])
  const popupRef = useRef<Window | null>(null)
  const pollTimerRef = useRef<number | null>(null)

  const clearConnectPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const syncSession = useCallback(async () => {
    if (!hasHydrated) {
      return
    }

    if (!accessToken && !refreshToken) {
      setStatus('required')
      return
    }

    setStatus('checking')
    try {
      if (accessToken && refreshToken) {
        const profile = await fetchTutorMeAIPlatformProfile({
          backendOrigin,
          accessToken,
        })
        setSession({
          accessToken,
          refreshToken,
          user: profile.user,
        })
        return
      }
    } catch {
      // Fall through to refresh.
    }

    if (!refreshToken) {
      clearSession()
      setStatus('required')
      return
    }

    try {
      const refreshed = await refreshTutorMeAIPlatformSession({
        backendOrigin,
        refreshToken,
      })
      setSession({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        user: refreshed.user,
      })
    } catch (refreshError) {
      clearSession()
      setStatus('error', refreshError instanceof Error ? refreshError.message : String(refreshError))
    }
  }, [accessToken, backendOrigin, clearSession, hasHydrated, refreshToken, setSession, setStatus])

  useEffect(() => {
    void syncSession()
  }, [syncSession])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isTutorMeAIPlatformCallbackMessage(event, backendOrigin)) {
        return
      }

      clearConnectPolling()
      popupRef.current?.close()
      popupRef.current = null

      if (event.data.ok) {
        setSession({
          accessToken: event.data.accessToken,
          refreshToken: event.data.refreshToken,
          user: event.data.user,
        })
        return
      }

      clearSession()
      setStatus('error', event.data.message)
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [backendOrigin, clearConnectPolling, clearSession, setSession, setStatus])

  useEffect(() => {
    return () => {
      clearConnectPolling()
      popupRef.current = null
    }
  }, [clearConnectPolling])

  const handleSignIn = useCallback(() => {
    clearConnectPolling()
    setStatus('checking')

    const popup = window.open(
      buildTutorMeAIPlatformGoogleStartUrl({
        backendOrigin,
        clientOrigin: window.location.origin,
      }),
      'tutormeai-platform-google-oauth',
      'popup=yes,width=640,height=760'
    )

    if (!popup) {
      setStatus('error', 'The Google sign-in window was blocked. Allow pop-ups and try again.')
      return
    }

    popupRef.current = popup
    pollTimerRef.current = window.setInterval(() => {
      if (popupRef.current?.closed) {
        clearConnectPolling()
        popupRef.current = null
        if (!tutorMeAIAuthResolved(tutorMeAIAuthStoreSnapshot())) {
          setStatus('required', 'Google sign-in was closed before TutorMeAI finished connecting the account.')
        }
      }
    }, 500)
  }, [backendOrigin, clearConnectPolling, setStatus])

  if (!hasHydrated || status === 'checking') {
    return (
      <Box p="xl" mih="100vh" bg="linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)">
        <Stack align="center" justify="center" mih="100vh" gap="sm">
          <Title order={2}>TutorMeAI</Title>
          <Text c="dimmed">Checking your account…</Text>
        </Stack>
      </Box>
    )
  }

  if (status === 'authenticated' && user) {
    return <>{children}</>
  }

  return (
    <Box p="xl" mih="100vh" bg="radial-gradient(circle at top, #dbeafe 0%, #f8fafc 45%, #ffffff 100%)">
      <Stack align="center" justify="center" mih="100vh">
        <Paper withBorder shadow="sm" radius="xl" p="xl" maw={460} w="100%">
          <Stack gap="md">
            <div>
              <Title order={2}>Sign In to TutorMeAI</Title>
              <Text c="dimmed" size="sm">
                Continue with Google to open chat, launch apps, and keep your TutorMeAI workspace connected.
              </Text>
            </div>

            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}

            <Button size="md" onClick={handleSignIn}>
              Continue with Google
            </Button>

            <Text size="xs" c="dimmed">
              Your Google account signs you into TutorMeAI. App-specific permissions, like Planner access, will still
              request extra consent only when needed.
            </Text>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  )
}

function tutorMeAIAuthStoreSnapshot() {
  return {
    accessToken: tutorMeAIAuthStore.getState().accessToken,
    refreshToken: tutorMeAIAuthStore.getState().refreshToken,
    user: tutorMeAIAuthStore.getState().user,
  }
}

function tutorMeAIAuthResolved(snapshot: {
  accessToken?: string | null
  refreshToken?: string | null
  user?: { userId: string } | null
}) {
  return Boolean(snapshot.accessToken && snapshot.refreshToken && snapshot.user?.userId)
}
