import { ActionIcon, Box, Collapse, Flex, Image, NavLink, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import SwipeableDrawer from '@mui/material/SwipeableDrawer'
import {
  IconChevronDown,
  IconChevronRight,
  IconCirclePlus,
  IconCode,
  IconFolder,
  IconInfoCircle,
  IconLayoutSidebarLeftCollapse,
  IconMessageChatbot,
  IconSearch,
  IconSettingsFilled,
  type IconProps,
} from '@tabler/icons-react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import clsx from 'clsx'
import { type ElementType, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Divider from './components/common/Divider'
import { ScalableIcon } from './components/common/ScalableIcon'
import ThemeSwitchButton from './components/dev/ThemeSwitchButton'
import SessionItem from './components/session/SessionItem'
import { FORCE_ENABLE_DEV_PAGES } from './dev/devToolsConfig'
import { useMyCopilots, useRemoteCopilots } from './hooks/useCopilots'
import useNeedRoomForMacWinControls from './hooks/useNeedRoomForWinControls'
import { useIsSmallScreen, useSidebarWidth } from './hooks/useScreenChange'
import useVersion from './hooks/useVersion'
import { navigateToSettings } from './modals/Settings'
import { trackingEvent } from './packages/event'
import platform from './platform'
import icon from './static/icon.png'
import { useSessionList } from './stores/chatStore'
import { useLanguage } from './stores/settingsStore'
import { useUIStore } from './stores/uiStore'
import { CHATBOX_BUILD_PLATFORM } from './variables'

export default function Sidebar() {
  const { t } = useTranslation()
  const versionHook = useVersion()
  const language = useLanguage()
  const navigate = useNavigate()
  const routerState = useRouterState()
  const showSidebar = useUIStore((s) => s.showSidebar)
  const setShowSidebar = useUIStore((s) => s.setShowSidebar)
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth)
  const setOpenSearchDialog = useUIStore((s) => s.setOpenSearchDialog)
  const { sessionMetaList: sortedSessions } = useSessionList()
  const { copilots: myCopilots } = useMyCopilots()
  const { copilots: remoteCopilots } = useRemoteCopilots()

  const sidebarWidth = useSidebarWidth()
  const isSmallScreen = useIsSmallScreen()
  const currentPath = routerState.location.pathname
  const currentCopilotId = (routerState.location.search as { copilotId?: string } | undefined)?.copilotId

  const [projectsExpanded, setProjectsExpanded] = useState(() => Boolean(currentCopilotId))
  const [chatsExpanded, setChatsExpanded] = useState(() => currentPath.startsWith('/session/'))
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartX = useRef<number>(0)
  const resizeStartWidth = useRef<number>(0)

  const { needRoomForMacWindowControls } = useNeedRoomForMacWinControls()

  const projectItems = useMemo(() => {
    const local = [...myCopilots].sort((a, b) => {
      if (a.starred !== b.starred) {
        return a.starred ? -1 : 1
      }
      return (b.usedCount || 0) - (a.usedCount || 0)
    })
    const seen = new Set(local.map((copilot) => copilot.id))
    const remote = remoteCopilots.filter((copilot) => !seen.has(copilot.id))
    return [...local, ...remote]
  }, [myCopilots, remoteCopilots])

  const handleCreateNewSession = useCallback(() => {
    navigate({ to: `/` })

    if (isSmallScreen) {
      setShowSidebar(false)
    }
    trackingEvent('create_new_conversation', { event_category: 'user' })
  }, [isSmallScreen, navigate, setShowSidebar])

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (isSmallScreen) return
      e.preventDefault()
      e.stopPropagation()
      setIsResizing(true)
      resizeStartX.current = e.clientX
      resizeStartWidth.current = sidebarWidth
    },
    [isSmallScreen, sidebarWidth]
  )

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const isRTL = language === 'ar'
      const deltaX = isRTL ? resizeStartX.current - e.clientX : e.clientX - resizeStartX.current
      const newWidth = Math.max(200, Math.min(500, resizeStartWidth.current + deltaX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, language, setSidebarWidth])

  useEffect(() => {
    if (currentCopilotId) {
      setProjectsExpanded(true)
    }
  }, [currentCopilotId])

  useEffect(() => {
    if (currentPath.startsWith('/session/')) {
      setChatsExpanded(true)
    }
  }, [currentPath])

  return (
    <SwipeableDrawer
      anchor={language === 'ar' ? 'right' : 'left'}
      variant={isSmallScreen ? 'temporary' : 'persistent'}
      open={showSidebar}
      onClose={() => setShowSidebar(false)}
      onOpen={() => setShowSidebar(true)}
      ModalProps={{
        keepMounted: true,
      }}
      sx={{
        '& .MuiDrawer-paper': {
          backgroundImage: 'none',
          boxSizing: 'border-box',
          width: isSmallScreen ? '75vw' : sidebarWidth,
          maxWidth: '75vw',
        },
      }}
      SlideProps={language === 'ar' ? { direction: 'left' } : undefined}
      PaperProps={
        language === 'ar' ? { sx: { direction: 'rtl', overflowY: 'initial' } } : { sx: { overflowY: 'initial' } }
      }
      disableSwipeToOpen={CHATBOX_BUILD_PLATFORM !== 'ios'}
      disableEnforceFocus={true}
    >
      <Stack
        h="100%"
        gap={0}
        pt="var(--mobile-safe-area-inset-top, 0px)"
        pb="var(--mobile-safe-area-inset-bottom, 0px)"
        className="relative"
      >
        {needRoomForMacWindowControls && <Box className="title-bar flex-[0_0_44px]" />}

        <Flex align="center" justify="space-between" px="md" py="sm">
          <Flex align="center" gap="sm">
            <Flex
              align="center"
              gap="sm"
              onClick={() => platform.openLink('https://chatboxai.app/')}
              style={{ cursor: 'pointer' }}
            >
              <Image src={icon} w={20} h={20} />
              <Text span c="chatbox-secondary" size="xl" lh={1.2} fw="700">
                Chatbox
              </Text>
            </Flex>
            {FORCE_ENABLE_DEV_PAGES && <ThemeSwitchButton size="xs" />}
          </Flex>

          <Tooltip label={t('Collapse')} openDelay={1000} withArrow>
            <ActionIcon variant="subtle" color="chatbox-tertiary" size={20} onClick={() => setShowSidebar(false)}>
              <IconLayoutSidebarLeftCollapse />
            </ActionIcon>
          </Tooltip>
        </Flex>

        <Box flex={1} className="overflow-y-auto">
          <Stack gap="xs" px="xs" pb="md">
            <SidebarPrimaryAction
              icon={IconCirclePlus}
              label={t('New Chat')}
              onClick={handleCreateNewSession}
              emphasized
            />
            <SidebarPrimaryAction
              icon={IconSearch}
              label={t('Search chats')}
              onClick={() => setOpenSearchDialog(true, true)}
            />

            <SidebarDisclosure
              label={t('Projects')}
              expanded={projectsExpanded}
              onClick={() => setProjectsExpanded((expanded) => !expanded)}
            />
            <Collapse in={projectsExpanded}>
              <Stack gap={4} pt={4} pb="xs">
                {projectItems.map((project) => (
                  <SidebarProjectItem
                    key={project.id}
                    label={project.name}
                    selected={currentCopilotId === project.id}
                    onClick={() => {
                      navigate({
                        to: '/',
                        search: {
                          copilotId: project.id,
                        },
                      })
                      if (isSmallScreen) {
                        setShowSidebar(false)
                      }
                    }}
                  />
                ))}
              </Stack>
            </Collapse>

            <SidebarDisclosure
              label={t('Your chats')}
              expanded={chatsExpanded}
              onClick={() => setChatsExpanded((expanded) => !expanded)}
            />
            <Collapse in={chatsExpanded}>
              <Stack gap={2} pt={4}>
                {(sortedSessions || []).map((session) => (
                  <SessionItem key={session.id} session={session} selected={currentPath === `/session/${session.id}`} />
                ))}
              </Stack>
            </Collapse>
          </Stack>
        </Box>

        <Stack gap={0} px="xs" pb="xs">
          <Divider />
          <NavLink
            c="chatbox-secondary"
            className="rounded"
            label={t('My Copilots')}
            leftSection={<ScalableIcon icon={IconMessageChatbot} size={20} />}
            onClick={() => {
              navigate({
                to: '/copilots',
              })
              if (isSmallScreen) {
                setShowSidebar(false)
              }
            }}
            variant="light"
            p="xs"
          />
          <NavLink
            c="chatbox-secondary"
            className="rounded"
            label={t('Settings')}
            leftSection={<ScalableIcon icon={IconSettingsFilled} size={20} />}
            onClick={() => {
              navigateToSettings()
              if (isSmallScreen) {
                setShowSidebar(false)
              }
            }}
            variant="light"
            p="xs"
          />
          {FORCE_ENABLE_DEV_PAGES && (
            <NavLink
              c="chatbox-secondary"
              className="rounded"
              label="Dev Tools"
              leftSection={<ScalableIcon icon={IconCode} size={20} />}
              onClick={() => {
                navigate({
                  to: '/dev',
                })
                if (isSmallScreen) {
                  setShowSidebar(false)
                }
              }}
              variant="light"
              p="xs"
            />
          )}
          <NavLink
            c="chatbox-tertiary"
            className="rounded"
            label={
              <Flex align="center" gap={6}>
                <span>{`${t('About')} ${/\d/.test(versionHook.version) ? `(${versionHook.version})` : ''}`}</span>
                {CHATBOX_BUILD_PLATFORM === 'android' && versionHook.needCheckUpdate && (
                  <Box w={8} h={8} miw={8} bg="chatbox-brand" style={{ borderRadius: '50%' }} />
                )}
              </Flex>
            }
            leftSection={<ScalableIcon icon={IconInfoCircle} size={20} />}
            onClick={() => {
              navigate({
                to: '/about',
              })
              if (isSmallScreen) {
                setShowSidebar(false)
              }
            }}
            variant="light"
            p="xs"
          />
        </Stack>

        {!isSmallScreen && (
          <Box
            onMouseDown={handleResizeStart}
            className={clsx(
              'sidebar-resizer absolute top-0 bottom-0 w-1 cursor-col-resize z-[1] bg-chatbox-border-primary opacity-0 hover:opacity-70 transition-opacity duration-200',
              language === 'ar' ? '-left-1' : '-right-1'
            )}
          />
        )}
      </Stack>
    </SwipeableDrawer>
  )
}

