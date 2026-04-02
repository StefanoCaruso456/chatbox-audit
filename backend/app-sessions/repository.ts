import type { AppSessionRecord } from './types'

export interface AppSessionRepository {
  getByAppSessionId(appSessionId: string): Promise<AppSessionRecord | undefined>
  list(): Promise<AppSessionRecord[]>
  save(session: AppSessionRecord): Promise<void>
}

export class InMemoryAppSessionRepository implements AppSessionRepository {
  private readonly sessionsById = new Map<string, AppSessionRecord>()

  async getByAppSessionId(appSessionId: string): Promise<AppSessionRecord | undefined> {
    const session = this.sessionsById.get(appSessionId)
    return session ? structuredClone(session) : undefined
  }

  async list(): Promise<AppSessionRecord[]> {
    return Array.from(this.sessionsById.values()).map((session) => structuredClone(session))
  }

  async save(session: AppSessionRecord): Promise<void> {
    this.sessionsById.set(session.appSessionId, structuredClone(session))
  }
}
