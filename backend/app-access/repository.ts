import { Pool, type PoolConfig } from 'pg'
import type {
  AppAccessRequestRecord,
  AppAccessRequestStatus,
  CreateAppAccessRequestInput,
  DecideAppAccessRequestInput,
} from './types'

export interface AppAccessRepository {
  createAppAccessRequest(input: CreateAppAccessRequestInput & { appAccessRequestId: string; now: string }): Promise<AppAccessRequestRecord>
  updateAppAccessRequest(input: AppAccessRequestRecord): Promise<void>
  getAppAccessRequestById(appAccessRequestId: string): Promise<AppAccessRequestRecord | undefined>
  getLatestAppAccessRequestForStudentApp(studentUserId: string, appId: string): Promise<AppAccessRequestRecord | undefined>
  listAppAccessRequestsByStatus(status: AppAccessRequestStatus): Promise<AppAccessRequestRecord[]>
}

export class InMemoryAppAccessRepository implements AppAccessRepository {
  private readonly requestsById = new Map<string, AppAccessRequestRecord>()
  private readonly requestIdsByStudentApp = new Map<string, string[]>()

  async createAppAccessRequest(
    input: CreateAppAccessRequestInput & { appAccessRequestId: string; now: string }
  ): Promise<AppAccessRequestRecord> {
    const record: AppAccessRequestRecord = {
      appAccessRequestId: input.appAccessRequestId,
      appId: input.appId,
      appName: input.appName,
      studentUserId: input.studentUserId,
      studentDisplayName: input.studentDisplayName,
      studentEmail: input.studentEmail,
      studentRole: input.studentRole,
      status: 'pending',
      decisionReason: null,
      decidedByUserId: null,
      decidedByDisplayName: null,
      requestedAt: input.now,
      decidedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
      metadata: structuredClone(input.metadata ?? {}),
    }
    this.requestsById.set(record.appAccessRequestId, structuredClone(record))
    const key = this.getStudentAppKey(record.studentUserId, record.appId)
    const ids = this.requestIdsByStudentApp.get(key) ?? []
    ids.unshift(record.appAccessRequestId)
    this.requestIdsByStudentApp.set(key, ids)
    return structuredClone(record)
  }

  async updateAppAccessRequest(input: AppAccessRequestRecord): Promise<void> {
    this.requestsById.set(input.appAccessRequestId, structuredClone(input))
  }

  async getAppAccessRequestById(appAccessRequestId: string): Promise<AppAccessRequestRecord | undefined> {
    const record = this.requestsById.get(appAccessRequestId)
    return record ? structuredClone(record) : undefined
  }

  async getLatestAppAccessRequestForStudentApp(
    studentUserId: string,
    appId: string
  ): Promise<AppAccessRequestRecord | undefined> {
    const ids = this.requestIdsByStudentApp.get(this.getStudentAppKey(studentUserId, appId)) ?? []
    for (const id of ids) {
      const record = this.requestsById.get(id)
      if (record) {
        return structuredClone(record)
      }
    }
    return undefined
  }

  async listAppAccessRequestsByStatus(status: AppAccessRequestStatus): Promise<AppAccessRequestRecord[]> {
    return [...this.requestsById.values()]
      .filter((record) => record.status === status)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map((record) => structuredClone(record))
  }

  private getStudentAppKey(studentUserId: string, appId: string) {
    return `${studentUserId}::${appId}`
  }
}

interface AppAccessRequestRow {
  app_access_request_id: string
  app_id: string
  app_name: string
  student_user_id: string
  student_display_name: string
  student_email: string | null
  student_role: AppAccessRequestRecord['studentRole']
  status: AppAccessRequestStatus
  decision_reason: string | null
  decided_by_user_id: string | null
  decided_by_display_name: string | null
  requested_at: string | Date
  decided_at: string | Date | null
  created_at: string | Date
  updated_at: string | Date
  metadata: Record<string, unknown>
}

export class PostgresAppAccessRepository implements AppAccessRepository {
  constructor(private readonly pool: Pool) {}

  async createAppAccessRequest(
    input: CreateAppAccessRequestInput & { appAccessRequestId: string; now: string }
  ): Promise<AppAccessRequestRecord> {
    const record: AppAccessRequestRecord = {
      appAccessRequestId: input.appAccessRequestId,
      appId: input.appId,
      appName: input.appName,
      studentUserId: input.studentUserId,
      studentDisplayName: input.studentDisplayName,
      studentEmail: input.studentEmail,
      studentRole: input.studentRole,
      status: 'pending',
      decisionReason: null,
      decidedByUserId: null,
      decidedByDisplayName: null,
      requestedAt: input.now,
      decidedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
      metadata: structuredClone(input.metadata ?? {}),
    }
    await this.updateAppAccessRequest(record)
    return record
  }

