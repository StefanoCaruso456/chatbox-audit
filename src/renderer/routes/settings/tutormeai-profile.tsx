import { Alert, Button, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import type { TutorMeAIUserRole } from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  logoutTutorMeAIPlatformSession,
  resolveTutorMeAIBackendOrigin,
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
  const clearSession = useTutorMeAIAuthStore((state) => state.clearSession)
  const [logoutError, setLogoutError] = useState<string | null>(null)

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

  return (
    <Stack p="md" gap="xl">
      <Stack gap="xxs">
        <Title order={5}>{t('TutorMeAI Profile')}</Title>
        <Text c="chatbox-tertiary" maw={560}>
          {t('TutorMeAI identity comes from Google sign-in. Role remains a local setting for classroom-flow testing.')}
        </Text>
      </Stack>

      <Stack gap="md" maw={420}>
        {logoutError && (
          <Alert color="red" variant="light">
            {logoutError}
          </Alert>
        )}

        <TextInput
          label={t('Name')}
          value={platformUser?.displayName ?? tutorMeAIProfile.name}
          readOnly
        />

        <TextInput
          label={t('Email')}
          type="email"
          value={platformUser?.email ?? tutorMeAIProfile.email}
          readOnly
        />

        <Select
          label={t('Role')}
          data={ROLE_OPTIONS}
          value={tutorMeAIProfile.role}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          onChange={(value) => {
            if (!value) {
              return
            }
            setSettings((draft) => {
              draft.tutorMeAIProfile.role = value as TutorMeAIUserRole
            })
          }}
        />

        <Button variant="default" onClick={handleLogout}>
          {t('Sign out')}
        </Button>
      </Stack>
    </Stack>
  )
}
