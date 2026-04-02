import { exampleAuthenticatedPlannerManifest, exampleInternalChessManifest, examplePublicWeatherManifest } from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { createAppRegistryApi } from './api'
import { InMemoryAppRegistryRepository } from './repository'
import { AppRegistryService } from './service'

function createFixture() {
  const repository = new InMemoryAppRegistryRepository()
  const service = new AppRegistryService(repository, {
    now: () => '2026-04-01T12:00:00.000Z',
  })
  const api = createAppRegistryApi(service)

  return {
    repository,
    service,
    api,
  }
}

async function readJson(response: Response) {
  return response.json()
}

describe('AppRegistryApi', () => {
  it('forces new registrations into pending review on the API surface', async () => {
    const { api } = createFixture()

    const response = await api.register(
      new Request('https://railway.local/api/registry/apps', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          manifest: exampleInternalChessManifest,
          category: 'games',
        }),
      })
    )

    const body = await readJson(response)

    expect(response.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.data.app.reviewStatus).toBe('pending')
    expect(body.data.app.currentVersion.manifest.safetyMetadata.reviewStatus).toBe('pending')
  })

  it('returns readable errors for invalid JSON payloads', async () => {
    const { api } = createFixture()

    const response = await api.register(
      new Request('https://railway.local/api/registry/apps', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: '{"manifest":',
      })
    )

    const body = await readJson(response)

    expect(response.status).toBe(400)
    expect(body).toEqual({
      ok: false,
      error: {
        code: 'invalid-json',
        message: 'Request body must be valid JSON.',
      },
    })
  })

  it('maps service conflicts to HTTP conflict responses', async () => {
    const { api } = createFixture()

    await api.register(
      new Request('https://railway.local/api/registry/apps', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          manifest: exampleInternalChessManifest,
          category: 'games',
        }),
      })
    )

    const response = await api.register(
      new Request('https://railway.local/api/registry/apps', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          manifest: {
            ...examplePublicWeatherManifest,
            slug: exampleInternalChessManifest.slug,
          },
          category: 'weather',
        }),
      })
    )

    const body = await readJson(response)

    expect(response.status).toBe(409)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('slug-conflict')
  })

  it('lists only approved apps by default', async () => {
    const { api, service } = createFixture()

    await service.registerApp({
      manifest: exampleInternalChessManifest,
      category: 'games',
    })
    await service.registerApp({
      manifest: exampleAuthenticatedPlannerManifest,
      category: 'productivity',
    })

    const response = await api.list(new Request('https://railway.local/api/registry/apps'))
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.apps.map((app: { appId: string }) => app.appId)).toEqual([exampleInternalChessManifest.appId])
  })

  it('blocks unapproved registry reads unless explicitly enabled on the route surface', async () => {
    const { api, service } = createFixture()

    await service.registerApp({
      manifest: exampleAuthenticatedPlannerManifest,
      category: 'productivity',
    })

    const response = await api.get(
      new Request('https://railway.local/api/registry/apps/planner.oauth?approvedOnly=false'),
      { appId: exampleAuthenticatedPlannerManifest.appId }
    )
    const body = await readJson(response)

    expect(response.status).toBe(403)
    expect(body).toEqual({
      ok: false,
      error: {
        code: 'unapproved-read-disabled',
        message: 'Unapproved registry exposure is disabled on this API surface.',
      },
    })
  })

  it('supports lookup by slug when the app is approved', async () => {
    const { api, service } = createFixture()

    await service.registerApp({
      manifest: examplePublicWeatherManifest,
      category: 'weather',
    })

    const response = await api.get(
      new Request(`https://railway.local/api/registry/apps?slug=${examplePublicWeatherManifest.slug}`)
    )
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.app.slug).toBe(examplePublicWeatherManifest.slug)
  })
})
