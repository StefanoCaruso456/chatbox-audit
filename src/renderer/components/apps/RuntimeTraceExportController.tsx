import { useEffect, useRef, useState } from 'react'
import {
  bootstrapTutorMeAIRuntimeTelemetry,
  exportTutorMeAIRuntimeTraceSpans,
} from '@/packages/tutormeai-telemetry/client'
import {
  getPendingRuntimeTraceSpans,
  markRuntimeTraceSpansExported,
  useRuntimeTraceStore,
} from '@/stores/runtimeTraceStore'

const EXPORT_DELAY_MS = 600
const RETRY_DELAY_MS = 3_000

export default function RuntimeTraceExportController() {
  const spanCount = useRuntimeTraceStore((state) => state.spans.length)
  const exportedCount = useRuntimeTraceStore((state) => state.exportedSpanIds.length)
  const [retryNonce, setRetryNonce] = useState(0)
  const bootstrappedRef = useRef(false)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (bootstrappedRef.current) {
      return
    }

    bootstrappedRef.current = true
    void bootstrapTutorMeAIRuntimeTelemetry().catch(() => {
      // Braintrust is optional in local/dev environments. The exporter will retry
      // when the first real span batch is flushed after configuration lands.
    })
  }, [])

  useEffect(() => {
    if (!spanCount || exportedCount >= spanCount) {
      return
    }

    const timeoutId = window.setTimeout(async () => {
      if (inFlightRef.current) {
        return
      }

      const pendingSpans = getPendingRuntimeTraceSpans()
      if (!pendingSpans.length) {
        return
      }

      inFlightRef.current = true
      try {
        const result = await exportTutorMeAIRuntimeTraceSpans({
          spans: pendingSpans,
        })
        markRuntimeTraceSpansExported(result.exportedSpanIds)
      } catch (error) {
        window.console.warn('Braintrust runtime telemetry export failed.', error)
        window.setTimeout(() => {
          setRetryNonce((current) => current + 1)
        }, RETRY_DELAY_MS)
      } finally {
        inFlightRef.current = false
      }
    }, EXPORT_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [exportedCount, retryNonce, spanCount])

  return null
}
