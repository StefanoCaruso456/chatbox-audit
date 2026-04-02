import { Typography } from '@mui/material'
import type { Message } from '@shared/types'
import { useAtomValue } from 'jotai'
import { Loader } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import * as atoms from '@/stores/atoms'
import LinkTargetBlank from '../common/Link'

export default function MessageStatuses(props: { statuses: Message['status'] }) {
  const { statuses } = props
  if (!statuses || statuses.length === 0) {
    return null
  }
  return (
    <>
      {statuses.map((status) => (
        <MessageStatus key={getMessageStatusKey(status)} status={status} />
      ))}
    </>
  )
}

function getMessageStatusKey(status: NonNullable<Message['status']>[number]) {
  switch (status.type) {
    case 'retrying':
      return `${status.type}:${status.attempt}:${status.maxAttempts}`
    case 'launching_app':
    case 'loading_embedded_app':
    case 'waiting_app_completion':
      return `${status.type}:${status.appName || 'unknown'}`
    default:
      return `${status.type}:${status.mode || 'default'}`
  }
}

function MessageStatus(props: { status: NonNullable<Message['status']>[number] }) {
  const { status } = props
  const { t } = useTranslation()
  const remoteConfig = useAtomValue(atoms.remoteConfigAtom)
  if (status.type === 'sending_file') {
    return (
      <div>
        <LoadingBubble>
          <span className="flex flex-col">
            <span>{t('Reading file...')}</span>
            {status.mode && (
              <span className="text-[10px] opacity-70 font-normal">
                {status.mode === 'local' ? t('Local Mode') : t('Advanced Mode')}
              </span>
            )}
          </span>
        </LoadingBubble>
        {status.mode === 'local' && remoteConfig.setting_chatboxai_first && (
          <Typography variant="body2" sx={{ opacity: 0.5 }} className="pb-1">
            <Trans
              i18nKey="Due to local processing limitations, <Link>Chatbox AI Service</Link> is recommended for enhanced document processing capabilities and better results."
              components={{
                Link: (
                  <LinkTargetBlank href="https://chatboxai.app/redirect_app/advanced_file_processing?utm_source=app&utm_content=msg_local_limitation"></LinkTargetBlank>
                ),
              }}
            />
          </Typography>
        )}
      </div>
    )
  }
  if (status.type === 'loading_webpage') {
    return (
      <div>
        <LoadingBubble>
          <span className="flex flex-col">
            <span>{t('Loading webpage...')}</span>
            {status.mode && (
              <span className="text-[10px] opacity-70 font-normal">
                {status.mode === 'local' ? t('Local Mode') : t('Advanced Mode')}
              </span>
            )}
          </span>
        </LoadingBubble>
        {status.mode === 'local' && remoteConfig.setting_chatboxai_first && (
          <Typography variant="body2" sx={{ opacity: 0.5 }} className="pb-1">
            <Trans
              i18nKey="Due to local processing limitations, <Link>Chatbox AI Service</Link> is recommended to enhance webpage parsing capabilities, especially for dynamic pages."
              components={{
                Link: (
                  <LinkTargetBlank href="https://chatboxai.app/redirect_app/advanced_url_processing?utm_source=app&utm_content=msg_local_limitation"></LinkTargetBlank>
                ),
              }}
            />
          </Typography>
        )}
      </div>
    )
  }
  if (status.type === 'retrying') {
    return <RetryingIndicator attempt={status.attempt} maxAttempts={status.maxAttempts} />
  }
  if (status.type === 'launching_app') {
    return (
      <LoadingBubble>
        <span>
          {status.appName ? t('Launching {{appName}}...', { appName: status.appName }) : t('Launching app...')}
        </span>
      </LoadingBubble>
    )
  }
  if (status.type === 'loading_embedded_app') {
    return (
      <LoadingBubble>
        <span>
          {status.appName
            ? t('Loading {{appName}} interface...', { appName: status.appName })
            : t('Loading app interface...')}
        </span>
      </LoadingBubble>
    )
  }
  if (status.type === 'waiting_app_completion') {
    return (
      <LoadingBubble>
        <span>
          {status.appName
            ? t('Waiting for {{appName}} to finish...', { appName: status.appName })
            : t('Waiting for app to finish...')}
        </span>
      </LoadingBubble>
    )
  }
  return null
}

function RetryingIndicator(props: { attempt: number; maxAttempts: number }) {
  const { attempt, maxAttempts } = props
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
      <Loader className="w-3 h-3 animate-spin" />
      <span>{t('Retrying {{attempt}}/{{maxAttempts}}', { attempt, maxAttempts })}</span>
    </div>
  )
}

export function LoadingBubble(props: { children: React.ReactNode }) {
  const { children } = props
  return (
    <div className="flex flex-row items-start justify-start overflow-x-auto overflow-y-hidden">
      <div
        className="flex justify-start items-center mb-1 px-1 py-2
                                                    border-solid border-blue-400/20 shadow-md rounded-lg
                                                    bg-blue-100
                                                    "
      >
        <Loader className="w-6 h-6 ml-1 mr-2 text-black animate-spin" />
        <span className="mr-4 animate-pulse font-bold text-gray-800/70">{children}</span>
      </div>
    </div>
  )
}
