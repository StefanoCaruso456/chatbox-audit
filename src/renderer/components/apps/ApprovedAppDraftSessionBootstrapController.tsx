import { useEffect, useRef } from 'react'
import { getApprovedAppById } from '@/data/approvedApps'
import { useUIStore } from '@/stores/uiStore'

type ApprovedAppDraftSessionBootstrapControllerProps = {
  onRuntimeAppOpened: () => Promise<void> | void
}

export default function ApprovedAppDraftSessionBootstrapController({
  onRuntimeAppOpened,
}: ApprovedAppDraftSessionBootstrapControllerProps) {
  const activeApprovedAppId = useUIStore((state) => state.activeApprovedAppId)
  const lastHandledAppIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeApprovedAppId) {
      lastHandledAppIdRef.current = null
      return
    }

    const activeApp = getApprovedAppById(activeApprovedAppId)
    if (!activeApp || activeApp.experience !== 'tutormeai-runtime') {
      return
    }

    if (lastHandledAppIdRef.current === activeApprovedAppId) {
      return
    }

    lastHandledAppIdRef.current = activeApprovedAppId
    void onRuntimeAppOpened()
  }, [activeApprovedAppId, onRuntimeAppOpened])

  return null
}
