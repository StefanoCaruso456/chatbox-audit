import { Button, Group, Select, Stack } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import {
  APP_CATEGORY_OPTIONS,
  GRADE_RANGE_OPTIONS,
  gradeRangeMeta,
  type AppCategory,
  type GradeRange,
} from '@/types/apps'

type AppFiltersProps = {
  category: AppCategory | 'all'
  gradeRange: GradeRange | 'all'
  onCategoryChange: (value: AppCategory | 'all') => void
  onGradeRangeChange: (value: GradeRange | 'all') => void
  onClear: () => void
  hasActiveFilters: boolean
}

export default function AppFilters(props: AppFiltersProps) {
  const { t } = useTranslation()

  return (
    <Stack gap="sm">
      <Group grow align="end">
        <Select
          label={t('Category')}
          value={props.category}
          onChange={(value) => props.onCategoryChange((value as AppCategory | 'all') ?? 'all')}
          data={[
            { value: 'all', label: t('All categories') },
            ...APP_CATEGORY_OPTIONS.map((category) => ({ value: category, label: category })),
          ]}
          radius="md"
          allowDeselect={false}
        />

        <Select
          label={t('Grade band')}
          value={props.gradeRange}
          onChange={(value) => props.onGradeRangeChange((value as GradeRange | 'all') ?? 'all')}
          data={[
            { value: 'all', label: t('All grade bands') },
            ...GRADE_RANGE_OPTIONS.map((range) => ({
              value: range,
              label:
                range === 'Multi-level'
                  ? gradeRangeMeta[range].label
                  : `${gradeRangeMeta[range].label} · ${gradeRangeMeta[range].description}`,
            })),
          ]}
          radius="md"
          allowDeselect={false}
        />
      </Group>

      <Group justify="space-between">
        <div />
        <Button
          variant="subtle"
          color="chatbox-secondary"
          size="compact-sm"
          onClick={props.onClear}
          disabled={!props.hasActiveFilters}
        >
          {t('Clear filters')}
        </Button>
      </Group>
    </Stack>
  )
}
