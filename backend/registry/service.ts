import { type AppManifest, type ContractValidationFailure, validateAppManifest } from '@shared/contracts/v1'
import type { OAuthProviderConfig } from '../auth/types'
import { failureResult } from '../errors'
import {
  type AppReviewState,
  type AppSubmissionPackage,
  type AppSubmissionValidationFinding,
  buildLegacyPlatformSeedSubmissionPackage,
  buildPermissionSanityReport,
  normalizeSubmittedManifestForPlatformReview,
  reviewOAuthScopeSanity,
  validateAppSubmissionPackage,
  validateDomainOriginSubmission,
} from '../security'
import type { AppRegistryRepository } from './repository'
import type {
  AppRegistryFailure,
  AppRegistryRecord,
  AppRegistryResult,
  AppRegistryVersionRecord,
  GetRegisteredAppRequest,
  ListRegisteredAppsRequest,
  RegisterAppRequest,
} from './types'

export interface AppRegistryServiceOptions {
  now?: () => string
}

export class AppRegistryService {
  private readonly now: () => string

  constructor(
    private readonly repository: AppRegistryRepository,
    options: AppRegistryServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  async registerApp(request: RegisterAppRequest): Promise<AppRegistryResult<AppRegistryRecord>> {
    const normalized = this.normalizeRegistrationRequest(request)
    if (!normalized.ok) {
      return normalized
    }

    const manifest = normalized.value.manifest
    const submission = normalized.value.submission
    const normalizedCategory = submission.category
    const validationFindings = normalized.value.validationFindings

    const existingByAppId = await this.repository.getByAppId(manifest.appId)
    const existingBySlug = await this.repository.getBySlug(manifest.slug)
    if (existingBySlug && existingBySlug.appId !== manifest.appId) {
      return this.failure(
        'slug-conflict',
        `App slug "${manifest.slug}" is already registered to appId "${existingBySlug.appId}".`
      )
    }

    if (!existingByAppId) {
      const record = this.createRecord(manifest, submission, validationFindings)
      await this.repository.save(record)
      return { ok: true, value: record }
    }

    if (existingByAppId.slug !== manifest.slug) {
      return this.failure(
        'slug-conflict',
        `App "${manifest.appId}" is already registered with slug "${existingByAppId.slug}".`
      )
    }

    const existingVersion = existingByAppId.versions.find((version) => version.appVersion === manifest.appVersion)
    if (existingVersion) {
      if (JSON.stringify(existingVersion.manifest) !== JSON.stringify(manifest)) {
        return this.failure(
          'version-conflict',
          `App version "${manifest.appVersion}" is already registered with different manifest contents.`
        )
      }

      const record = {
        ...existingByAppId,
        category: normalizedCategory,
        reviewState: existingByAppId.currentVersion.review.reviewState,
        currentVersion: {
          ...existingByAppId.currentVersion,
          submission,
          review: {
            ...existingByAppId.currentVersion.review,
            validationFindings,
          },
        },
      }
      await this.repository.save(record)
      return { ok: true, value: record }
    }

    const nextVersion = this.createVersionRecord(manifest, submission, validationFindings)
    const updatedRecord: AppRegistryRecord = {
      ...existingByAppId,
      name: manifest.name,
      category: normalizedCategory,
      distribution: manifest.distribution,
      authType: manifest.authType,
      reviewStatus: nextVersion.review.runtimeReviewStatus,
      reviewState: nextVersion.review.reviewState,
      currentVersionId: nextVersion.appVersionId,
      currentVersion: nextVersion,
      versions: [...existingByAppId.versions, nextVersion],
      updatedAt: nextVersion.createdAt,
    }

    await this.repository.save(updatedRecord)
    return { ok: true, value: updatedRecord }
  }

  async listApps(request: ListRegisteredAppsRequest = {}): Promise<AppRegistryRecord[]> {
    const records = await this.repository.list()

    return records
      .filter((record) => {
        if (request.approvedOnly && record.reviewStatus !== 'approved') {
          return false
        }

        if (request.distribution && record.distribution !== request.distribution) {
          return false
        }

        if (request.authType && record.authType !== request.authType) {
          return false
        }

        return true
      })
      .sort((left, right) => left.slug.localeCompare(right.slug))
  }

  async getApp(request: GetRegisteredAppRequest): Promise<AppRegistryResult<AppRegistryRecord>> {
    const record = request.appId
      ? await this.repository.getByAppId(request.appId)
      : request.slug
        ? await this.repository.getBySlug(request.slug)
        : undefined

    if (!record) {
      return this.failure('not-found', 'No registered app matched the provided identifier.')
    }

    if (request.approvedOnly && record.reviewStatus !== 'approved') {
      return this.failure('not-approved', `App "${record.appId}" is not approved for registry exposure.`)
    }

    return { ok: true, value: record }
  }

  private createRecord(
    manifest: AppManifest,
    submission: AppSubmissionPackage,
    validationFindings: AppSubmissionValidationFinding[]
  ): AppRegistryRecord {
    const version = this.createVersionRecord(manifest, submission, validationFindings)

    return {
      appId: manifest.appId,
      slug: manifest.slug,
      name: manifest.name,
      category: submission.category,
      distribution: manifest.distribution,
      authType: manifest.authType,
      reviewStatus: version.review.runtimeReviewStatus,
      reviewState: version.review.reviewState,
      currentVersionId: version.appVersionId,
      currentVersion: version,
      versions: [version],
      createdAt: version.createdAt,
      updatedAt: version.createdAt,
    }
  }

  private createVersionRecord(
    manifest: AppManifest,
    submission: AppSubmissionPackage,
    validationFindings: AppSubmissionValidationFinding[]
  ): AppRegistryVersionRecord {
    const createdAt = this.now()

    return {
      appVersionId: this.buildAppVersionId(manifest),
      appVersion: manifest.appVersion,
      manifest,
      submission,
      review: {
        reviewState: this.initialReviewStateForSubmission(submission),
        runtimeReviewStatus: manifest.safetyMetadata.reviewStatus,
        submittedAt: submission.submittedAt ?? createdAt,
        validationFindings,
      },
      createdAt,
    }
  }

  private buildAppVersionId(manifest: AppManifest): string {
    return `${manifest.appId}@${manifest.appVersion}`
  }

  private normalizeCategory(category: string | undefined): string | undefined {
    const normalized = category?.trim()
    return normalized && normalized.length > 0 ? normalized : undefined
  }

  private normalizeRegistrationRequest(request: RegisterAppRequest): AppRegistryResult<{
    manifest: AppManifest
    submission: AppSubmissionPackage
    validationFindings: AppSubmissionValidationFinding[]
  }> {
    if (request.submission !== undefined) {
      const submissionValidation = validateAppSubmissionPackage(request.submission)
      if (!submissionValidation.success) {
        return this.failure(
          'invalid-submission-package',
          'App submission package validation failed.',
          submissionValidation.errors
        )
      }

      const normalizedManifest = normalizeSubmittedManifestForPlatformReview(submissionValidation.data.manifest)
      const submission = {
        ...submissionValidation.data,
        manifest: normalizedManifest,
        submittedAt: submissionValidation.data.submittedAt ?? this.now(),
      }
      const validationFindings = this.validateSubmission(submission)
      const blockingFindings = validationFindings.filter((finding) => finding.severity === 'error')
      if (blockingFindings.length > 0) {
        return this.failure(
          'invalid-submission-package',
          'App submission package failed deterministic review checks.',
          blockingFindings.map((finding) => finding.message)
        )
      }

      return {
        ok: true,
        value: {
          manifest: normalizedManifest,
          submission,
          validationFindings,
        },
      }
    }

    const validation = validateAppManifest(request.manifest)
    if (!validation.success) {
      return this.invalidManifest(validation)
    }

    const normalizedCategory = this.normalizeCategory(request.category)
    if (!normalizedCategory) {
      return this.failure('invalid-category', 'App registration requires a non-empty category.')
    }

    const registrationSource = request.registrationSource ?? 'platform-seed'
    const manifest =
      registrationSource === 'platform-seed'
        ? validation.data
        : normalizeSubmittedManifestForPlatformReview(validation.data)
    const submission =
      registrationSource === 'platform-seed'
        ? buildLegacyPlatformSeedSubmissionPackage(manifest, normalizedCategory, this.now())
        : buildLegacyPlatformSeedSubmissionPackage(
            normalizeSubmittedManifestForPlatformReview(validation.data),
            normalizedCategory,
            this.now()
          )

    return {
      ok: true,
      value: {
        manifest,
        submission,
        validationFindings: [],
      },
    }
  }

  private initialReviewStateForSubmission(submission: AppSubmissionPackage): AppReviewState {
    if (submission.metadata?.source === 'platform-seed') {
      return submission.manifest.safetyMetadata.reviewStatus === 'approved' ? 'approved-production' : 'submitted'
    }

    return 'submitted'
  }

  private validateSubmission(submission: AppSubmissionPackage): AppSubmissionValidationFinding[] {
    const declaredOrigins = submission.domains.filter((value) => /^https?:\/\//i.test(value))
    const declaredDomains = submission.domains.filter((value) => !/^https?:\/\//i.test(value))

    const domainOriginReport = validateDomainOriginSubmission({
      appId: submission.manifest.appId,
      appVersionId: submission.manifest.appVersion,
      entryUrl: submission.manifest.uiEmbedConfig.entryUrl,
      targetOrigin: submission.manifest.uiEmbedConfig.targetOrigin,
      allowedOrigins: submission.manifest.allowedOrigins,
      declaredOrigins,
      declaredDomains,
    })

    const permissionReport = buildPermissionSanityReport(submission.manifest)
    const oauthScopeReport =
      submission.manifest.authType === 'oauth2' && submission.manifest.authConfig
        ? reviewOAuthScopeSanity({
            manifest: submission.manifest,
            provider: this.buildProviderConfigFromSubmission(submission),
            requestedScopes: submission.requestedOAuthScopes,
          })
        : undefined

    return [
      ...domainOriginReport.issues.map((issue) => ({
        scope: 'domain-origin' as const,
        code: issue.code,
        severity: 'error' as const,
        message: issue.message,
        field: issue.field,
      })),
      ...permissionReport.findings.map((finding) => ({
        scope: 'permission' as const,
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
        field: 'manifest.permissions',
      })),
      ...(oauthScopeReport?.issues.map((issue) => ({
        scope: 'oauth-scope' as const,
        code: issue.code,
        severity: issue.severity === 'warn' ? 'warning' as const : issue.severity,
        message: issue.message,
        field: 'manifest.authConfig.scopes',
      })) ?? []),
    ]
  }

  private buildProviderConfigFromSubmission(submission: AppSubmissionPackage): OAuthProviderConfig {
    const authConfig = submission.manifest.authConfig
    if (!authConfig) {
      throw new Error('OAuth provider config is required for OAuth scope validation.')
    }

    return {
      provider: authConfig.provider,
      authorizationUrl: authConfig.authorizationUrl,
      tokenUrl: authConfig.tokenUrl,
      clientId: 'submission-review-client',
      redirectUri: submission.stagingUrl,
      defaultScopes: authConfig.scopes,
      pkce: authConfig.pkceRequired,
    }
  }

  private invalidManifest(validation: ContractValidationFailure): AppRegistryFailure {
    return this.failure(
      'invalid-manifest',
      'App manifest validation failed.',
      validation.errors
    )
  }

  private failure(
    code: AppRegistryFailure['code'],
    message: string,
    details?: string[]
  ): AppRegistryFailure {
    return failureResult('registry', code, message, { details })
  }
}
