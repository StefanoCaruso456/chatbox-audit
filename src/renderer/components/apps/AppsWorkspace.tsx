import type { ReactNode } from 'react'
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

  return (
    <>
      <div
        className={cn('flex h-full min-h-0 flex-1', activeApprovedAppId && !isCompactScreen ? 'gap-3' : '', className)}
      >
        <div className="min-h-0 min-w-0 flex-1">{children}</div>
        {!isCompactScreen && activeApprovedAppId ? <AppIframePanel /> : null}
      </div>
      {isCompactScreen && activeApprovedAppId ? <AppIframePanel /> : null}
    </>
  )
}
