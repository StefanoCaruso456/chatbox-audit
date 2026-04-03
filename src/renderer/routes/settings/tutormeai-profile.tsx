import { Badge, Group, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import {
  DEFAULT_TUTOR_ME_AI_USER_ROLE,
  deriveTutorMeAIUserPermissions,
  type TutorMeAIUserRole,
} from '@shared/contracts/v1'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settingsStore'

const ROLE_OPTIONS: Array<{ value: TutorMeAIUserRole; label: string }> = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'school_admin', label: 'School Admin' },
  { value: 'district_admin', label: 'District Admin' },
]

const PERMISSION_LABELS: Array<{
  key: keyof ReturnType<typeof deriveTutorMeAIUserPermissions>
  label: string
}> = [
  { key: 'canRequestAppReview', label: 'Request app review' },
  { key: 'canViewReviewQueue', label: 'View review queue' },
  { key: 'canStartAppReview', label: 'Start review sessions' },
  { key: 'canApproveApp', label: 'Approve apps' },
  { key: 'canBlockApp', label: 'Block apps' },
  { key: 'canManageSafetySettings', label: 'Manage safety settings' },
]

export const Route = createFileRoute('/settings/tutormeai-profile')({
  component: RouteComponent,
})

export function RouteComponent() {
  const { t } = useTranslation()
  const { tutorMeAIProfile, setSettings } = useSettingsStore((state) => state)
  const permissions = deriveTutorMeAIUserPermissions(tutorMeAIProfile.role ?? DEFAULT_TUTOR_ME_AI_USER_ROLE)

  return (
    <Stack p="md" gap="xl">
      <Stack gap="xxs">
        <Title order={5}>{t('TutorMeAI Profile')}</Title>
        <Text c="chatbox-tertiary" maw={640}>
          {t('Edit the TutorMeAI classroom role model used for local safety testing and mirrored by the backend profile service.')}
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

      <Paper withBorder p="md" maw={680}>
        <Stack gap="sm">
          <Text fw={600}>{t('Role-based safety permissions')}</Text>
          <Text size="sm" c="chatbox-tertiary">
            {t('This screen uses the same shared role-to-permission contract as the backend review authorization layer.')}
          </Text>
          <Group gap="xs">
            {PERMISSION_LABELS.map((permission) => (
              <Badge
                key={permission.key}
                color={permissions[permission.key] ? 'green' : 'gray'}
                variant={permissions[permission.key] ? 'light' : 'outline'}
              >
                {permission.label}
              </Badge>
            ))}
          </Group>
        </Stack>
      </Paper>
    </Stack>
  )
}
