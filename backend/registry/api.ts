import { AppAuthTypeSchema, AppDistributionSchema, IdentifierSchema, SlugSchema } from '@shared/contracts/v1'
import { z } from 'zod'
import { failureResult, toApiErrorBody } from '../errors'
import type { AppRegistryService } from './service'
import type { AppRegistryErrorCode, AppRegistryFailure, AppRegistryRecord } from './types'

const BooleanQuerySchema = z.enum(['true', 'false']).transform((value) => value === 'true')

const RegisterAppBodySchema = z.object({
  manifest: z.unknown(),
  category: z.string(),
})

const ListAppsQuerySchema = z.object({
  approvedOnly: BooleanQuerySchema.optional(),
  distribution: AppDistributionSchema.optional(),
  authType: AppAuthTypeSchema.optional(),
})

const GetAppQuerySchema = z.object({
  approvedOnly: BooleanQuerySchema.optional(),
  slug: SlugSchema.optional(),
})

const GetAppParamsSchema = z.object({
  appId: IdentifierSchema.optional(),
})

export const AppRegistryApiRoutes = {
  collection: '/api/registry/apps',
  byAppId: '/api/registry/apps/:appId',
} as const

export type AppRegistryApiErrorCode =
  | AppRegistryErrorCode
  | 'invalid-json'
  | 'invalid-query'
  | 'invalid-route-params'
  | 'unapproved-read-disabled'

export interface AppRegistryApiSuccessBody<T> {
  ok: true
  data: T
}

export interface AppRegistryApiErrorBody {
  ok: false
  error: {
    domain: 'api' | 'registry'
    code: AppRegistryApiErrorCode
    message: string
    details?: string[]
    retryable?: boolean
  }
}

export interface AppRegistryApiOptions {
  allowUnapprovedReads?: boolean
  preserveSubmittedReviewStatus?: boolean
}

export interface GetAppRouteParams {
  appId?: string
}

export function createAppRegistryApi(service: AppRegistryService, options: AppRegistryApiOptions = {}) {
  const allowUnapprovedReads = options.allowUnapprovedReads ?? false
  const preserveSubmittedReviewStatus = options.preserveSubmittedReviewStatus ?? false

  return {
    register: async (request: Request): Promise<Response> => {
      const parsedBody = await parseJsonBody(request, RegisterAppBodySchema)
      if (!parsedBody.ok) {
        return parsedBody.response
      }

      const manifest = preserveSubmittedReviewStatus
        ? parsedBody.data.manifest
        : coerceManifestToPendingReview(parsedBody.data.manifest)

      const result = await service.registerApp({
        manifest,
        category: parsedBody.data.category,
      })

      return toRegistryResponse(result, 201)
    },

    list: async (request: Request): Promise<Response> => {
      const url = new URL(request.url)
      const parsedQuery = ListAppsQuerySchema.safeParse(searchParamsToObject(url.searchParams))
      if (!parsedQuery.success) {
        return jsonError(400, 'invalid-query', 'Registry list query is invalid.', parsedQuery.error.issues.map((issue) => issue.message))
      }

      const approvedOnly = parsedQuery.data.approvedOnly ?? true
      if (!approvedOnly && !allowUnapprovedReads) {
        return jsonError(403, 'unapproved-read-disabled', 'Unapproved registry exposure is disabled on this API surface.')
      }

      const apps = await service.listApps({
        approvedOnly,
        distribution: parsedQuery.data.distribution,
        authType: parsedQuery.data.authType,
      })

      return jsonSuccess(200, { apps })
    },

    get: async (request: Request, params: GetAppRouteParams = {}): Promise<Response> => {
      const url = new URL(request.url)
      const parsedQuery = GetAppQuerySchema.safeParse(searchParamsToObject(url.searchParams))
      if (!parsedQuery.success) {
        return jsonError(400, 'invalid-query', 'Registry lookup query is invalid.', parsedQuery.error.issues.map((issue) => issue.message))
      }

      const parsedParams = GetAppParamsSchema.safeParse(params)
      if (!parsedParams.success) {
        return jsonError(
          400,
          'invalid-route-params',
          'Registry lookup route params are invalid.',
          parsedParams.error.issues.map((issue) => issue.message)
        )
      }

      const approvedOnly = parsedQuery.data.approvedOnly ?? true
      if (!approvedOnly && !allowUnapprovedReads) {
        return jsonError(403, 'unapproved-read-disabled', 'Unapproved registry exposure is disabled on this API surface.')
      }

      const appId = parsedParams.data.appId
      const slug = parsedQuery.data.slug

      if (!appId && !slug) {
        return jsonError(400, 'invalid-query', 'Registry lookup requires either an appId route param or a slug query param.')
      }

      if (appId && slug) {
        return jsonError(400, 'invalid-query', 'Registry lookup must use either appId or slug, not both.')
      }

      const result = await service.getApp({
        appId,
        slug,
        approvedOnly,
      })

      return toRegistryResponse(result, 200)
    },
  }
}

async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return {
      ok: false,
      response: jsonError(400, 'invalid-json', 'Request body must be valid JSON.'),
    }
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(400, 'invalid-json', 'Request body shape is invalid.', parsed.error.issues.map((issue) => issue.message)),
    }
  }

  return {
    ok: true,
    data: parsed.data,
  }
}

function searchParamsToObject(searchParams: URLSearchParams): Record<string, string> {
  return Object.fromEntries(searchParams.entries())
}

function coerceManifestToPendingReview(manifest: unknown): unknown {
  if (!manifest || typeof manifest !== 'object') {
    return manifest
  }

  const manifestRecord = manifest as Record<string, unknown>
  const safetyMetadata =
    manifestRecord.safetyMetadata && typeof manifestRecord.safetyMetadata === 'object'
      ? (manifestRecord.safetyMetadata as Record<string, unknown>)
      : {}

  return {
    ...manifestRecord,
    safetyMetadata: {
      ...safetyMetadata,
      reviewStatus: 'pending',
      reviewedAt: undefined,
      reviewedBy: undefined,
    },
  }
}

function toRegistryResponse(result: { ok: true; value: AppRegistryRecord } | AppRegistryFailure, successStatus: number): Response {
  if (result.ok) {
    return jsonSuccess(successStatus, { app: result.value })
  }

  return jsonResponse<AppRegistryApiErrorBody>(statusForRegistryFailure(result.code), toApiErrorBody(result))
}

function statusForRegistryFailure(code: AppRegistryErrorCode): number {
  switch (code) {
    case 'invalid-manifest':
    case 'invalid-category':
      return 400
    case 'slug-conflict':
    case 'version-conflict':
      return 409
    case 'not-found':
      return 404
    case 'not-approved':
      return 403
  }
}

function jsonSuccess<T>(status: number, data: T): Response {
  return jsonResponse<AppRegistryApiSuccessBody<T>>(status, {
    ok: true,
    data,
  })
}

function jsonError(status: number, code: AppRegistryApiErrorCode, message: string, details?: string[]): Response {
  return jsonResponse<AppRegistryApiErrorBody>(status, toApiErrorBody(failureResult('api', code, message, { details })))
}

function jsonResponse<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}
