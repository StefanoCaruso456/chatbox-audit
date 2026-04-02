import { Flex, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconLayoutGrid } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { getApprovedAppById } from '@/data/approvedApps'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { ScalableIcon } from '../common/ScalableIcon'

type AppsTriggerProps = {
  className?: string
}

export default function AppsTrigger({ className }: AppsTriggerProps) {
  const { t } = useTranslation()
  const isSmallScreen = useIsSmallScreen()
  const activeApprovedAppId = useUIStore((state) => state.activeApprovedAppId)
  const setApprovedAppsModalOpen = useUIStore((state) => state.setApprovedAppsModalOpen)
  const activeApp = activeApprovedAppId ? getApprovedAppById(activeApprovedAppId) : undefined

  return (
    <Tooltip
      withArrow
      openDelay={500}
      label={
        activeApp
          ? t('Browse apps or switch from the active tool')
          : t('Browse approved K-12 apps without leaving chat')
      }
    >
      <UnstyledButton
        type="button"
        onClick={() => setApprovedAppsModalOpen(true)}
        aria-label={activeApp ? `${t('Apps')} · ${activeApp.name}` : t('Apps')}
        aria-haspopup="dialog"
        className={className}
      >
        <Flex
          align="center"
          gap="xs"
          px={isSmallScreen ? 'xs' : 'sm'}
          h={32}
          className={cn(
            'group rounded-full border border-chatbox-border-primary/70 bg-chatbox-background-secondary/72 text-chatbox-tint-secondary transition-all duration-200',
            'hover:border-chatbox-tint-brand/35 hover:bg-chatbox-background-brand-secondary/18 hover:text-chatbox-tint-primary',
            'focus-within:border-chatbox-tint-brand/45 focus-within:bg-chatbox-background-brand-secondary/18 focus-within:text-chatbox-tint-primary'
          )}
        >
          <div className="relative flex items-center justify-center">
            <ScalableIcon icon={IconLayoutGrid} size={17} />
            {activeApp ? (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-chatbox-background-primary bg-chatbox-tint-brand" />
            ) : null}
          </div>

          <Text
            size="sm"
            fw={600}
            className={cn(
              'overflow-hidden whitespace-nowrap transition-all duration-200',
              isSmallScreen
                ? 'max-w-0 opacity-0'
                : 'max-w-0 opacity-0 group-hover:max-w-16 group-hover:opacity-100 group-focus-within:max-w-16 group-focus-within:opacity-100'
            )}
          >
            {t('Apps')}
          </Text>
        </Flex>
      </UnstyledButton>
    </Tooltip>
  )
}
