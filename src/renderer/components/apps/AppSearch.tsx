import { TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { ScalableIcon } from '@/components/common/ScalableIcon'

type AppSearchProps = {
  value: string
  onChange: (value: string) => void
}

export default function AppSearch({ value, onChange }: AppSearchProps) {
  const { t } = useTranslation()

  return (
    <TextInput
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      leftSection={<ScalableIcon icon={IconSearch} size={16} />}
      placeholder={t('Search by app, category, or tag')}
      aria-label={t('Search apps')}
      radius="md"
      size="md"
      styles={{
        input: {
          background: 'var(--chatbox-background-primary)',
          borderColor: 'rgba(255, 255, 255, 0.08)',
        },
      }}
    />
  )
}
