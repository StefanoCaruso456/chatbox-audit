import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Button, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { useProjects } from '@/hooks/useProjects'
import { useUIStore } from '@/stores/uiStore'

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

const CreateProject = NiceModal.create(() => {
  const modal = useModal()
  const { t } = useTranslation()
  const { createProject } = useProjects()
  const triggerConversationModeHint = useUIStore((s) => s.triggerConversationModeHint)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (modal.visible) {
      setName('')
      setError('')
    }
  }, [modal.visible])

  const onClose = () => {
    modal.resolve()
    modal.hide()
  }

  const onSubmit = () => {
    try {
      const project = createProject(name)
      triggerConversationModeHint()
      modal.resolve(project)
      modal.hide()
    } catch (err) {
      setError(getProjectErrorMessage(err, t))
    }
  }

  return (
    <AdaptiveModal opened={modal.visible} onClose={onClose} centered title={t('Create project')}>
      <Stack gap="sm">
        <TextInput
          autoFocus
          label={t('Project name') || ''}
          placeholder={t('Project name') || ''}
          value={name}
          onChange={(event) => {
            setName(event.currentTarget.value)
            if (error) {
              setError('')
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onSubmit()
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
        <Button onClick={onSubmit}>{t('Create project')}</Button>
      </AdaptiveModal.Actions>
    </AdaptiveModal>
  )
})

export default CreateProject
