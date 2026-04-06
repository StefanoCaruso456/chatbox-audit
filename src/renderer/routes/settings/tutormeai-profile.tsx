import { Alert, Button, Group, MultiSelect, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import type { TutorMeAIUserRole } from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTutorMeAIStudentDirectory } from '@/hooks/useTutorMeAIStudentDirectory'
import { closeSettings } from '@/modals/Settings'
import {
  deriveTutorMeAIUsernameCandidate,
  isTutorMeAIProfileComplete,
  isTutorMeAIReviewerRole,
  logoutTutorMeAIPlatformSession,
  resolveTutorMeAIBackendOrigin,
  updateTutorMeAIPlatformProfile,
} from '@/packages/tutormeai-auth/client'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTutorMeAIAuthStore } from '@/stores/tutorMeAIAuthStore'

const ROLE_OPTIONS: Array<{ value: TutorMeAIUserRole; label: string }> = [
  { value: 'student', label: 'student' },
  { value: 'teacher', label: 'teacher' },
  { value: 'school_admin', label: 'school_admin' },
  { value: 'district_Director', label: 'district_Director' },
]

export const Route = createFileRoute('/settings/tutormeai-profile')({
  component: RouteComponent,
})

export function RouteComponent() {
  const { t } = useTranslation()
  const { tutorMeAIProfile, setSettings } = useSettingsStore((state) => state)
  const platformUser = useTutorMeAIAuthStore((state) => state.user)
  const accessToken = useTutorMeAIAuthStore((state) => state.accessToken)
  const refreshToken = useTutorMeAIAuthStore((state) => state.refreshToken)
  const updateUser = useTutorMeAIAuthStore((state) => state.updateUser)
  const clearSession = useTutorMeAIAuthStore((state) => state.clearSession)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState(tutorMeAIProfile.name)
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<TutorMeAIUserRole>(tutorMeAIProfile.role)
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const signedInName = (platformUser?.displayName ?? tutorMeAIProfile.name) || t('TutorMeAI user')
  const signedInEmail = (platformUser?.email ?? tutorMeAIProfile.email) || t('Google account email unavailable')
  const reviewerRoleSelected = isTutorMeAIReviewerRole(role)
  const studentDirectory = useTutorMeAIStudentDirectory(Boolean(platformUser && accessToken && reviewerRoleSelected))
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

  useEffect(() => {
    setDisplayName(platformUser?.displayName ?? tutorMeAIProfile.name)
    setUsername(
      platformUser
        ? deriveTutorMeAIUsernameCandidate(platformUser)
        : deriveTutorMeAIUsernameCandidate({
            email: tutorMeAIProfile.email,
            displayName: tutorMeAIProfile.name,
            username: null,
          })
    )
    setRole(platformUser?.role ?? tutorMeAIProfile.role)
    setSelectedStudentIds(platformUser?.students ?? [])
  }, [
    platformUser?.displayName,
    platformUser?.email,
    platformUser?.role,
    platformUser?.students,
    platformUser?.userId,
    platformUser?.username,
    tutorMeAIProfile.email,
    tutorMeAIProfile.name,
    tutorMeAIProfile.role,
  ])

  const handleLogout = () => {
    const backendOrigin = resolveTutorMeAIBackendOrigin()
    const accessTokenToRevoke = accessToken
    const refreshTokenToRevoke = refreshToken

    clearSession()
    closeSettings()

    void Promise.resolve(
      logoutTutorMeAIPlatformSession({
        backendOrigin,
        accessToken: accessTokenToRevoke,
        refreshToken: refreshTokenToRevoke,
      })
    ).catch((error) => {
      console.warn('TutorMeAI logout request failed after local sign-out.', error)
    })
  }

  const handleSaveProfile = async () => {
    if (!platformUser || !accessToken) {
      return
    }

    if (reviewerRoleSelected && selectedStudentIds.length === 0) {
      setSaveError('Select at least one student for this teacher or administrator profile.')
      setSaveSuccess(null)
      return
    }

    try {
      setSaveError(null)
      setSaveSuccess(null)
      setSaving(true)
      const updated = await updateTutorMeAIPlatformProfile({
        backendOrigin: resolveTutorMeAIBackendOrigin(),
        accessToken,
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        role,
        students: reviewerRoleSelected ? selectedStudentIds : [],
      })
      updateUser(updated.user)
      setSelectedStudentIds(updated.user.students)
      setSettings((draft) => {
        draft.tutorMeAIProfile.name = updated.user.displayName
        draft.tutorMeAIProfile.email = updated.user.email ?? ''
        draft.tutorMeAIProfile.role = updated.user.role ?? role
      })
      setSaveSuccess('TutorMeAI profile saved.')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack p="md" gap="xl">
      <Stack gap="xxs">
        <Title order={5}>{t('TutorMeAI Profile')}</Title>
        <Text c="chatbox-tertiary" maw={560}>
          {t(
            'TutorMeAI identity comes from Google sign-in. Name, username, and role are saved on the platform profile.'
          )}
        </Text>
      </Stack>

      <Stack gap="md" maw={420}>
        <Paper withBorder p="md">
          <Group justify="space-between" align="flex-start" gap="md">
            <Stack gap={4} flex={1}>
              <Text fw={600}>{t('Signed in to TutorMeAI')}</Text>
              <Text>{signedInName}</Text>
              <Text size="sm" c="chatbox-tertiary">
                {signedInEmail}
              </Text>
              <Text size="sm" c="chatbox-tertiary">
                {t('Current role')}: {platformUser?.role ?? role}
              </Text>
              {isTutorMeAIReviewerRole(platformUser?.role) ? (
                <Text size="sm" c="chatbox-tertiary">
                  {t('Assigned students')}: {platformUser?.students?.length ?? 0}
                </Text>
              ) : null}
            </Stack>

            <Button variant="default" onClick={handleLogout}>
              {t('Sign out')}
            </Button>
          </Group>
        </Paper>

        {saveError && (
          <Alert color="red" variant="light">
            {saveError}
          </Alert>
        )}

        {saveSuccess && (
          <Alert color="green" variant="light">
            {saveSuccess}
          </Alert>
        )}

        <TextInput
          label={t('Name')}
          value={displayName}
          onChange={(event) => setDisplayName(event.currentTarget.value)}
        />

        <TextInput label={t('Email')} type="email" value={platformUser?.email ?? tutorMeAIProfile.email} readOnly />

        <TextInput
          label={t('Username')}
          value={username}
          onChange={(event) => setUsername(event.currentTarget.value)}
          description={t('Used for your TutorMeAI platform profile.')}
        />

        <Select
          label={t('Role')}
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
                No TutorMeAI student profiles are registered yet. Student accounts need to finish onboarding before you
                can assign them.
              </Alert>
            ) : null}

            <MultiSelect
              label={t('Students')}
              value={selectedStudentIds}
              data={studentOptions}
              searchable
              clearable
              disabled={studentDirectory.loading}
              onChange={setSelectedStudentIds}
              description={t('Select the students this teacher or administrator is responsible for approving.')}
              placeholder={studentDirectory.loading ? 'Loading students...' : 'Choose one or more students'}
            />
          </>
        ) : null}

        {platformUser && !isTutorMeAIProfileComplete(platformUser) && (
          <Alert color="blue" variant="light">
            Finish saving your profile to complete TutorMeAI onboarding.
          </Alert>
        )}

        <Button onClick={() => void handleSaveProfile()} loading={saving} disabled={!platformUser || !accessToken}>
          {t('Save profile')}
        </Button>
      </Stack>
    </Stack>
  )
}
