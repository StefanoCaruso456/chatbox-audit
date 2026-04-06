import { createContext, type ReactNode, useContext, useMemo } from 'react'
import type { ApprovedApp } from '@/types/apps'
import { defaultChatBridgeAppsSdk } from './default-sdk'
import type { AppsSdkState, ChatBridgeAppsSdk } from './types'

const ChatBridgeAppsSdkContext = createContext<ChatBridgeAppsSdk | null>(null)

type ChatBridgeAppsSdkProviderProps = {
  sdk?: ChatBridgeAppsSdk
  children: ReactNode
}

export function ChatBridgeAppsSdkProvider({
  sdk = defaultChatBridgeAppsSdk,
  children,
}: ChatBridgeAppsSdkProviderProps) {
  const value = useMemo(() => sdk, [sdk])
  return <ChatBridgeAppsSdkContext.Provider value={value}>{children}</ChatBridgeAppsSdkContext.Provider>
}

export function useChatBridgeAppsSdk() {
  return useContext(ChatBridgeAppsSdkContext) ?? defaultChatBridgeAppsSdk
}

export function useChatBridgeAppsSdkState<T>(selector: (state: AppsSdkState) => T) {
  const sdk = useChatBridgeAppsSdk()
  return sdk.adapter.useStore(selector)
}

export function useChatBridgeActiveApp(): ApprovedApp | undefined {
  const sdk = useChatBridgeAppsSdk()
  const activeAppId = useChatBridgeAppsSdkState((state) => state.activeAppId)
  return sdk.getAppById(activeAppId)
}

export function useChatBridgeRequestedApp(): ApprovedApp | undefined {
  const sdk = useChatBridgeAppsSdk()
  const requestedAppId = useChatBridgeAppsSdkState((state) => state.requestedAppId)
  return sdk.getAppById(requestedAppId)
}
