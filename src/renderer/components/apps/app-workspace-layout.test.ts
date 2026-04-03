import { describe, expect, it } from 'vitest'
import { clampApprovedAppPanelWidth, getDefaultApprovedAppPanelWidth } from './app-workspace-layout'

describe('appWorkspaceLayout', () => {
  it('defaults the app panel to 60% of the viewport when space allows', () => {
    expect(getDefaultApprovedAppPanelWidth(1600, 1600)).toBe(960)
  })

  it('clamps the default width to preserve enough room for the main chat column', () => {
    expect(getDefaultApprovedAppPanelWidth(1600, 1000)).toBe(668)
  })

  it('clamps custom panel widths inside the allowed workspace range', () => {
    expect(clampApprovedAppPanelWidth(1200, 1000)).toBe(668)
    expect(clampApprovedAppPanelWidth(120, 1000)).toBe(320)
  })
})
