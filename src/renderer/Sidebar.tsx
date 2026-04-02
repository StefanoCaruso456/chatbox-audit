import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Box, Collapse, Flex, Image, NavLink, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import SwipeableDrawer from '@mui/material/SwipeableDrawer'
import {
  IconChevronDown,
  IconChevronRight,
  IconCirclePlus,
  IconCode,
  IconFolder,
  IconFolderPlus,
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
import { useProjects } from './hooks/useProjects'
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
  const { projects } = useProjects()

  const sidebarWidth = useSidebarWidth()
  const isSmallScreen = useIsSmallScreen()
  const currentPath = routerState.location.pathname
  const currentSessionId = currentPath.startsWith('/session/') ? currentPath.replace('/session/', '') : null
  const currentSession = useMemo(
    () => (sortedSessions || []).find((session) => session.id === currentSessionId),
    [currentSessionId, sortedSessions]
  )
  const currentProjectId = currentSession?.projectId

  const [projectsExpanded, setProjectsExpanded] = useState(() => Boolean(currentProjectId))
  const [chatsExpanded, setChatsExpanded] = useState(() => currentPath.startsWith('/session/'))
  const [expandedProjectIds, setExpandedProjectIds] = useState<Record<string, boolean>>({})
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartX = useRef<number>(0)
  const resizeStartWidth = useRef<number>(0)

  const { needRoomForMacWindowControls } = useNeedRoomForMacWinControls()

  const validProjectIds = useMemo(() => new Set(projects.map((project) => project.id)), [projects])
  const unassignedSessions = useMemo(
    () => (sortedSessions || []).filter((session) => !session.projectId || !validProjectIds.has(session.projectId)),
    [sortedSessions, validProjectIds]
  )
  const sessionsByProject = useMemo(() => {
    const grouped = new Map<string, typeof sortedSessions>()
    for (const project of projects) {
      grouped.set(project.id, [])
    }
    for (const session of sortedSessions || []) {
      if (session.projectId && grouped.has(session.projectId)) {
        grouped.get(session.projectId)?.push(session)
      }
    }
    return grouped
  }, [projects, sortedSessions])

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
    if (currentProjectId) {
      setProjectsExpanded(true)
      setExpandedProjectIds((prev) => ({ ...prev, [currentProjectId]: true }))
    }
  }, [currentProjectId])

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
                <SidebarPrimaryAction
                  icon={IconFolderPlus}
                  label={t('New project')}
                  onClick={() => void NiceModal.show('create-project')}
                  compact
                />

                {projects.map((project) => {
                  const projectSessions = sessionsByProject.get(project.id) || []
                  const expanded = Boolean(expandedProjectIds[project.id])

                  return (
                    <Box key={project.id}>
                      <SidebarProjectDisclosure
                        label={project.name}
                        chatCount={projectSessions.length}
                        expanded={expanded}
                        selected={currentProjectId === project.id}
                        onClick={() =>
                          setExpandedProjectIds((prev) => ({
                            ...prev,
                            [project.id]: !prev[project.id],
                          }))
                        }
                      />
                      <Collapse in={expanded}>
                        <Stack gap={2} pt={4}>
                          {projectSessions.map((session) => (
                            <Box key={session.id} pl="lg">
                              <SessionItem session={session} selected={currentPath === `/session/${session.id}`} />
                            </Box>
                          ))}
                        </Stack>
                      </Collapse>
                    </Box>
                  )
                })}
              </Stack>
            </Collapse>

            <SidebarDisclosure
              label={t('Your chats')}
              expanded={chatsExpanded}
              onClick={() => setChatsExpanded((expanded) => !expanded)}
            />
            <Collapse in={chatsExpanded}>
              <Stack gap={2} pt={4}>
                {unassignedSessions.map((session) => (
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
  compact = false,
}: {
  icon: ElementType<IconProps>
  label: string
  onClick: () => void
  emphasized?: boolean
  compact?: boolean
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      className={clsx(
        'w-full transition-colors',
        compact ? 'rounded-lg px-3 py-2.5' : 'rounded-xl px-3 py-3',
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

function SidebarProjectDisclosure({
  label,
  chatCount,
  expanded,
  selected,
  onClick,
}: {
  label: string
  chatCount: number
  expanded: boolean
  selected: boolean
  onClick: () => void
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      className={clsx(
        'w-full rounded-lg px-3 py-2 text-left transition-colors',
        selected ? 'bg-chatbox-background-brand-secondary' : 'hover:bg-chatbox-background-gray-secondary'
      )}
    >
      <Flex align="center" justify="space-between" gap="sm">
        <Flex align="center" gap="sm" maw="80%">
          <ScalableIcon
            icon={IconFolder}
            size={18}
            className={selected ? 'text-chatbox-brand' : 'text-chatbox-tertiary'}
          />
          <Text lineClamp={1} c={selected ? 'chatbox-brand' : 'chatbox-primary'}>
            {label}
          </Text>
        </Flex>

        <Flex align="center" gap={6}>
          <Text size="xs" c="chatbox-tertiary">
            {chatCount}
          </Text>
          <ScalableIcon
            icon={expanded ? IconChevronDown : IconChevronRight}
            size={16}
            className="text-chatbox-tertiary"
          />
        </Flex>
      </Flex>
    </UnstyledButton>
  )
}
