import type { AppRegistryRecord } from './types'

export interface AppRegistryRepository {
  getByAppId(appId: string): Promise<AppRegistryRecord | undefined>
  getBySlug(slug: string): Promise<AppRegistryRecord | undefined>
  list(): Promise<AppRegistryRecord[]>
  save(record: AppRegistryRecord): Promise<void>
}

export class InMemoryAppRegistryRepository implements AppRegistryRepository {
  private readonly recordsByAppId = new Map<string, AppRegistryRecord>()

  async getByAppId(appId: string): Promise<AppRegistryRecord | undefined> {
    const record = this.recordsByAppId.get(appId)
    return record ? structuredClone(record) : undefined
  }

  async getBySlug(slug: string): Promise<AppRegistryRecord | undefined> {
    const record = Array.from(this.recordsByAppId.values()).find((candidate) => candidate.slug === slug)
    return record ? structuredClone(record) : undefined
  }

  async list(): Promise<AppRegistryRecord[]> {
    return Array.from(this.recordsByAppId.values()).map((record) => structuredClone(record))
  }

  async save(record: AppRegistryRecord): Promise<void> {
    this.recordsByAppId.set(record.appId, structuredClone(record))
  }
}
