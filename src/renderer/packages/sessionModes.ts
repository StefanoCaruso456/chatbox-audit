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

const builtInPresetSessions = [...defaultSessionsForEN, ...defaultSessionsForCN].filter(
  (session, index, sessions) => sessions.findIndex((candidate) => candidate.id === session.id) === index
)

function getSessionPresetSignature(session: Pick<Session, 'name' | 'type' | 'picUrl' | 'copilotId' | 'starred' | 'messages'>) {
  return JSON.stringify({
    copilotId: session.copilotId ?? '',
    messages: (session.messages ?? []).map((message) => ({
      role: message.role,
      text: getMessageText(message).trim(),
    })),
    name: session.name,
    picUrl: session.picUrl ?? '',
    starred: !!session.starred,
    type: session.type ?? 'chat',
  })
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

export function isUnmodifiedBuiltInPresetSession(
  session: Pick<Session, 'id' | 'name' | 'type' | 'picUrl' | 'copilotId' | 'starred' | 'messages'>
) {
  const matchingPreset = builtInPresetSessions.find((preset) => preset.id === session.id)
  if (!matchingPreset) {
    return false
  }

  return getSessionPresetSignature(session) === getSessionPresetSignature(matchingPreset)
}
