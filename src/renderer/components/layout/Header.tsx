import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Flex, Text, Title, Tooltip, UnstyledButton } from '@mantine/core'
import type { Session } from '@shared/types'
import { IconChevronRight, IconFolder, IconLayoutSidebarLeftExpand, IconMenu2, IconPencil } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useNeedRoomForWinControls from '@/hooks/useNeedRoomForWinControls'
import { useProjects } from '@/hooks/useProjects'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { scheduleGenerateNameAndThreadName, scheduleGenerateThreadName } from '@/stores/sessionActions'
import * as settingActions from '@/stores/settingActions'
import { useUIStore } from '@/stores/uiStore'
import Divider from '../common/Divider'
import { ScalableIcon } from '../common/ScalableIcon'
import Toolbar from './Toolbar'
import WindowControls from './WindowControls'

export default function Header(props: { session: Session }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const showSidebar = useUIStore((s) => s.showSidebar)
  const setShowSidebar = useUIStore((s) => s.setShowSidebar)
  const { getProjectById } = useProjects()

  const isSmallScreen = useIsSmallScreen()
  const { needRoomForMacWindowControls } = useNeedRoomForWinControls()

  const { session: currentSession } = props
  const currentProject = getProjectById(currentSession.projectId)

  // 会话名称自动生成
  useEffect(() => {
    const autoGenerateTitle = settingActions.getAutoGenerateTitle()
    if (!autoGenerateTitle) {
      return
    }

    // 检查是否有正在生成的消息
    const hasGeneratingMessage = currentSession.messages.some((msg) => msg.generating)

    // 如果有消息正在生成，或者消息数量少于2条，不触发名称生成
    if (hasGeneratingMessage || currentSession.messages.length < 2) {
      return
    }

    // 触发名称生成（在 sessionActions 中进行去重和延迟处理）
    if (currentSession.name === 'Untitled') {
      scheduleGenerateNameAndThreadName(currentSession.id)
    } else if (!currentSession.threadName) {
      scheduleGenerateThreadName(currentSession.id)
    }
  }, [currentSession])

  const editCurrentSession = () => {
    if (!currentSession) {
      return
    }
    void NiceModal.show('session-settings', { session: currentSession })
  }

  return (
    <>
      <Flex h={54} align="center" px="sm" className="title-bar cb-neumo-topbar flex-none">
        {(!showSidebar || isSmallScreen) && (
          <Flex align="center" className={needRoomForMacWindowControls ? 'pl-20' : ''}>
            <ActionIcon
              className="controls"
              variant="subtle"
              size={isSmallScreen ? 24 : 20}
              color={isSmallScreen ? 'chatbox-secondary' : 'chatbox-tertiary'}
              mr="sm"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              {isSmallScreen ? <IconMenu2 /> : <IconLayoutSidebarLeftExpand />}
            </ActionIcon>
          </Flex>
        )}

        <Flex
          align="center"
          gap="xxs"
          flex={1}
          className="min-w-0"
          {...(isSmallScreen ? { justify: 'center', pl: 28, pr: 8 } : {})}
        >
          {currentProject ? (
            <>
              <UnstyledButton
                onClick={() =>
                  navigate({
                    to: '/projects/$projectId',
                    params: {
                      projectId: currentProject.id,
                    },
                  })
                }
                className="min-w-0"
              >
                <Flex align="center" gap={6} className="min-w-0">
                  <ScalableIcon icon={IconFolder} size={18} className="text-chatbox-tertiary" />
                  <Text fw={600} c="chatbox-secondary" lineClamp={1}>
                    {currentProject.name}
                  </Text>
                </Flex>
              </UnstyledButton>
              <ScalableIcon icon={IconChevronRight} size={16} className="text-chatbox-tertiary flex-shrink-0" />
            </>
          ) : null}

          <Title order={4} fz={!isSmallScreen ? 20 : undefined} lineClamp={1} className="min-w-0">
            {currentSession?.name}
          </Title>

          <Tooltip label={t('Customize settings for the current conversation')}>
            <ActionIcon
              className="controls"
              variant="subtle"
              color="chatbox-tertiary"
              size={20}
              onClick={() => {
                editCurrentSession()
              }}
            >
              <ScalableIcon icon={IconPencil} size={20} />
            </ActionIcon>
          </Tooltip>
        </Flex>

        <Toolbar sessionId={currentSession.id} />

        <WindowControls className="-mr-3 ml-2" />
      </Flex>

      <Divider className="cb-neumo-divider" />
    </>
  )
}
