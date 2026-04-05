import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { exampleRuntimeTraceSpans } from '@shared/contracts/v1'
import { describe, expect, it, vi } from 'vitest'

const { mockEnsureProject, mockExportSpans } = vi.hoisted(() => ({
  mockEnsureProject: vi.fn(async () => ({
    projectName: 'ChatBridge Runtime',
  })),
  mockExportSpans: vi.fn(async ({ spans }: { spans: typeof exampleRuntimeTraceSpans }) => ({
    exportedSpanIds: spans.map((span) => span.spanId),
    projectName: 'ChatBridge Runtime',
  })),
}))

vi.mock('../observability/braintrust', () => ({
  BraintrustTelemetryConfigError: class BraintrustTelemetryConfigError extends Error {},
  ensureBraintrustRuntimeProject: (...args: unknown[]) => mockEnsureProject(...args),
  exportRuntimeTraceSpansToBraintrust: (...args: unknown[]) => mockExportSpans(...args),
}))

import { createRailwayWebApp } from './railway-web-app'

async function createStaticRoot() {
  const directory = await mkdtemp(join(tmpdir(), 'chatbox-railway-web-'))
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Chatbox</title>')
  return directory
}

describe('railway runtime telemetry routes', () => {
  it('bootstraps the Braintrust runtime project over HTTP', async () => {
    const staticRootDir = await createStaticRoot()
    const app = createRailwayWebApp({ staticRootDir })

    const response = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/telemetry/runtime-traces/bootstrap', {
        method: 'POST',
        headers: {
          origin: 'https://chatbox-audit.vercel.app',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://chatbox-audit.vercel.app')
    expect(mockEnsureProject).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        projectName: 'ChatBridge Runtime',
      },
    })
  })

  it('exports runtime trace spans over HTTP', async () => {
    const staticRootDir = await createStaticRoot()
    const app = createRailwayWebApp({ staticRootDir })

    const response = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/telemetry/runtime-traces', {
        method: 'POST',
        headers: {
          origin: 'https://chatbox-audit.vercel.app',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          spans: exampleRuntimeTraceSpans.slice(0, 2),
        }),
      })
    )

    expect(response.status).toBe(202)
    expect(mockExportSpans).toHaveBeenCalledWith(
      expect.objectContaining({
        spans: exampleRuntimeTraceSpans.slice(0, 2),
      })
    )
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        exportedSpanIds: exampleRuntimeTraceSpans.slice(0, 2).map((span) => span.spanId),
        projectName: 'ChatBridge Runtime',
      },
    })
  })
})
