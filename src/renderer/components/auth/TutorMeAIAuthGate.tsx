import { Alert, Box, Button, MultiSelect, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import type { TutorMeAIUserRole } from '@shared/types/settings'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTutorMeAIStudentDirectory } from '@/hooks/useTutorMeAIStudentDirectory'
import {
  buildTutorMeAIPlatformGoogleStartUrl,
  deriveTutorMeAIUsernameCandidate,
  fetchTutorMeAIPlatformProfile,
  isTutorMeAIPlatformCallbackMessage,
  isTutorMeAIProfileComplete,
  isTutorMeAIReviewerRole,
  refreshTutorMeAIPlatformSession,
  resolveTutorMeAIBackendOrigin,
  updateTutorMeAIPlatformProfile,
} from '@/packages/tutormeai-auth/client'
import { tutorMeAIAuthStore, useTutorMeAIAuthStore } from '@/stores/tutorMeAIAuthStore'

const ROLE_OPTIONS: Array<{ value: TutorMeAIUserRole; label: string }> = [
  { value: 'student', label: 'student' },
  { value: 'teacher', label: 'teacher' },
  { value: 'school_admin', label: 'school_admin' },
  { value: 'district_Director', label: 'district_Director' },
]

export function TutorMeAIAuthGate(props: { children: ReactNode }) {
  const { children } = props
  const accessToken = useTutorMeAIAuthStore((state) => state.accessToken)
  const refreshToken = useTutorMeAIAuthStore((state) => state.refreshToken)
  const user = useTutorMeAIAuthStore((state) => state.user)
  const status = useTutorMeAIAuthStore((state) => state.status)
  const error = useTutorMeAIAuthStore((state) => state.error)
  const hasHydrated = useTutorMeAIAuthStore((state) => state.hasHydrated)
  const setSession = useTutorMeAIAuthStore((state) => state.setSession)
  const updateUser = useTutorMeAIAuthStore((state) => state.updateUser)
  const clearSession = useTutorMeAIAuthStore((state) => state.clearSession)
  const setStatus = useTutorMeAIAuthStore((state) => state.setStatus)

  const backendOrigin = useMemo(() => resolveTutorMeAIBackendOrigin(), [])
  const popupRef = useRef<Window | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<TutorMeAIUserRole>('student')
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [profileError, setProfileError] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const reviewerRoleSelected = isTutorMeAIReviewerRole(role)
  const studentDirectory = useTutorMeAIStudentDirectory(Boolean(accessToken && reviewerRoleSelected))
  const studentOptions = useMemo(() => {
    const known = new Set(studentDirectory.options.map((student) => student.value))
    const preservedSelections = selectedStudentIds
      .filter((studentId) => !known.has(studentId))
      .map((studentId) => ({
        value: studentId,
        label: `Unknown student (${studentId})`,
      }))
    return [...studentDirectory.options, ...preservedSelections]
  }, [selectedStudentIds, studentDirectory.options])

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

  useEffect(() => {
    if (!user) {
      return
    }

    setDisplayName(user.displayName)
    setUsername(deriveTutorMeAIUsernameCandidate(user))
    setRole(user.role ?? 'student')
    setSelectedStudentIds(user.students ?? [])
    setProfileError(null)
  }, [user?.displayName, user?.email, user?.role, user?.students, user?.userId, user?.username])

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

  const handleCompleteProfile = useCallback(async () => {
    if (!accessToken || !user) {
      return
    }

    if (reviewerRoleSelected && selectedStudentIds.length === 0) {
      setProfileError('Select at least one student for this teacher or administrator profile.')
      return
    }

    setSavingProfile(true)
    setProfileError(null)

    try {
      const updated = await updateTutorMeAIPlatformProfile({
        backendOrigin,
        accessToken,
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        role,
        students: reviewerRoleSelected ? selectedStudentIds : [],
      })
      updateUser(updated.user)
    } catch (updateError) {
      setProfileError(updateError instanceof Error ? updateError.message : String(updateError))
    } finally {
      setSavingProfile(false)
    }
  }, [accessToken, backendOrigin, displayName, reviewerRoleSelected, role, selectedStudentIds, updateUser, user, username])

  if (!hasHydrated || status === 'checking') {
    return (
      <Box p="xl" mih="100vh" bg="linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)">
        <Stack align="center" justify="center" mih="100vh" gap="sm">
          <Title order={2}>TutorMeAI</Title>
          <Text c="dimmed">Checking your account...</Text>
        </Stack>
      </Box>
    )
  }

  if (status === 'authenticated' && user && isTutorMeAIProfileComplete(user)) {
    return <>{children}</>
  }

  if (status === 'authenticated' && user) {
    return (
      <Box p="xl" mih="100vh" bg="radial-gradient(circle at top, #dbeafe 0%, #f8fafc 45%, #ffffff 100%)">
        <Stack align="center" justify="center" mih="100vh">
          <Paper withBorder shadow="sm" radius="xl" p="xl" maw={520} w="100%">
            <Stack gap="md">
              <div>
                <Title order={2}>Complete Your TutorMeAI Profile</Title>
                <Text c="dimmed" size="sm">
                  Google sign-in worked. Finish your TutorMeAI account setup so we can store your role and user
                  profile on the platform.
                </Text>
              </div>

              {(error || profileError) && (
                <Alert color="red" variant="light">
                  {profileError ?? error}
                </Alert>
              )}

              <TextInput label="Email" value={user.email ?? ''} readOnly />

              <TextInput
                label="Name"
                value={displayName}
                onChange={(event) => setDisplayName(event.currentTarget.value)}
                placeholder="How should we display your name?"
              />

              <TextInput
                label="Username"
                value={username}
                onChange={(event) => setUsername(event.currentTarget.value)}
                placeholder="your.username"
                description="Lowercase letters, numbers, dots, underscores, and hyphens only."
              />

              <Select
                label="Role"
                data={ROLE_OPTIONS}
                value={role}
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
                onChange={(value) => {
                  if (!value) {
                    return
                  }
                  setRole(value as TutorMeAIUserRole)
                }}
              />

              {reviewerRoleSelected ? (
                <>
                  {studentDirectory.error ? (
                    <Alert color="red" variant="light">
                      {studentDirectory.error}
                    </Alert>
                  ) : null}

                  {!studentDirectory.loading && studentOptions.length === 0 ? (
                    <Alert color="yellow" variant="light">
                      No TutorMeAI student profiles are registered yet. Ask a student to finish onboarding first.
                    </Alert>
                  ) : null}

                  <MultiSelect
                    label="Students"
                    value={selectedStudentIds}
                    data={studentOptions}
                    searchable
                    clearable
                    disabled={studentDirectory.loading}
                    onChange={setSelectedStudentIds}
                    description="Select the students this teacher or administrator will approve apps for."
                    placeholder={studentDirectory.loading ? 'Loading students...' : 'Choose one or more students'}
                  />
                </>
              ) : null}

              <Button loading={savingProfile} onClick={() => void handleCompleteProfile()}>
                Continue to TutorMeAI
              </Button>

              <Text size="xs" c="dimmed">
                Your Google account stays the identity provider. This step saves your TutorMeAI profile and classroom
                role on the platform.
              </Text>
            </Stack>
          </Paper>
        </Stack>
      </Box>
    )
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
