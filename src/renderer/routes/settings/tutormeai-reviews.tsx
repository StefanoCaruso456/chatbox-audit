import { Alert, Badge, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { deriveTutorMeAIUserPermissions } from '@shared/contracts/v1'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settingsStore'

const REVIEW_CAPABILITIES: Array<{
  key: 'canViewReviewQueue' | 'canStartAppReview' | 'canApproveApp' | 'canBlockApp'
  label: string
}> = [
  { key: 'canViewReviewQueue', label: 'Open review queue' },
  { key: 'canStartAppReview', label: 'Start review session' },
  { key: 'canApproveApp', label: 'Approve app for launch' },
  { key: 'canBlockApp', label: 'Block or suspend app' },
]

export const Route = createFileRoute('/settings/tutormeai-reviews')({
  component: RouteComponent,
})

export function RouteComponent() {
  const { t } = useTranslation()
  const tutorMeAIProfile = useSettingsStore((state) => state.tutorMeAIProfile)
  const permissions = deriveTutorMeAIUserPermissions(tutorMeAIProfile.role)

  return (
    <Stack p="md" gap="xl">
      <Stack gap="xxs">
        <Title order={5}>{t('TutorMeAI Reviews')}</Title>
        <Text c="chatbox-tertiary" maw={640}>
          {t('Review access is role-based. This page mirrors the same permission contract that the backend safety layer uses before it accepts approval decisions.')}
        </Text>
      </Stack>

      {!permissions.canViewReviewQueue ? (
        <Alert color="yellow" title={t('Review access not granted')}>
          <Text size="sm">
            {t('The current role can request review but cannot open the review queue or make approval decisions.')}
          </Text>
        </Alert>
      ) : (
        <Alert color="green" title={t('Review access granted')}>
          <Text size="sm">
            {t('This role can access the review workflow. Final approval and block actions are still enforced by the backend profile service.')}
          </Text>
        </Alert>
      )}

      <Paper withBorder p="md" maw={720}>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text fw={600}>{t('Current reviewer role')}</Text>
            <Badge color={permissions.canViewReviewQueue ? 'green' : 'gray'} variant="light">
              {tutorMeAIProfile.role}
            </Badge>
          </Group>

          <Stack gap="xs">
            {REVIEW_CAPABILITIES.map((capability) => (
              <Group key={capability.key} justify="space-between">
                <Text size="sm">{capability.label}</Text>
                <Badge color={permissions[capability.key] ? 'green' : 'gray'} variant="light">
                  {permissions[capability.key] ? 'Allowed' : 'Not allowed'}
                </Badge>
              </Group>
            ))}
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  )
}
