import type { Session } from '@shared/types'
import { getMessageText } from '@shared/utils/message'
import { defaultSessionsForCN, defaultSessionsForEN } from '@/packages/initial_data'

export interface SessionModePreset {
  value: string
  label: string
  name: string
  picUrl?: string
  systemPrompt: string
  type: 'chat' | 'picture'
  copilotId?: string
}

function normalizePrompt(prompt: string) {
  return prompt.trim().replaceAll('\r\n', '\n')
}

export function getSystemPromptFromSession(session: Pick<Session, 'messages'>) {
  const systemMessage = session.messages.find((message) => message.role === 'system')
  return systemMessage ? getMessageText(systemMessage) : ''
}

export function getSessionModePresets(language: string, type: 'chat' | 'picture'): SessionModePreset[] {
  const defaultSessions = language.startsWith('zh') ? defaultSessionsForCN : defaultSessionsForEN

  return defaultSessions
    .filter((session) => (session.type ?? 'chat') === type)
    .map((session) => ({
      value: session.id,
      label: session.name,
      name: session.name,
      picUrl: session.picUrl,
      systemPrompt: getSystemPromptFromSession(session),
      type: session.type ?? 'chat',
      copilotId: session.copilotId,
    }))
}

export function findMatchingSessionModeValue(
  session: Pick<Session, 'copilotId'>,
  systemPrompt: string,
  presets: SessionModePreset[]
) {
  if (session.copilotId) {
    const copilotMatch = presets.find((preset) => preset.copilotId === session.copilotId)
    if (copilotMatch) {
      return copilotMatch.value
    }
  }

  const normalizedPrompt = normalizePrompt(systemPrompt)
  if (!normalizedPrompt) {
    return 'custom'
  }

  return presets.find((preset) => normalizePrompt(preset.systemPrompt) === normalizedPrompt)?.value ?? 'custom'
}
