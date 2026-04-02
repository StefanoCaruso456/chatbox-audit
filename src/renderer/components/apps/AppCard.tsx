import { Badge, Flex, Image, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconArrowUpRight } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { cn } from '@/lib/utils'
import { isMultiLevelApp, type ApprovedApp } from '@/types/apps'
import AppCategoryBadge from './AppCategoryBadge'
import AppGradeBadge from './AppGradeBadge'

type AppCardProps = {
  app: ApprovedApp
  isActive?: boolean
  onOpen: (appId: string) => void
}

export default function AppCard({ app, isActive = false, onOpen }: AppCardProps) {
  const { t } = useTranslation()
  const trustTag = app.tags.find((tag) => tag === 'Teacher Favorite' || tag === 'District Approved')
  const visibleGradeRanges: ApprovedApp['gradeRanges'] = isMultiLevelApp(app) ? ['Multi-level'] : app.gradeRanges

  return (
    <UnstyledButton
      type="button"
      onClick={() => onOpen(app.id)}
      className={cn(
        'group flex h-full flex-col rounded-2xl border p-4 text-left transition-all duration-200',
        'border-chatbox-border-primary/70 bg-chatbox-background-primary hover:-translate-y-0.5 hover:border-chatbox-tint-brand/40 hover:shadow-[0_14px_36px_rgba(15,23,42,0.24)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chatbox-tint-brand/50',
        isActive &&
          'border-chatbox-tint-brand/55 bg-chatbox-background-brand-secondary/20 shadow-[0_16px_44px_rgba(59,130,246,0.18)]'
      )}
      aria-label={`${isActive ? t('Active') : t('Open')} ${app.name}`}
    >
      <Stack gap="sm" className="h-full">
        <Flex align="start" justify="space-between" gap="sm">
          <Flex align="center" gap="sm" className="min-w-0">
            <Image src={app.icon} alt="" w={48} h={48} radius="lg" />
            <Stack gap={2} className="min-w-0">
              <Text fw={700} size="md" className="truncate">
                {app.name}
              </Text>
              {trustTag ? (
                <Badge
                  size="sm"
                  radius="xl"
                  variant="light"
                  styles={{
                    root: {
                      backgroundColor: 'rgba(16, 185, 129, 0.14)',
                      border: '1px solid rgba(16, 185, 129, 0.22)',
                      color: 'var(--chatbox-tint-primary)',
                    },
                  }}
                >
                  {trustTag}
                </Badge>
              ) : null}
            </Stack>
          </Flex>

          <Flex
            align="center"
            justify="center"
            className={cn(
              'h-9 w-9 rounded-full border transition-colors',
              isActive
                ? 'border-chatbox-tint-brand/40 bg-chatbox-background-brand-secondary/40 text-chatbox-tint-brand'
                : 'border-chatbox-border-primary/70 text-chatbox-tint-secondary group-hover:border-chatbox-tint-brand/40 group-hover:text-chatbox-tint-brand'
            )}
          >
            <ScalableIcon icon={IconArrowUpRight} size={18} />
          </Flex>
        </Flex>

        <Text size="sm" c="chatbox-secondary" className="line-clamp-3">
          {app.shortSummary}
        </Text>

        <Flex wrap="wrap" gap="xs">
          <AppCategoryBadge category={app.category} />
          {visibleGradeRanges.map((gradeRange) => (
            <AppGradeBadge key={`${app.id}:${gradeRange}`} gradeRange={gradeRange} />
          ))}
        </Flex>

        <Flex justify="space-between" align="center" mt="auto" pt="xs">
          <Text size="sm" fw={600} c={isActive ? 'chatbox-brand' : 'chatbox-primary'}>
            {isActive ? t('Active') : t('Open')}
          </Text>
          <Text size="xs" c="chatbox-tertiary">
            {app.tags.slice(0, 2).join(' · ')}
          </Text>
        </Flex>
      </Stack>
    </UnstyledButton>
  )
}
