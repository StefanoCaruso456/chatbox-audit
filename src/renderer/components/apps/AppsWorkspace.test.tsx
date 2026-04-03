/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { act, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { uiStore } from '@/stores/uiStore'
import AppsWorkspace from './AppsWorkspace'

vi.mock('@/hooks/useScreenChange', () => ({
  useScreenDownToMD: () => false,
}))

vi.mock('./AppIframePanel', () => ({
  default: () => <div data-testid="app-iframe-panel">app panel</div>,
}))

const initialUiState = uiStore.getState()

function renderWorkspace(children: ReactNode = <div>content</div>) {
  return render(
    <MantineProvider>
      <AppsWorkspace>{children}</AppsWorkspace>
    </MantineProvider>
  )
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

beforeEach(() => {
  uiStore.setState({
    showSidebar: true,
    activeApprovedAppId: null,
  })
})

afterEach(() => {
  uiStore.setState(initialUiState)
})

describe('AppsWorkspace', () => {
  it('collapses the left sidebar when an approved app panel opens on desktop', () => {
    renderWorkspace()

    expect(uiStore.getState().showSidebar).toBe(true)

    act(() => {
      uiStore.setState({ activeApprovedAppId: 'canvas-student' })
    })

    expect(uiStore.getState().showSidebar).toBe(false)
  })

  it('does not force-close the sidebar again after the user reopens it', () => {
    renderWorkspace()

    act(() => {
      uiStore.setState({ activeApprovedAppId: 'canvas-student' })
    })

    expect(uiStore.getState().showSidebar).toBe(false)

    act(() => {
      uiStore.setState({ showSidebar: true })
    })

    expect(uiStore.getState().showSidebar).toBe(true)
  })
})
