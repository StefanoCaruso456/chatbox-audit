import { RuntimeTraceSpanSchema, type RuntimeTraceSpan } from '@shared/contracts/v1'
import { z } from 'zod'
import { resolveTutorMeAIBackendOrigin } from '@/packages/tutormeai-auth/client'

const RuntimeTraceExportResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    exportedSpanIds: z.array(z.string()),
    projectName: z.string().min(1),
  }),
})

const RuntimeTraceBootstrapResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    projectName: z.string().min(1),
  }),
})

function readApiErrorMessage(payload: unknown, fallback: string) {
  const parsedPayload = z
    .object({
      error: z
        .object({
          message: z.string().min(1).optional(),
        })
        .optional(),
    })
    .safeParse(payload)

  return parsedPayload.success && parsedPayload.data.error?.message ? parsedPayload.data.error.message : fallback
}

export async function bootstrapTutorMeAIRuntimeTelemetry(input: {
  backendOrigin?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}) {
  const response = await (input.fetchImpl ?? fetch)(
    new URL(
      '/api/telemetry/runtime-traces/bootstrap',
      input.backendOrigin ?? resolveTutorMeAIBackendOrigin()
    ).toString(),
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
      },
      mode: 'cors',
      signal: input.signal,
    }
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(readApiErrorMessage(payload, 'Braintrust runtime telemetry bootstrap failed.'))
  }

  return RuntimeTraceBootstrapResponseSchema.parse(payload).data
}

export async function exportTutorMeAIRuntimeTraceSpans(input: {
  spans: RuntimeTraceSpan[]
  backendOrigin?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}) {
  const spans = z.array(RuntimeTraceSpanSchema).min(1).parse(input.spans)
  const response = await (input.fetchImpl ?? fetch)(
    new URL('/api/telemetry/runtime-traces', input.backendOrigin ?? resolveTutorMeAIBackendOrigin()).toString(),
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        spans,
      }),
      mode: 'cors',
      signal: input.signal,
    }
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(readApiErrorMessage(payload, 'Braintrust runtime telemetry export failed.'))
  }

  return RuntimeTraceExportResponseSchema.parse(payload).data
}
