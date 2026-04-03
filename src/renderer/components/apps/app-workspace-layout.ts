export const APPROVED_APP_PANEL_DEFAULT_VIEWPORT_RATIO = 0.6
export const APPROVED_APP_PANEL_MIN_WIDTH = 320
export const APPROVED_APP_PANEL_MIN_MAIN_WIDTH = 320
export const APPROVED_APP_PANEL_RESIZER_WIDTH = 12

export function clampApprovedAppPanelWidth(requestedWidth: number, containerWidth: number) {
  const normalizedWidth = Number.isFinite(requestedWidth) ? Math.round(requestedWidth) : APPROVED_APP_PANEL_MIN_WIDTH
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return Math.max(APPROVED_APP_PANEL_MIN_WIDTH, normalizedWidth)
  }

  const minMainWidth = Math.min(
    APPROVED_APP_PANEL_MIN_MAIN_WIDTH,
    Math.max(240, Math.floor(containerWidth * 0.4))
  )
  const minPanelWidth = Math.min(APPROVED_APP_PANEL_MIN_WIDTH, Math.max(280, Math.floor(containerWidth * 0.35)))
  const maxPanelWidth = Math.max(minPanelWidth, Math.floor(containerWidth - minMainWidth - APPROVED_APP_PANEL_RESIZER_WIDTH))

  return Math.max(minPanelWidth, Math.min(maxPanelWidth, normalizedWidth))
}

export function getDefaultApprovedAppPanelWidth(viewportWidth: number, containerWidth: number) {
  const fallbackViewportWidth =
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : containerWidth / APPROVED_APP_PANEL_DEFAULT_VIEWPORT_RATIO

  return clampApprovedAppPanelWidth(
    Math.round(fallbackViewportWidth * APPROVED_APP_PANEL_DEFAULT_VIEWPORT_RATIO),
    containerWidth
  )
}
