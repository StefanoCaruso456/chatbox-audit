import { Alert, Button, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import type { TutorMeAIUserRole } from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  deriveTutorMeAIUsernameCandidate,
  isTutorMeAIProfileComplete,
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
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState(tutorMeAIProfile.name)
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<TutorMeAIUserRole>(tutorMeAIProfile.role)

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
  }, [
    platformUser?.displayName,
    platformUser?.email,
    platformUser?.role,
    platformUser?.userId,
    platformUser?.username,
    tutorMeAIProfile.email,
    tutorMeAIProfile.name,
    tutorMeAIProfile.role,
  ])

  const handleLogout = async () => {
    try {
      setLogoutError(null)
      await logoutTutorMeAIPlatformSession({
        backendOrigin: resolveTutorMeAIBackendOrigin(),
        accessToken,
        refreshToken,
      })
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : String(error))
    } finally {
      clearSession()
    }
  }

  const handleSaveProfile = async () => {
    if (!platformUser || !accessToken) {
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
      })
      updateUser(updated.user)
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
          {t('TutorMeAI identity comes from Google sign-in. Name, username, and role are saved on the platform profile.')}
        </Text>
      </Stack>

      <Stack gap="md" maw={420}>
        {logoutError && (
          <Alert color="red" variant="light">
            {logoutError}
          </Alert>
        )}

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

        <TextInput
          label={t('Email')}
          type="email"
          value={platformUser?.email ?? tutorMeAIProfile.email}
          readOnly
        />

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

        {platformUser && !isTutorMeAIProfileComplete(platformUser) && (
          <Alert color="blue" variant="light">
            Finish saving your profile to complete TutorMeAI onboarding.
          </Alert>
        )}

        <Button onClick={() => void handleSaveProfile()} loading={saving} disabled={!platformUser || !accessToken}>
          {t('Save profile')}
        </Button>

        <Button variant="default" onClick={handleLogout}>
          {t('Sign out')}
        </Button>
      </Stack>
    </Stack>
  )
}
