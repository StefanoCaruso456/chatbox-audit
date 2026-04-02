import { type AppManifest, type ContractValidationFailure, validateAppManifest } from '@shared/contracts/v1'
import { failureResult } from '../errors'
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
    const validation = validateAppManifest(request.manifest)
    if (!validation.success) {
      return this.invalidManifest(validation)
    }

    const manifest = validation.data
    const normalizedCategory = this.normalizeCategory(request.category)
    if (!normalizedCategory) {
      return this.failure('invalid-category', 'App registration requires a non-empty category.')
    }

    const existingByAppId = await this.repository.getByAppId(manifest.appId)
    const existingBySlug = await this.repository.getBySlug(manifest.slug)
    if (existingBySlug && existingBySlug.appId !== manifest.appId) {
      return this.failure(
        'slug-conflict',
        `App slug "${manifest.slug}" is already registered to appId "${existingBySlug.appId}".`
      )
    }

    if (!existingByAppId) {
      const record = this.createRecord(manifest, normalizedCategory)
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
      }
      await this.repository.save(record)
      return { ok: true, value: record }
    }

    const nextVersion = this.createVersionRecord(manifest)
    const updatedRecord: AppRegistryRecord = {
      ...existingByAppId,
      name: manifest.name,
      category: normalizedCategory,
      distribution: manifest.distribution,
      authType: manifest.authType,
      reviewStatus: manifest.safetyMetadata.reviewStatus,
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

  private createRecord(manifest: AppManifest, category: string): AppRegistryRecord {
    const version = this.createVersionRecord(manifest)

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

  private createVersionRecord(manifest: AppManifest): AppRegistryVersionRecord {
    return {
      appVersionId: this.buildAppVersionId(manifest),
      appVersion: manifest.appVersion,
      manifest,
      createdAt: this.now(),
    }
  }

  private buildAppVersionId(manifest: AppManifest): string {
    return `${manifest.appId}@${manifest.appVersion}`
  }

  private normalizeCategory(category: string): string | undefined {
    const normalized = category.trim()
    return normalized.length > 0 ? normalized : undefined
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
