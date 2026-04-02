import { exampleAuthenticatedPlannerManifest, exampleInternalChessManifest, examplePublicFlashcardsManifest } from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { AppSubmissionPackageSchema } from '../security'
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

function buildSubmission(manifest: typeof exampleInternalChessManifest | typeof examplePublicFlashcardsManifest | typeof exampleAuthenticatedPlannerManifest, category: string) {
  return AppSubmissionPackageSchema.parse({
    submissionVersion: 'v1',
    category,
    manifest,
    owner: {
      ownerType: 'external-partner',
      ownerName: 'Partner App Studio',
      contactName: 'Taylor Brooks',
      contactEmail: 'taylor@example.com',
      organization: 'Partner App Studio',
    },
    domains: manifest.allowedOrigins,
    requestedOAuthScopes: manifest.authConfig?.scopes ?? [],
    stagingUrl: manifest.uiEmbedConfig.entryUrl,
    privacyPolicyUrl: `${manifest.uiEmbedConfig.targetOrigin}/privacy`,
    support: {
      supportEmail: 'support@example.com',
      responsePolicy: 'School support responses within one business day.',
      supportUrl: `${manifest.uiEmbedConfig.targetOrigin}/support`,
    },
    releaseNotes: `Submission package for ${manifest.appVersion}.`,
    screenshots: [],
    submittedAt: '2026-04-02T12:00:00.000Z',
  })
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
        body: JSON.stringify(buildSubmission(exampleInternalChessManifest, 'games')),
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
        domain: 'api',
        code: 'invalid-json',
        message: 'Request body must be valid JSON.',
        retryable: false,
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
        body: JSON.stringify(buildSubmission(exampleInternalChessManifest, 'games')),
      })
    )

    const response = await api.register(
      new Request('https://railway.local/api/registry/apps', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(
          buildSubmission(
            {
              ...examplePublicFlashcardsManifest,
              slug: exampleInternalChessManifest.slug,
            },
            'study'
          )
        ),
      })
    )

    const body = await readJson(response)

    expect(response.status).toBe(409)
    expect(body.ok).toBe(false)
    expect(body.error.domain).toBe('registry')
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
        domain: 'api',
        code: 'unapproved-read-disabled',
        message: 'Unapproved registry exposure is disabled on this API surface.',
        retryable: false,
      },
    })
  })

  it('supports lookup by slug when the app is approved', async () => {
    const { api, service } = createFixture()

    await service.registerApp({
      manifest: examplePublicFlashcardsManifest,
      category: 'study',
    })

    const response = await api.get(
      new Request(`https://railway.local/api/registry/apps?slug=${examplePublicFlashcardsManifest.slug}`)
    )
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.app.slug).toBe(examplePublicFlashcardsManifest.slug)
  })
})
