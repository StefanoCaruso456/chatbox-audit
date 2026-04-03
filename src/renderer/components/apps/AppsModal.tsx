import { Badge, Button, Modal, ScrollArea, Stack, Text, Title } from '@mantine/core'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_MILESTONE_ORDER, approvedApps } from '@/data/approvedApps'
import { useUIStore } from '@/stores/uiStore'
import { APP_CATEGORY_OPTIONS, type AppCategory, type GradeRange, gradeRangeMeta, isMultiLevelApp } from '@/types/apps'
import AppCard from './AppCard'
import AppFilters from './AppFilters'
import AppSearch from './AppSearch'

function matchesGradeFilter(app: (typeof approvedApps)[number], gradeRange: GradeRange | 'all') {
  if (gradeRange === 'all') {
    return true
  }

  if (gradeRange === 'Multi-level') {
    return isMultiLevelApp(app)
  }

  return app.gradeRanges.includes(gradeRange)
}
const milestoneOrderIndex = new Map(APP_MILESTONE_ORDER.map((appId, index) => [appId, index]))
export default function AppsModal() {
  const { t } = useTranslation()
  const approvedAppsModalOpen = useUIStore((state) => state.approvedAppsModalOpen)
  const setApprovedAppsModalOpen = useUIStore((state) => state.setApprovedAppsModalOpen)
  const openApprovedApp = useUIStore((state) => state.openApprovedApp)
  const activeApprovedAppId = useUIStore((state) => state.activeApprovedAppId)

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<AppCategory | 'all'>('all')
  const [gradeRange, setGradeRange] = useState<GradeRange | 'all'>('all')

  const deferredSearch = useDeferredValue(search)
  const normalizedSearch = deferredSearch.trim().toLowerCase()
  const hasActiveFilters = category !== 'all' || gradeRange !== 'all' || search.trim().length > 0

  const filteredApps = useMemo(() => {
    return approvedApps
      .filter((app) => {
        const matchesSearch =
          !normalizedSearch ||
          app.name.toLowerCase().includes(normalizedSearch) ||
          app.shortSummary.toLowerCase().includes(normalizedSearch) ||
          app.category.toLowerCase().includes(normalizedSearch) ||
          app.gradeRanges.some((range) => {
            const meta = gradeRangeMeta[range]
            return (
              range.toLowerCase().includes(normalizedSearch) ||
              meta.label.toLowerCase().includes(normalizedSearch) ||
              meta.description.toLowerCase().includes(normalizedSearch)
            )
          }) ||
          app.tags.some((tag) => tag.toLowerCase().includes(normalizedSearch))

        const matchesCategory = category === 'all' || app.category === category
        return matchesSearch && matchesCategory && matchesGradeFilter(app, gradeRange)
      })
      .sort((left, right) => {
        const leftIsActive = left.id === activeApprovedAppId ? 1 : 0
        const rightIsActive = right.id === activeApprovedAppId ? 1 : 0
        if (leftIsActive !== rightIsActive) {
          return rightIsActive - leftIsActive
        }

        const leftMilestoneIndex = milestoneOrderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER
        const rightMilestoneIndex = milestoneOrderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER
        if (leftMilestoneIndex !== rightMilestoneIndex) {
          return leftMilestoneIndex - rightMilestoneIndex
        }
        const categoryDelta = APP_CATEGORY_OPTIONS.indexOf(left.category) - APP_CATEGORY_OPTIONS.indexOf(right.category)
        if (categoryDelta !== 0) {
          return categoryDelta
        }
        return left.name.localeCompare(right.name)
      })
  }, [activeApprovedAppId, category, gradeRange, normalizedSearch])

  return (
    <Modal
      opened={approvedAppsModalOpen}
      onClose={() => setApprovedAppsModalOpen(false)}
      title={
        <Stack gap={4}>
          <Title order={3} fz="xl">
            {t('Apps')}
          </Title>
          <Text size="sm" c="chatbox-secondary">
            {t('TutorMeAI app library for approved and integrated K-12 tools. Select any app to open it beside chat.')}
          </Text>
        </Stack>
      }
      centered
      size="min(72rem, 94vw)"
      closeOnEscape
      closeOnClickOutside
      withCloseButton
      scrollAreaComponent={ScrollArea.Autosize}
      styles={{
        content: {
          background:
            'radial-gradient(circle at top, rgba(59,130,246,0.08), transparent 28%), var(--chatbox-background-secondary)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        },
        header: {
          background: 'transparent',
        },
        body: {
          paddingTop: 0,
        },
      }}
    >
      <Stack gap="lg">
        <div className="rounded-2xl border border-chatbox-border-primary/70 bg-chatbox-background-primary/80 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge radius="xl" variant="light" color="chatbox-brand">
              {t('TutorMeAI App Library')}
            </Badge>
            <Badge radius="xl" variant="light" color="chatbox-success">
              {t('Curated for K-12')}
            </Badge>
            <Text size="sm" c="chatbox-tertiary">
              {t('{{count}} apps in one library', { count: approvedApps.length })}
            </Text>
          </div>
        </div>

        <AppSearch value={search} onChange={setSearch} />

        <AppFilters
          category={category}
          gradeRange={gradeRange}
          onCategoryChange={setCategory}
          onGradeRangeChange={setGradeRange}
          onClear={() => {
            setSearch('')
            setCategory('all')
            setGradeRange('all')
          }}
          hasActiveFilters={hasActiveFilters}
        />

        {filteredApps.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredApps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                isActive={app.id === activeApprovedAppId}
                onOpen={(appId) => {
                  openApprovedApp(appId)
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-chatbox-border-primary/80 bg-chatbox-background-primary/70 px-6 py-12 text-center">
            <Stack gap="xs" align="center">
              <Title order={4}>{t('No apps matched')}</Title>
              <Text size="sm" c="chatbox-secondary" maw={420}>
                {t('Try a different search or clear the filters to see the full approved set.')}
              </Text>
              <Button
                variant="light"
                color="chatbox-brand"
                mt="sm"
                onClick={() => {
                  setSearch('')
                  setCategory('all')
                  setGradeRange('all')
                }}
              >
                {t('Clear filters')}
              </Button>
            </Stack>
          </div>
        )}
      </Stack>
    </Modal>
  )
}