  async updateAppAccessRequest(input: AppAccessRequestRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO app_access_requests (
        app_access_request_id,
        app_id,
        app_name,
        student_user_id,
        student_display_name,
        student_email,
        student_role,
        status,
        decision_reason,
        decided_by_user_id,
        decided_by_display_name,
        requested_at,
        decided_at,
        created_at,
        updated_at,
        metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12::timestamptz, $13::timestamptz, $14::timestamptz, $15::timestamptz, $16::jsonb
      )
      ON CONFLICT (app_access_request_id) DO UPDATE
      SET
        app_id = EXCLUDED.app_id,
        app_name = EXCLUDED.app_name,
        student_user_id = EXCLUDED.student_user_id,
        student_display_name = EXCLUDED.student_display_name,
        student_email = EXCLUDED.student_email,
        student_role = EXCLUDED.student_role,
        status = EXCLUDED.status,
        decision_reason = EXCLUDED.decision_reason,
        decided_by_user_id = EXCLUDED.decided_by_user_id,
        decided_by_display_name = EXCLUDED.decided_by_display_name,
        requested_at = EXCLUDED.requested_at,
        decided_at = EXCLUDED.decided_at,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        metadata = EXCLUDED.metadata`,
      [
        input.appAccessRequestId,
        input.appId,
        input.appName,
        input.studentUserId,
        input.studentDisplayName,
        input.studentEmail,
        input.studentRole,
        input.status,
        input.decisionReason,
        input.decidedByUserId,
        input.decidedByDisplayName,
        input.requestedAt,
        input.decidedAt,
        input.createdAt,
        input.updatedAt,
        JSON.stringify(input.metadata ?? {}),
      ]
    )
  }

  async getAppAccessRequestById(appAccessRequestId: string): Promise<AppAccessRequestRecord | undefined> {
    const result = await this.pool.query<AppAccessRequestRow>(
      `${selectAppAccessRequestSql()} WHERE app_access_request_id = $1`,
      [appAccessRequestId]
    )
    return result.rows[0] ? mapAppAccessRequestRow(result.rows[0]) : undefined
  }

  async getLatestAppAccessRequestForStudentApp(
    studentUserId: string,
    appId: string
  ): Promise<AppAccessRequestRecord | undefined> {
    const result = await this.pool.query<AppAccessRequestRow>(
      `${selectAppAccessRequestSql()} WHERE student_user_id = $1 AND app_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [studentUserId, appId]
    )
    return result.rows[0] ? mapAppAccessRequestRow(result.rows[0]) : undefined
  }

  async listAppAccessRequestsByStatus(status: AppAccessRequestStatus): Promise<AppAccessRequestRecord[]> {
    const result = await this.pool.query<AppAccessRequestRow>(
      `${selectAppAccessRequestSql()} WHERE status = $1 ORDER BY updated_at DESC`,
      [status]
    )
    return result.rows.map(mapAppAccessRequestRow)
  }
}

let cachedRepository: AppAccessRepository | null = null
let cachedRepositoryKey: string | null = null

export function createRuntimeAppAccessRepository(
  env: Record<string, string | undefined> = process.env
): AppAccessRepository {
  const databaseUrl = normalizeNonEmptyString(env.DATABASE_URL)
  if (!databaseUrl) {
    return new InMemoryAppAccessRepository()
  }

  const cacheKey = `${databaseUrl}|${env.TUTORMEAI_DATABASE_SSL ?? ''}|${env.PGSSLMODE ?? ''}`
  if (cachedRepository && cachedRepositoryKey === cacheKey) {
    return cachedRepository
  }

  const poolConfig: PoolConfig = {
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  }

  if (shouldUseSsl(env, databaseUrl)) {
    poolConfig.ssl = {
      rejectUnauthorized: false,
    }
  }

  cachedRepository = new PostgresAppAccessRepository(new Pool(poolConfig))
  cachedRepositoryKey = cacheKey
  return cachedRepository
}

function selectAppAccessRequestSql() {
  return `SELECT
    app_access_request_id,
    app_id,
    app_name,
    student_user_id,
    student_display_name,
    student_email,
    student_role,
    status,
    decision_reason,
    decided_by_user_id,
    decided_by_display_name,
    requested_at,
    decided_at,
    created_at,
    updated_at,
    metadata
  FROM app_access_requests`
}

function mapAppAccessRequestRow(row: AppAccessRequestRow): AppAccessRequestRecord {
  return {
    appAccessRequestId: row.app_access_request_id,
    appId: row.app_id,
    appName: row.app_name,
    studentUserId: row.student_user_id,
    studentDisplayName: row.student_display_name,
    studentEmail: row.student_email,
    studentRole: row.student_role,
    status: row.status,
    decisionReason: row.decision_reason,
    decidedByUserId: row.decided_by_user_id,
    decidedByDisplayName: row.decided_by_display_name,
    requestedAt: toIsoString(row.requested_at),
    decidedAt: toIsoString(row.decided_at),
    createdAt: toIsoString(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date(0).toISOString(),
    metadata: structuredClone(row.metadata ?? {}),
  }
}

function normalizeNonEmptyString(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function shouldUseSsl(env: Record<string, string | undefined>, databaseUrl: string) {
  const explicit = normalizeNonEmptyString(env.TUTORMEAI_DATABASE_SSL) ?? normalizeNonEmptyString(env.PGSSLMODE)
  if (explicit) {
    return ['1', 'true', 'require', 'prefer'].includes(explicit.toLowerCase())
  }
  return !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1')
}

function toIsoString(value: string | Date | null) {
  if (!value) {
    return null
  }
  return value instanceof Date ? value.toISOString() : value
}
