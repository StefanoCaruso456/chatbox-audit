import { Select, Stack, Text, TextInput, Title } from '@mantine/core'
import type { TutorMeAIUserRole } from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settingsStore'

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

  return (
    <Stack p="md" gap="xl">
      <Stack gap="xxs">
        <Title order={5}>{t('TutorMeAI Profile')}</Title>
        <Text c="chatbox-tertiary" maw={560}>
          {t('Set a simple TutorMeAI profile for testing app gating and role-based classroom flows.')}
        </Text>
      </Stack>

      <Stack gap="md" maw={420}>
        <TextInput
          label={t('Name')}
          value={tutorMeAIProfile.name}
          onChange={(event) =>
            setSettings((draft) => {
              draft.tutorMeAIProfile.name = event.currentTarget.value
            })
          }
        />

        <TextInput
          label={t('Email')}
          type="email"
          value={tutorMeAIProfile.email}
          onChange={(event) =>
            setSettings((draft) => {
              draft.tutorMeAIProfile.email = event.currentTarget.value
            })
          }
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
      </Stack>
    </Stack>
  )
}
