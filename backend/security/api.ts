import { IdentifierSchema, JsonObjectSchema } from '@shared/contracts/v1'
import { z } from 'zod'
import { failureResult, toApiErrorBody } from '../errors'
import { AppReviewStateSchema } from './submission-package'
import type { AppSecurityErrorCode, AppSecurityResult } from './types'
import type { AppReviewWorkflowService } from './workflow'

const DecisionActionSchema = z.enum([
  'approve-staging',
  'approve-production',
  'request-remediation',
  'reject',
  'suspend',
])

const RemediationItemSchema = z.object({
  code: z.string().min(1),
  summary: z.string().min(1),
  recommendation: z.string().min(1).optional(),
  field: z.string().min(1).optional(),
  blocking: z.boolean(),
})

const StartReviewBodySchema = z.object({
  appId: IdentifierSchema,
  appVersionId: z.string().min(1).optional(),
  reviewedByUserId: IdentifierSchema.optional(),
  notes: z.string().min(1).optional(),
})

const RecordReviewerDecisionBodySchema = z.object({
  appId: IdentifierSchema,
  appVersionId: z.string().min(1).optional(),
  reviewedByUserId: IdentifierSchema,
  action: DecisionActionSchema,
  decisionSummary: z.string().min(1),
  notes: z.string().min(1).optional(),
  ageRating: z.enum(['all-ages', '13+', '16+', '18+']),
  dataAccessLevel: z.enum(['minimal', 'moderate', 'sensitive']),
  permissionsSnapshot: z.array(z.string().min(1)),
  remediationItems: z.array(RemediationItemSchema).optional(),
  metadata: JsonObjectSchema.optional(),
})

const ReviewQueueQuerySchema = z.object({
  reviewState: AppReviewStateSchema.optional(),
})

const ReviewContextQuerySchema = z.object({
  appVersionId: z.string().min(1).optional(),
})

const ReviewContextParamsSchema = z.object({
  appId: IdentifierSchema,
})

export const SecurityApiRoutes = {
  reviewQueue: '/api/security/reviews',
  reviewStart: '/api/security/reviews/start',
  reviewDecision: '/api/security/reviews/decisions',
  reviewContext: '/api/security/reviews/apps/:appId',
} as const

export type SecurityApiErrorCode = AppSecurityErrorCode | 'invalid-json' | 'invalid-query' | 'invalid-route-params'

export interface SecurityApiSuccessBody<T> {
  ok: true
  data: T
}

export interface SecurityApiErrorBody {
  ok: false
  error: {
    domain: 'api' | 'security'
    code: SecurityApiErrorCode
    message: string
    details?: string[]
    retryable?: boolean
  }
}

export interface ReviewContextRouteParams {
  appId?: string
}

export function createSecurityApi(workflow: AppReviewWorkflowService) {
  return {
    listReviewQueue: async (request: Request): Promise<Response> => {
      const url = new URL(request.url)
      const parsedQuery = ReviewQueueQuerySchema.safeParse(searchParamsToObject(url.searchParams))
      if (!parsedQuery.success) {
        return jsonError(400, 'invalid-query', 'Review queue query is invalid.', parsedQuery.error.issues.map((issue) => issue.message))
      }

      const queue = await workflow.listQueue(parsedQuery.data.reviewState)
      return jsonSuccess(200, { queue })
    },

    getReviewContext: async (request: Request, params: ReviewContextRouteParams): Promise<Response> => {
      const parsedParams = ReviewContextParamsSchema.safeParse(params)
      if (!parsedParams.success) {
        return jsonError(
          400,
          'invalid-route-params',
          'Review context route params are invalid.',
          parsedParams.error.issues.map((issue) => issue.message)
        )
      }

      const url = new URL(request.url)
      const parsedQuery = ReviewContextQuerySchema.safeParse(searchParamsToObject(url.searchParams))
      if (!parsedQuery.success) {
        return jsonError(400, 'invalid-query', 'Review context query is invalid.', parsedQuery.error.issues.map((issue) => issue.message))
      }

      const result = await workflow.getReviewContext({
        appId: parsedParams.data.appId,
        appVersionId: parsedQuery.data.appVersionId,
      })

      return toSecurityResponse(result, 200)
    },

    startReview: async (request: Request): Promise<Response> => {
      const parsedBody = await parseJsonBody(request, StartReviewBodySchema)
      if (!parsedBody.ok) {
        return parsedBody.response
      }

      const result = await workflow.startReview(parsedBody.data)
      return toSecurityResponse(result, 200)
    },

    recordDecision: async (request: Request): Promise<Response> => {
      const parsedBody = await parseJsonBody(request, RecordReviewerDecisionBodySchema)
      if (!parsedBody.ok) {
        return parsedBody.response
      }

      const result = await workflow.recordDecision(parsedBody.data)
      return toSecurityResponse(result, 200)
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

function toSecurityResponse<T>(result: AppSecurityResult<T>, successStatus: number): Response {
  if (result.ok) {
    return jsonSuccess(successStatus, result.value)
  }

  return jsonResponse<SecurityApiErrorBody>(statusForSecurityFailure(result.code), toApiErrorBody(result))
}

function statusForSecurityFailure(code: AppSecurityErrorCode): number {
  switch (code) {
    case 'app-not-found':
    case 'app-version-not-found':
    case 'review-not-found':
      return 404
    case 'invalid-review-state-transition':
    case 'invalid-review-transition':
      return 409
    case 'app-not-launchable':
    case 'origin-not-allowed':
      return 403
    default:
      return 400
  }
}

function jsonSuccess<T>(status: number, data: T): Response {
  return jsonResponse<SecurityApiSuccessBody<T>>(status, {
    ok: true,
    data,
  })
}

function jsonError(status: number, code: SecurityApiErrorCode, message: string, details?: string[]): Response {
  return jsonResponse<SecurityApiErrorBody>(status, toApiErrorBody(failureResult('api', code, message, { details })))
}

function jsonResponse<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}
