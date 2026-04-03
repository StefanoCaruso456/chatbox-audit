import type { AppManifest } from '@shared/contracts/v1'
import { exampleInternalChessManifest, examplePublicFlashcardsManifest } from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { InMemoryAuthRepository } from '../auth/repository'
import { PlatformUserProfileService } from '../auth/service'
import type { AppRegistryRecord, AppRegistryVersionRecord } from '../registry/types'
import { InMemoryAppSecurityRepository } from './repository'
import { AppSecurityService } from './service'

function makeRegistryRecord(manifest = exampleInternalChessManifest, category = 'games'): AppRegistryRecord {
  const version: AppRegistryVersionRecord = {
    appVersionId: `${manifest.appId}@${manifest.appVersion}`,
    appVersion: manifest.appVersion,
    manifest,
    createdAt: '2026-04-01T12:00:00.000Z',
  }

  return {
    appId: manifest.appId,
    slug: manifest.slug,
    name: manifest.name,
    category,
    distribution: manifest.distribution,
    authType: manifest.authType,
    reviewStatus: manifest.safetyMetadata.reviewStatus,
    currentVersionId: version.appVersionId,
    currentVersion: version,
    versions: [version],
    createdAt: version.createdAt,
    updatedAt: version.createdAt,
  }
}

function withReviewStatus(manifest: AppManifest, reviewStatus: AppManifest['safetyMetadata']['reviewStatus']): AppManifest {
  return {
    ...manifest,
    safetyMetadata: {
      ...manifest.safetyMetadata,
      reviewStatus,
    },
  }
}