function SidebarPrimaryAction({
  icon,
  label,
  onClick,
  emphasized = false,
}: {
  icon: ElementType<IconProps>
  label: string
  onClick: () => void
  emphasized?: boolean
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      className={clsx(
        'w-full rounded-xl px-3 py-3 transition-colors',
        emphasized
          ? 'bg-chatbox-background-gray-secondary hover:bg-chatbox-background-brand-secondary'
          : 'hover:bg-chatbox-background-gray-secondary'
      )}
    >
      <Flex align="center" gap="sm">
        <ScalableIcon icon={icon} size={20} className="text-chatbox-primary" />
        <Text fw={600} c="chatbox-primary">
          {label}
        </Text>
      </Flex>
    </UnstyledButton>
  )
}

function SidebarDisclosure({ label, expanded, onClick }: { label: string; expanded: boolean; onClick: () => void }) {
  return (
    <UnstyledButton
      onClick={onClick}
      className="w-full rounded-xl px-3 py-2 text-left hover:bg-chatbox-background-gray-secondary transition-colors"
    >
      <Flex align="center" justify="space-between">
        <Text fw={600} c="chatbox-secondary">
          {label}
        </Text>
        <ScalableIcon
          icon={expanded ? IconChevronDown : IconChevronRight}
          size={18}
          className="text-chatbox-tertiary"
        />
      </Flex>
    </UnstyledButton>
  )
}

function SidebarProjectItem({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <UnstyledButton
      onClick={onClick}
      className={clsx(
        'w-full rounded-lg px-3 py-2 text-left transition-colors',
        selected ? 'bg-chatbox-background-brand-secondary' : 'hover:bg-chatbox-background-gray-secondary'
      )}
    >
      <Flex align="center" gap="sm">
        <ScalableIcon
          icon={IconFolder}
          size={18}
          className={selected ? 'text-chatbox-brand' : 'text-chatbox-tertiary'}
        />
        <Text lineClamp={1} c={selected ? 'chatbox-brand' : 'chatbox-primary'}>
          {label}
        </Text>
      </Flex>
    </UnstyledButton>
  )
}
