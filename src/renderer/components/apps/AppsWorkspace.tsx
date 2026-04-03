import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScreenDownToMD } from '@/hooks/useScreenChange'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import AppIframePanel from './AppIframePanel'
import {
  APPROVED_APP_PANEL_RESIZER_WIDTH,
  clampApprovedAppPanelWidth,
  getDefaultApprovedAppPanelWidth,
} from './app-workspace-layout'

type AppsWorkspaceProps = {
  children: ReactNode
  className?: string
}

export default function AppsWorkspace({ children, className }: AppsWorkspaceProps) {
  const isCompactScreen = useScreenDownToMD()
  const language = useLanguage()
  const activeApprovedAppId = useUIStore((state) => state.activeApprovedAppId)
  const approvedAppPanelWidth = useUIStore((state) => state.approvedAppPanelWidth)
  const setApprovedAppPanelWidth = useUIStore((state) => state.setApprovedAppPanelWidth)
  const setShowSidebar = useUIStore((state) => state.setShowSidebar)

  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)
  const hadActiveApprovedAppRef = useRef(Boolean(activeApprovedAppId))
  const [containerWidth, setContainerWidth] = useState(0)
  const [isResizing, setIsResizing] = useState(false)

  useEffect(() => {
    if (isCompactScreen) {
      return
    }

    const container = workspaceRef.current
    if (!container) {
      return
    }

    const updateContainerWidth = () => {
      setContainerWidth(container.clientWidth)
    }

    updateContainerWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateContainerWidth)

      return () => {
        window.removeEventListener('resize', updateContainerWidth)
      }
    }

    const observer = new ResizeObserver(() => {
      updateContainerWidth()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [isCompactScreen, activeApprovedAppId])

  useEffect(() => {
    const hasActiveApprovedApp = Boolean(activeApprovedAppId)

    if (!isCompactScreen && hasActiveApprovedApp && !hadActiveApprovedAppRef.current) {
      setShowSidebar(false)
    }

    hadActiveApprovedAppRef.current = hasActiveApprovedApp
  }, [activeApprovedAppId, isCompactScreen, setShowSidebar])

  const resolvedPanelWidth = useMemo(() => {
    if (isCompactScreen || !activeApprovedAppId || containerWidth <= 0) {
      return null
    }

    if (approvedAppPanelWidth !== null) {
      return clampApprovedAppPanelWidth(approvedAppPanelWidth, containerWidth)
    }

    const viewportWidth = typeof window === 'undefined' ? containerWidth : window.innerWidth
    return getDefaultApprovedAppPanelWidth(viewportWidth, containerWidth)
  }, [activeApprovedAppId, approvedAppPanelWidth, containerWidth, isCompactScreen])

  useEffect(() => {
    if (approvedAppPanelWidth === null || containerWidth <= 0) {
      return
    }

    const clampedWidth = clampApprovedAppPanelWidth(approvedAppPanelWidth, containerWidth)
    if (clampedWidth !== approvedAppPanelWidth) {
      setApprovedAppPanelWidth(clampedWidth)
    }
  }, [approvedAppPanelWidth, containerWidth, setApprovedAppPanelWidth])

  const handleResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isCompactScreen || !activeApprovedAppId || resolvedPanelWidth === null) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setIsResizing(true)
      resizeStartX.current = event.clientX
      resizeStartWidth.current = resolvedPanelWidth
    },
    [activeApprovedAppId, isCompactScreen, resolvedPanelWidth]
  )

  useEffect(() => {
    if (!isResizing || containerWidth <= 0) {
      return
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    const handleMouseMove = (event: MouseEvent) => {
      const isRTL = language === 'ar'
      const deltaX = isRTL ? event.clientX - resizeStartX.current : resizeStartX.current - event.clientX
      const requestedWidth = resizeStartWidth.current + deltaX
      setApprovedAppPanelWidth(clampApprovedAppPanelWidth(requestedWidth, containerWidth))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [containerWidth, isResizing, language, setApprovedAppPanelWidth])

  const handleResetPanelWidth = useCallback(() => {
    setApprovedAppPanelWidth(null)
  }, [setApprovedAppPanelWidth])

  return (
    <>
      <div ref={workspaceRef} className={cn('flex h-full min-h-0 flex-1', className)}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        {!isCompactScreen && activeApprovedAppId && resolvedPanelWidth !== null ? (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize app panel"
              onMouseDown={handleResizeStart}
              onDoubleClick={handleResetPanelWidth}
              className={cn(
                'group relative flex-shrink-0 cursor-col-resize select-none',
                isResizing ? 'bg-chatbox-border-primary/20' : ''
              )}
              style={{ width: `${APPROVED_APP_PANEL_RESIZER_WIDTH}px` }}
            >
              <div
                className={cn(
                  'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-chatbox-border-primary transition-opacity duration-200',
                  isResizing ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'
                )}
              />
            </div>
            <div
              className="flex min-h-0 flex-shrink-0"
              style={{
                width: `${resolvedPanelWidth}px`,
                minWidth: `${resolvedPanelWidth}px`,
              }}
            >
              <AppIframePanel className="w-full" />
            </div>
          </>
        ) : null}
      </div>
      {isCompactScreen && activeApprovedAppId ? <AppIframePanel /> : null}
    </>
  )
}
