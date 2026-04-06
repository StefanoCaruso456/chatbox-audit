import { Badge, Button, Modal, ScrollArea, Stack, Text, Title } from '@mantine/core'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatBridgeAppsSdk, useChatBridgeAppsSdkState } from '@/packages/apps-sdk'
import type { AppCategory, GradeRange } from '@/types/apps'
import AppCard from './AppCard'
import AppFilters from './AppFilters'
import AppSearch from './AppSearch'
export default function AppsModal() {
  const { t } = useTranslation()
  const appsSdk = useChatBridgeAppsSdk()
  const approvedAppsModalOpen = useChatBridgeAppsSdkState((state) => state.isLibraryOpen)
  const activeApprovedAppId = useChatBridgeAppsSdkState((state) => state.activeAppId)

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<AppCategory | 'all'>('all')
  const [gradeRange, setGradeRange] = useState<GradeRange | 'all'>('all')

  const deferredSearch = useDeferredValue(search)
  const hasActiveFilters = category !== 'all' || gradeRange !== 'all' || search.trim().length > 0

  const filteredApps = useMemo(() => {
    return appsSdk.queryApps({
      search: deferredSearch,
      category,
      gradeRange,
      activeAppId: activeApprovedAppId,
    })
  }, [activeApprovedAppId, appsSdk, category, deferredSearch, gradeRange])

  return (
    <Modal
      opened={approvedAppsModalOpen}
      onClose={() => appsSdk.closeLibrary()}
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
            'radial-gradient(circle at top, rgba(59,130,246,0.1), transparent 26%), var(--chatbox-surface-elevated)',
          border: '1px solid color-mix(in srgb, var(--chatbox-border-primary), transparent 12%)',
          boxShadow: 'var(--chatbox-shadow-floating)',
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
        <div className="cb-neumo-card rounded-[24px] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge radius="xl" variant="light" color="chatbox-brand">
              {t('TutorMeAI App Library')}
            </Badge>
            <Badge radius="xl" variant="light" color="chatbox-success">
              {t('Curated for K-12')}
            </Badge>
            <Text size="sm" c="chatbox-tertiary">
              {t('{{count}} apps in one library', { count: appsSdk.catalog.apps.length })}
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
                  appsSdk.openApp(appId)
                }}
              />
            ))}
          </div>
        ) : (
          <div className="cb-neumo-card-soft rounded-[24px] border-dashed px-6 py-12 text-center">
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
