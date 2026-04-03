import NiceModal from '@ebay/nice-modal-react'
import { Box, Button, Flex, Paper, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import type { ModelProvider, Session, SessionMeta } from '@shared/types'
import { IconFolder, IconMessageCirclePlus } from '@tabler/icons-react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AppsTrigger from '@/components/apps/AppsTrigger'
import AppsWorkspace from '@/components/apps/AppsWorkspace'
import { AssistantAvatar } from '@/components/common/Avatar'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import InputBox, { type InputBoxPayload } from '@/components/InputBox/InputBox'
import Page from '@/components/layout/Page'
import { useProjects } from '@/hooks/useProjects'
import { useProviders } from '@/hooks/useProviders'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { router } from '@/router'
import { createSession as createSessionStore, useSessionList } from '@/stores/chatStore'
import { switchCurrentSession } from '@/stores/session/crud'
import { submitNewUserMessage } from '@/stores/session/messages'
import { initEmptyChatSession } from '@/stores/sessionHelpers'
import { useUIStore } from '@/stores/uiStore'

export const Route = createFileRoute('/projects/$projectId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isSmallScreen = useIsSmallScreen()
  const { providers } = useProviders()
  const widthFull = useUIStore((s) => s.widthFull)
  const { projectId } = Route.useParams()
  const { getProjectById } = useProjects()
  const { sessionMetaList } = useSessionList()
  const project = getProjectById(projectId)
  const [session, setSession] = useState<Session>({
    id: 'new',
    ...initEmptyChatSession(),
    projectId,
  })

  useEffect(() => {
    setSession({
      id: 'new',
      ...initEmptyChatSession(),
      projectId,
    })
  }, [projectId])

  const projectSessions = useMemo(
    () => (sessionMetaList || []).filter((item) => item.projectId === projectId),
    [projectId, sessionMetaList]
  )

  const selectedModel = useMemo(() => {
    if (session.settings?.provider && session.settings?.modelId) {
      return {
        provider: session.settings.provider,
        modelId: session.settings.modelId,
      }
    }
  }, [session.settings?.modelId, session.settings?.provider])

  const onSelectModel = useCallback((provider: ModelProvider, modelId: string) => {
    setSession((current) => ({
      ...current,
      settings: {
        ...(current.settings || {}),
        provider,
        modelId,
      },
    }))
  }, [])

  const onClickSessionSettings = useCallback(async () => {
    const response: Session = await NiceModal.show('session-settings', {
      session,
      disableAutoSave: true,
    })
    if (response) {
      setSession((current) => ({
        ...current,
        ...response,
        projectId,
      }))
    }
    return true
  }, [projectId, session])

  const handleSubmit = useCallback(
    async ({ constructedMessage, needGenerating = true, onUserMessageReady }: InputBoxPayload) => {
      const newSession = await createSessionStore({
        name: session.name,
        type: 'chat',
        assistantAvatarKey: session.assistantAvatarKey,
        picUrl: session.picUrl,
        messages: session.messages,
        copilotId: session.copilotId,
        settings: session.settings,
        projectId,
      })

      switchCurrentSession(newSession.id)

      void submitNewUserMessage(newSession.id, {
        newUserMsg: constructedMessage,
        needGenerating,
        onUserMessageReady,
      })
    },
    [projectId, session]
  )

  if (!project) {
    return (
      <Page title={t('Project not found')} right={<AppsTrigger />}>
        <Flex className="min-h-[60vh]" direction="column" align="center" justify="center" gap="md">
          <Text c="chatbox-secondary">{t('This project could not be found.')}</Text>
          <Button onClick={() => navigate({ to: '/' })}>{t('Back to HomePage')}</Button>
        </Flex>
      </Page>
    )
  }

  return (
    <Page
      title={
        <Flex align="center" gap="sm" className="min-w-0">
          <ScalableIcon icon={IconFolder} size={20} className="text-chatbox-tertiary" />
          <Title order={4} fz={!isSmallScreen ? 20 : undefined} lineClamp={1}>
            {project.name}
          </Title>
        </Flex>
      }
      right={<AppsTrigger />}
    >
      <AppsWorkspace>
        <div className="flex h-full min-h-0 flex-col p-0">
          <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-1 sm:px-3 sm:pb-3">
            <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-chatbox-border-primary/70 bg-chatbox-background-primary shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-chatbox-tint-brand/60 to-transparent" />
              <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6">
                <Stack gap="xl" className={widthFull ? 'w-full' : 'mx-auto w-full max-w-4xl'}>
                  <Stack gap={6}>
                    <Text size="xs" fw={700} c="chatbox-tertiary" tt="uppercase">
                      {t('Project')}
                    </Text>
                    <Title order={2}>{project.name}</Title>
                    <Text c="chatbox-secondary">
                      {t('Start a new chat in this project or jump back into one of the existing project chats.')}
                    </Text>
                  </Stack>

                  {!providers.length && (
                    <Paper radius="md" shadow="none" withBorder py="md" px="sm">
                      <Stack gap="sm">
                        <Stack gap="xxs" align="center">
                          <Text fw={600} className="text-center">
                            {t('Select and configure an AI model provider')}
                          </Text>
                          <Text size="xs" c="chatbox-tertiary" className="text-center">
                            {t(
                              'To start a conversation, you need to configure at least one AI model. Click the button below to get started.'
                            )}
                          </Text>
                        </Stack>

                        <Flex justify="center">
                          <Button
                            size="xs"
                            variant="light"
                            h={32}
                            miw={160}
                            fw={600}
                            onClick={() => {
                              router.navigate({
                                to: isSmallScreen ? '/settings/provider' : '/settings/chatbox-ai',
                              })
                            }}
                          >
                            {t('Setup Provider')}
                          </Button>
                        </Flex>
                      </Stack>
                    </Paper>
                  )}

                  <Stack gap="sm">
                    <Text size="sm" fw={600} c="chatbox-secondary">
                      {t('New chat in {{projectName}}', { projectName: project.name })}
                    </Text>
                    <InputBox
                      sessionType="chat"
                      sessionId="new"
                      model={selectedModel}
                      onSelectModel={onSelectModel}
                      onClickSessionSettings={onClickSessionSettings}
                      onSubmit={handleSubmit}
                    />
                  </Stack>

                  <Stack gap="sm">
                    <Text size="sm" fw={600} c="chatbox-secondary">
                      {t('Chats')}
                    </Text>

                    {projectSessions.length ? (
                      <Stack gap="xs">
                        {projectSessions.map((projectSession) => (
                          <ProjectSessionRow
                            key={projectSession.id}
                            session={projectSession}
                            onClick={() => switchCurrentSession(projectSession.id)}
                          />
                        ))}
                      </Stack>
                    ) : (
                      <Paper withBorder radius="xl" p="lg">
                        <Stack gap="xs" align="center">
                          <ScalableIcon icon={IconMessageCirclePlus} size={24} className="text-chatbox-tertiary" />
                          <Text fw={600}>{t('No chats in this project yet')}</Text>
                          <Text size="sm" c="chatbox-secondary" ta="center">
                            {t('Start a chat above and it will stay grouped under this project.')}
                          </Text>
                        </Stack>
                      </Paper>
                    )}
                  </Stack>
                </Stack>
              </div>
            </section>
          </div>
        </div>
      </AppsWorkspace>
    </Page>
  )
}

function ProjectSessionRow({ session, onClick }: { session: SessionMeta; onClick: () => void }) {
  return (
    <UnstyledButton
      onClick={onClick}
      className="w-full rounded-2xl border border-chatbox-border-primary/70 bg-chatbox-background-secondary/65 px-4 py-3 text-left transition-colors hover:bg-chatbox-background-gray-secondary"
    >
      <Flex align="center" gap="sm">
        <AssistantAvatar
          avatarKey={session.assistantAvatarKey}
          picUrl={session.picUrl}
          sessionType={session.type}
          size="sm"
          type="chat"
          c="chatbox-primary"
        />
        <Box className="min-w-0 flex-1">
          <Text fw={600} c="chatbox-primary" lineClamp={1}>
            {session.name}
          </Text>
          <Text size="sm" c="chatbox-tertiary" lineClamp={1}>
            {session.type === 'picture' ? 'Image conversation' : 'Project chat'}
          </Text>
        </Box>
      </Flex>
    </UnstyledButton>
  )
}
