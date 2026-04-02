import {
  exampleAuthenticatedPlannerManifest,
  examplePublicFlashcardsManifest,
} from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { InMemoryAppRegistryRepository } from '../registry/repository'
import { AppRegistryService } from '../registry/service'
import { createSecurityApi } from './api'
import { InMemoryAppSecurityRepository } from './repository'
import { AppSecurityService } from './service'
import { AppSubmissionPackageSchema } from './submission-package'
import { AppReviewWorkflowService } from './workflow'

function createFixture() {
  const registryRepository = new InMemoryAppRegistryRepository()
  const securityRepository = new InMemoryAppSecurityRepository()
  const registry = new AppRegistryService(registryRepository, {
    now: () => '2026-04-02T12:00:00.000Z',
  })
  const security = new AppSecurityService(securityRepository, {
    now: () => '2026-04-02T12:00:00.000Z',
  })
  const workflow = new AppReviewWorkflowService(registryRepository, security, {
    now: () => '2026-04-02T12:00:00.000Z',
  })

  return {
    api: createSecurityApi(workflow),
    registry,
  }
}

function buildSubmission(
  manifest: typeof examplePublicFlashcardsManifest | typeof exampleAuthenticatedPlannerManifest,
  category: string
) {
  return AppSubmissionPackageSchema.parse({
    submissionVersion: 'v1',
    category,
    manifest,
    owner: {
      ownerType: 'external-partner',
      ownerName: 'Partner Studio',
      contactName: 'Taylor Brooks',
      contactEmail: 'taylor@example.com',
      organization: 'Partner Studio',
    },
    domains: manifest.allowedOrigins,
    requestedOAuthScopes: manifest.authConfig?.scopes ?? [],
    stagingUrl: manifest.uiEmbedConfig.entryUrl,
    privacyPolicyUrl: `${manifest.uiEmbedConfig.targetOrigin}/privacy`,
    support: {
      supportEmail: 'support@example.com',
      responsePolicy: 'School support within one business day.',
      supportUrl: `${manifest.uiEmbedConfig.targetOrigin}/support`,
    },
    releaseNotes: `Submission package for ${manifest.appVersion}.`,
    screenshots: [],
    submittedAt: '2026-04-02T12:00:00.000Z',
  })
}

async function readJson(response: Response) {
  return response.json()
}

describe('SecurityApi', () => {
  it('lists submitted apps in the review queue', async () => {
    const { api, registry } = createFixture()

    await registry.registerApp({
      submission: buildSubmission(examplePublicFlashcardsManifest, 'study'),
      registrationSource: 'partner-submission',
    })

    const response = await api.listReviewQueue(new Request('https://railway.local/api/security/reviews'))
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.queue).toHaveLength(1)
    expect(body.data.queue[0].reviewState).toBe('submitted')
  })

  it('returns readable errors for invalid queue queries', async () => {
    const { api } = createFixture()

    const response = await api.listReviewQueue(
      new Request('https://railway.local/api/security/reviews?reviewState=not-a-real-state')
    )
    const body = await readJson(response)

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.domain).toBe('api')
    expect(body.error.code).toBe('invalid-query')
  })

  it('returns the app review context for a submitted version', async () => {
    const { api, registry } = createFixture()

    const registered = await registry.registerApp({
      submission: buildSubmission(examplePublicFlashcardsManifest, 'study'),
      registrationSource: 'partner-submission',
    })

    expect(registered.ok).toBe(true)
    if (!registered.ok) {
      return
    }

    const response = await api.getReviewContext(
      new Request(`https://railway.local/api/security/reviews/apps/${registered.value.appId}`),
      { appId: registered.value.appId }
    )
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.app.appId).toBe(registered.value.appId)
    expect(body.data.reviews).toEqual([])
  })

  it('starts a review and records a platform-owned pending review entry', async () => {
    const { api, registry } = createFixture()

    const registered = await registry.registerApp({
      submission: buildSubmission(examplePublicFlashcardsManifest, 'study'),
      registrationSource: 'partner-submission',
    })

    expect(registered.ok).toBe(true)
    if (!registered.ok) {
      return
    }

    const response = await api.startReview(
      new Request('https://railway.local/api/security/reviews/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          appId: registered.value.appId,
          reviewedByUserId: 'reviewer.platform',
          notes: 'Beginning manual harness review.',
        }),
      })
    )
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.app.reviewState).toBe('review-pending')
    expect(body.data.review.decisionAction).toBe('start-review')
  })

  it('records final reviewer decisions through the API', async () => {
    const { api, registry } = createFixture()

    const registered = await registry.registerApp({
      submission: buildSubmission(exampleAuthenticatedPlannerManifest, 'productivity'),
      registrationSource: 'partner-submission',
    })

    expect(registered.ok).toBe(true)
    if (!registered.ok) {
      return
    }

    await api.startReview(
      new Request('https://railway.local/api/security/reviews/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          appId: registered.value.appId,
          reviewedByUserId: 'reviewer.platform',
        }),
      })
    )

    const response = await api.recordDecision(
      new Request('https://railway.local/api/security/reviews/decisions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          appId: registered.value.appId,
          reviewedByUserId: 'reviewer.platform',
          action: 'approve-production',
          decisionSummary: 'Approved after successful OAuth and runtime review.',
          ageRating: 'all-ages',
          dataAccessLevel: 'moderate',
          permissionsSnapshot: [...registered.value.currentVersion.manifest.permissions],
        }),
      })
    )
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.app.reviewStatus).toBe('approved')
    expect(body.data.app.reviewState).toBe('approved-production')
    expect(body.data.review.decisionAction).toBe('approve-production')
  })

  it('maps invalid reviewer state transitions to conflict responses', async () => {
    const { api, registry } = createFixture()

    const registered = await registry.registerApp({
      submission: buildSubmission(examplePublicFlashcardsManifest, 'study'),
      registrationSource: 'partner-submission',
    })

    expect(registered.ok).toBe(true)
    if (!registered.ok) {
      return
    }

    const response = await api.recordDecision(
      new Request('https://railway.local/api/security/reviews/decisions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          appId: registered.value.appId,
          reviewedByUserId: 'reviewer.platform',
          action: 'approve-production',
          decisionSummary: 'Too early.',
          ageRating: 'all-ages',
          dataAccessLevel: 'minimal',
          permissionsSnapshot: ['tool:invoke'],
        }),
      })
    )
    const body = await readJson(response)

    expect(response.status).toBe(409)
    expect(body.ok).toBe(false)
    expect(body.error.domain).toBe('security')
    expect(body.error.code).toBe('invalid-review-state-transition')
  })

  it('returns not-found responses for missing review contexts', async () => {
    const { api } = createFixture()

    const response = await api.getReviewContext(
      new Request('https://railway.local/api/security/reviews/apps/missing.app'),
      { appId: 'missing.app' }
    )
    const body = await readJson(response)

    expect(response.status).toBe(404)
    expect(body.ok).toBe(false)
    expect(body.error.domain).toBe('security')
    expect(body.error.code).toBe('app-not-found')
  })
})
