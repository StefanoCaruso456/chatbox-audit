import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Button, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveSelect } from '@/components/AdaptiveSelect'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { useProjects } from '@/hooks/useProjects'
import { updateSession, useSession } from '@/stores/chatStore'

const NO_PROJECT_VALUE = '__no-project__'

function getProjectErrorMessage(error: unknown, t: (key: string) => string) {
  if (error instanceof Error) {
    if (error.message === 'PROJECT_NAME_REQUIRED') {
      return t('Project name is required')
    }
    if (error.message === 'PROJECT_NAME_EXISTS') {
      return t('A project with this name already exists')
    }
  }
  return t('Unknown error')
}

const MoveSessionToProject = NiceModal.create(({ sessionId }: { sessionId: string }) => {
  const modal = useModal()
  const { t } = useTranslation()
  const { session } = useSession(sessionId)
  const { projects, createProject } = useProjects()
  const [selectedProjectId, setSelectedProjectId] = useState(NO_PROJECT_VALUE)
  const [newProjectName, setNewProjectName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (modal.visible) {
      setSelectedProjectId(session?.projectId ?? NO_PROJECT_VALUE)
    }
  }, [modal.visible, session?.projectId])

  useEffect(() => {
    if (modal.visible) {
      setNewProjectName('')
      setError('')
    }
  }, [modal.visible])

  const projectOptions = useMemo(
    () => [
      { value: NO_PROJECT_VALUE, label: t('No project') },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
      })),
    ],
    [projects, t]
  )

  const onClose = () => {
    modal.resolve()
    modal.hide()
  }

  const onSubmit = async () => {
    if (!session) {
      return
    }

    try {
      let nextProjectId = selectedProjectId === NO_PROJECT_VALUE ? undefined : selectedProjectId

      if (newProjectName.trim()) {
        const project = createProject(newProjectName)
        nextProjectId = project.id
      }

      await updateSession(sessionId, (currentSession) => {
        if (!currentSession) {
          throw new Error(`Session ${sessionId} not found`)
        }
        return {
          ...currentSession,
          projectId: nextProjectId,
        }
      })

      modal.resolve(nextProjectId)
      modal.hide()
    } catch (err) {
      setError(getProjectErrorMessage(err, t))
    }
  }

  return (
    <AdaptiveModal opened={modal.visible} onClose={onClose} centered title={t('Move to project')}>
      <Stack gap="sm">
        <AdaptiveSelect
          label={t('Projects')}
          data={projectOptions}
          value={selectedProjectId}
          onChange={(value) => {
            setSelectedProjectId(value ?? NO_PROJECT_VALUE)
            if (error) {
              setError('')
            }
          }}
        />

        <Text size="sm" c="chatbox-tertiary">
          {t('Or create a new project')}
        </Text>

        <TextInput
          label={t('Project name') || ''}
          placeholder={t('Project name') || ''}
          value={newProjectName}
          onChange={(event) => {
            setNewProjectName(event.currentTarget.value)
            if (error) {
              setError('')
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void onSubmit()
            }
          }}
        />

        {error && (
          <Text size="sm" c="chatbox-error">
            {error}
          </Text>
        )}
      </Stack>

      <AdaptiveModal.Actions>
        <AdaptiveModal.CloseButton onClick={onClose} />
        <Button onClick={() => void onSubmit()}>{t('Save')}</Button>
      </AdaptiveModal.Actions>
    </AdaptiveModal>
  )
})

export default MoveSessionToProject
