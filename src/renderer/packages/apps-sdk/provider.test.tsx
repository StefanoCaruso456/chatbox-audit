/**
 * @vitest-environment jsdom
 */

import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApprovedApp } from '@/types/apps'
import { ChatBridgeAppsSdkProvider, useChatBridgeActiveApp, useChatBridgeAppsSdk, useChatBridgeAppsSdkState } from '.'
import { createChatBridgeAppsSdk } from './sdk'
import type { AppsSdkAdapter, AppsSdkState } from './types'

function createApp(id: string, name: string): ApprovedApp {
  return {
    id,
    name,
    icon: '/icons/mock.png',
    shortSummary: 'Mock app summary',
    category: 'Math & STEM',
    gradeRanges: ['3-5'],
    launchUrl: `https://example.com/${id}`,
    launchMode: 'iframe',
    integrationMode: 'partner-embed',
    isApproved: true,
    tags: ['mock'],
  }
}

function createStaticAdapter(state: AppsSdkState): AppsSdkAdapter {
  return {
    useStore: (selector) => selector(state),
    getState: () => state,
    setLibraryOpen: vi.fn(),
    openLibrary: vi.fn(),
    closeLibrary: vi.fn(),
    requestOpen: vi.fn(),
    completeOpen: vi.fn(),
    clearRequested: vi.fn(),
    closeActive: vi.fn(),
    setPanelWidth: vi.fn(),
  }
}

describe('ChatBridgeAppsSdkProvider', () => {
  it('exposes a host-supplied SDK through the provider hooks', () => {
    const sdk = createChatBridgeAppsSdk({
      apps: [createApp('science-lab', 'Science Lab')],
      adapter: createStaticAdapter({
        isLibraryOpen: true,
        requestedAppId: null,
        activeAppId: 'science-lab',
        panelWidth: 420,
      }),
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ChatBridgeAppsSdkProvider sdk={sdk}>{children}</ChatBridgeAppsSdkProvider>
    )

    const { result } = renderHook(
      () => ({
        sdk: useChatBridgeAppsSdk(),
        activeApp: useChatBridgeActiveApp(),
        isLibraryOpen: useChatBridgeAppsSdkState((state) => state.isLibraryOpen),
        panelWidth: useChatBridgeAppsSdkState((state) => state.panelWidth),
      }),
      { wrapper }
    )

    expect(result.current.sdk).toBe(sdk)
    expect(result.current.activeApp).toMatchObject({
      id: 'science-lab',
    })
    expect(result.current.isLibraryOpen).toBe(true)
    expect(result.current.panelWidth).toBe(420)
  })
})
