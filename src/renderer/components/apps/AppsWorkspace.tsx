import type { ReactNode } from 'react'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import AppIframePanel from './AppIframePanel'

type AppsWorkspaceProps = {
  children: ReactNode
  className?: string
}

export default function AppsWorkspace({ children, className }: AppsWorkspaceProps) {
  const isSmallScreen = useIsSmallScreen()
  const activeApprovedAppId = useUIStore((state) => state.activeApprovedAppId)

  return (
    <>
      <div
        className={cn('flex h-full min-h-0 flex-1', activeApprovedAppId && !isSmallScreen ? 'gap-3' : '', className)}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        {!isSmallScreen && activeApprovedAppId ? <AppIframePanel /> : null}
      </div>
      {isSmallScreen && activeApprovedAppId ? <AppIframePanel /> : null}
    </>
  )
}