describe('AppSecurityService', () => {
  it('records reviews, syncs app review status, and keeps the latest decision deterministic', async () => {
    const repository = new InMemoryAppSecurityRepository()
    const service = new AppSecurityService(repository, {
      now: () => '2026-04-01T12:00:00.000Z',
    })

    const pending = await service.recordReview({
      appId: 'chess.internal',
      appVersionId: '1.0.0',
      reviewedByUserId: 'reviewer.platform',
      reviewStatus: 'pending',
      ageRating: 'all-ages',
      dataAccessLevel: 'minimal',
      permissionsSnapshot: ['session:read', 'session:write', 'tool:invoke'],
      notes: 'Initial review queued.',
    })

    expect(pending.ok).toBe(true)
    if (!pending.ok) {
      return
    }

    expect(pending.value.reviewStatus).toBe('pending')

    const approved = await service.recordReview({
      appId: 'chess.internal',
      appVersionId: '1.0.0',
      reviewedByUserId: 'reviewer.platform',
      reviewStatus: 'approved',
      ageRating: 'all-ages',
      dataAccessLevel: 'minimal',
      permissionsSnapshot: ['session:read', 'session:write', 'tool:invoke'],
      notes: 'Approved for classroom launch.',
    })

    expect(approved.ok).toBe(true)
    if (!approved.ok) {
      return
    }

    const synced = await service.syncAppReviewStatus({
      app: makeRegistryRecord(exampleInternalChessManifest),
      review: approved.value,
    })

    expect(synced.ok).toBe(true)
    if (!synced.ok) {
      return
    }

    expect(synced.value.reviewStatus).toBe('approved')
    expect(synced.value.currentVersion.manifest.safetyMetadata.reviewStatus).toBe('approved')
    expect(synced.value.currentVersion.manifest.safetyMetadata.reviewedAt).toBe('2026-04-01T12:00:00.000Z')
  })

  it('rejects review transitions after a final decision has been recorded', async () => {
    const repository = new InMemoryAppSecurityRepository()
    const service = new AppSecurityService(repository, {
      now: () => '2026-04-01T12:00:00.000Z',
    })

    await service.recordReview({
      appId: 'flashcards.public',
      appVersionId: '1.0.0',
      reviewedByUserId: 'reviewer.platform',
      reviewStatus: 'approved',
      ageRating: 'all-ages',
      dataAccessLevel: 'minimal',
      permissionsSnapshot: ['tool:invoke'],
    })

    const invalid = await service.recordReview({
      appId: 'flashcards.public',
      appVersionId: '1.0.0',
      reviewedByUserId: 'reviewer.platform',
      reviewStatus: 'pending',
      ageRating: 'all-ages',
      dataAccessLevel: 'minimal',
      permissionsSnapshot: ['tool:invoke'],
    })

    expect(invalid.ok).toBe(false)
    if (invalid.ok) {
      return
    }

    expect(invalid.code).toBe('invalid-review-transition')
  })

  it('evaluates launchability only for approved apps and returns security policy context', async () => {
    const repository = new InMemoryAppSecurityRepository()
    const service = new AppSecurityService(repository, {
      now: () => '2026-04-01T12:00:00.000Z',
    })

    const pendingApp = makeRegistryRecord(withReviewStatus(examplePublicFlashcardsManifest, 'pending'))
    const pendingLaunch = await service.evaluateLaunchability({
      app: pendingApp,
      clientOrigin: 'https://chatbridge.app',
      backendOrigin: 'https://api.chatbridge.app',
    })

    expect(pendingLaunch.ok).toBe(false)
    if (pendingLaunch.ok) {
      return
    }

    expect(pendingLaunch.code).toBe('app-not-launchable')

    const approvedReview = await service.recordReview({
      appId: 'flashcards.public',
      appVersionId: '1.0.0',
      reviewedByUserId: 'reviewer.platform',
      reviewStatus: 'approved',
      ageRating: 'all-ages',
      dataAccessLevel: 'minimal',
      permissionsSnapshot: ['tool:invoke'],
    })

    expect(approvedReview.ok).toBe(true)
    if (!approvedReview.ok) {
      return
    }

    const approvedApp = makeRegistryRecord(withReviewStatus(examplePublicFlashcardsManifest, 'approved'), 'flashcards')

    const launch = await service.evaluateLaunchability({
      app: approvedApp,
      requestedOrigin: 'https://flashcards.chatbridge.dev',
      clientOrigin: 'https://chatbridge.app',
      backendOrigin: 'https://api.chatbridge.app',
    })

    expect(launch.ok).toBe(true)
    if (!launch.ok) {
      return
    }

    expect(launch.value.launchable).toBe(true)
    expect(launch.value.iframePolicy.targetOrigin).toBe('https://flashcards.chatbridge.dev')
    expect(launch.value.platformSecurity.csp.headerValue).toContain("frame-src")
    expect(launch.value.platformSecurity.headers['content-security-policy']).toBeDefined()
  })

  it('enforces stored reviewer roles before an app approval decision can be recorded', async () => {
    const securityRepository = new InMemoryAppSecurityRepository()
    const authRepository = new InMemoryAuthRepository()
    const profileService = new PlatformUserProfileService(authRepository, {
      now: () => '2026-04-01T12:00:00.000Z',
    })

    await profileService.upsertUserProfile({
      userId: 'teacher.user',
      displayName: 'Teacher User',
      role: 'teacher',
    })
    await profileService.upsertUserProfile({
      userId: 'school.admin',
      displayName: 'School Admin',
      role: 'school_admin',
    })

    const service = new AppSecurityService(securityRepository, {
      now: () => '2026-04-01T12:00:00.000Z',
      getReviewerAccess: (userId) => profileService.getReviewerAccessContext(userId),
    })

    const teacherDecision = await service.recordReview({
      appId: 'flashcards.public',
      appVersionId: '1.0.0',
      reviewedByUserId: 'teacher.user',
      reviewStatus: 'approved',
      ageRating: 'all-ages',
      dataAccessLevel: 'minimal',
      permissionsSnapshot: ['tool:invoke'],
    })

    expect(teacherDecision.ok).toBe(false)
    if (teacherDecision.ok) {
      return
    }

    expect(teacherDecision.code).toBe('reviewer-not-authorized')

    const adminDecision = await service.recordReview({
      appId: 'flashcards.public',
      appVersionId: '1.0.0',
      reviewedByUserId: 'school.admin',
      reviewStatus: 'approved',
      ageRating: 'all-ages',
      dataAccessLevel: 'minimal',
      permissionsSnapshot: ['tool:invoke'],
    })

    expect(adminDecision.ok).toBe(true)
    if (!adminDecision.ok) {
      return
    }

    expect(adminDecision.value.reviewedByRole).toBe('school_admin')
  })
})
