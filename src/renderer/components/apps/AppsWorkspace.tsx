import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { useScreenDownToMD } from '@/hooks/useScreenChange'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import AppIframePanel from './AppIframePanel'

type AppsWorkspaceProps = {
  children: ReactNode
  className?: string
}

export default function AppsWorkspace({ children, className }: AppsWorkspaceProps) {
  const isCompactScreen = useScreenDownToMD()
  const activeApprovedAppId = useUIStore((state) => state.activeApprovedAppId)
  const setShowSidebar = useUIStore((state) => state.setShowSidebar)
  const hadActiveApprovedAppRef = useRef(Boolean(activeApprovedAppId))

  useEffect(() => {
    const hasActiveApprovedApp = Boolean(activeApprovedAppId)

    if (!isCompactScreen && hasActiveApprovedApp && !hadActiveApprovedAppRef.current) {
      setShowSidebar(false)
    }

    hadActiveApprovedAppRef.current = hasActiveApprovedApp
  }, [activeApprovedAppId, isCompactScreen, setShowSidebar])

  return (
    <>
      <div
        className={cn('flex h-full min-h-0 flex-1', activeApprovedAppId && !isCompactScreen ? 'gap-3' : '', className)}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        {!isCompactScreen && activeApprovedAppId ? <AppIframePanel /> : null}
      </div>
      {isCompactScreen && activeApprovedAppId ? <AppIframePanel /> : null}
    </>
  )
}
