import { useEffect, useRef } from 'react'
import { useChatBridgeActiveApp, useChatBridgeAppsSdkState } from '@/packages/apps-sdk'

type ApprovedAppDraftSessionBootstrapControllerProps = {
  onRuntimeAppOpened: () => Promise<void> | void
}

export default function ApprovedAppDraftSessionBootstrapController({
  onRuntimeAppOpened,
}: ApprovedAppDraftSessionBootstrapControllerProps) {
  const activeApprovedAppId = useChatBridgeAppsSdkState((state) => state.activeAppId)
  const activeApp = useChatBridgeActiveApp()
  const lastHandledAppIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeApprovedAppId) {
      lastHandledAppIdRef.current = null
      return
    }

    if (!activeApp || activeApp.experience !== 'tutormeai-runtime') {
      return
    }

    if (lastHandledAppIdRef.current === activeApprovedAppId) {
      return
    }

    lastHandledAppIdRef.current = activeApprovedAppId
    void onRuntimeAppOpened()
  }, [activeApp, activeApprovedAppId, onRuntimeAppOpened])

  return null
}
