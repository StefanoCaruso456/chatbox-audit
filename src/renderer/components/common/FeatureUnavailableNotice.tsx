import { Alert, Stack, Text, Title } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { ScalableIcon } from './ScalableIcon'

interface FeatureUnavailableNoticeProps {
  title: string
  message?: string
}

export default function FeatureUnavailableNotice({ title, message }: FeatureUnavailableNoticeProps) {
  const { t } = useTranslation()

  return (
    <Stack p="md" gap="md">
      <Title order={5}>{title}</Title>
      <Alert variant="light" color="orange" icon={<ScalableIcon icon={IconInfoCircle} size={16} />} title={title}>
        <Text size="sm">{message || t('not available in browser')}</Text>
      </Alert>
    </Stack>
  )
}
