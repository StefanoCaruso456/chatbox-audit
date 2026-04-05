import { IdentifierSchema, JsonObjectSchema } from '@shared/contracts/v1'
import { z } from 'zod'
import { failureResult, toApiErrorBody } from '../errors'
import { toPublicOAuthConnectionRecord } from './public'
import type { OAuthAuthService, PlatformAuthService } from './service'
import type { OAuthAuthFailure, OAuthAuthResult, OAuthProviderAdapter, PlatformAuthFailure, PlatformAuthResult } from './types'

const BooleanQuerySchema = z.enum(['true', 'false']).transform((value) => value === 'true')

const OAuthProviderConfigSchema = z.object({
  provider: z.string().min(1),
  authorizationUrl: z.string().url(),
  tokenUrl: z.string().url(),
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  defaultScopes: z.array(z.string().min(1)),
  extraAuthorizationParameters: z.record(z.string(), z.string()).optional(),
  pkce: z.boolean().optional(),
})

const IssuePlatformSessionBodySchema = z.object({
  userId: IdentifierSchema,
  provider: z.string().min(1).optional(),
  platformSessionId: z.string().min(1).optional(),
  sessionTtlMs: z.number().int().positive().optional(),
  refreshTtlMs: z.number().int().positive().optional(),
  userAgent: z.string().min(1).optional(),
  ipAddress: z.string().min(1).optional(),
  metadata: JsonObjectSchema.optional(),
})

const ValidatePlatformSessionBodySchema = z.object({
  sessionToken: z.string().min(1),
  touchLastUsedAt: z.boolean().optional(),
})

const RefreshPlatformSessionBodySchema = z.object({
  refreshToken: z.string().min(1),
  sessionTtlMs: z.number().int().positive().optional(),
  refreshTtlMs: z.number().int().positive().optional(),
})

const RevokePlatformSessionBodySchema = z
  .object({
    platformSessionId: z.string().min(1).optional(),
    sessionToken: z.string().min(1).optional(),
    refreshToken: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.platformSessionId && !value.sessionToken && !value.refreshToken) {
      ctx.addIssue({
        code: 'custom',
        message: 'A platformSessionId, sessionToken, or refreshToken selector is required.',
      })
    }
  })

const StartOAuthConnectionBodySchema = z.object({
  userId: IdentifierSchema,
  appId: IdentifierSchema,
  provider: OAuthProviderConfigSchema,
  authorizationState: z.string().min(1).optional(),
  codeVerifier: z.string().min(1).optional(),
  requestedScopes: z.array(z.string().min(1)).optional(),
  metadata: JsonObjectSchema.optional(),
})

const CompleteOAuthConnectionBodySchema = z.object({
  state: z.string().min(1),
  authorizationCode: z.string().min(1),
  provider: OAuthProviderConfigSchema,
})

const RefreshOAuthConnectionBodySchema = z
  .object({
    oauthConnectionId: z.string().min(1).optional(),
    userId: IdentifierSchema.optional(),
    appId: IdentifierSchema.optional(),
    provider: OAuthProviderConfigSchema,
  })
  .superRefine((value, ctx) => {
    if (!value.oauthConnectionId && !(value.userId && value.appId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Refresh requires oauthConnectionId or a userId/appId selector.',
      })
    }
  })

const RevokeOAuthConnectionBodySchema = z
  .object({
    oauthConnectionId: z.string().min(1).optional(),
    userId: IdentifierSchema.optional(),
    appId: IdentifierSchema.optional(),
    provider: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.oauthConnectionId && !(value.userId && value.appId && value.provider)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Revoke requires oauthConnectionId or a userId/appId/provider selector.',
      })
    }
  })

const GetOAuthConnectionQuerySchema = z.object({
  userId: IdentifierSchema.optional(),
  appId: IdentifierSchema.optional(),
  provider: z.string().min(1).optional(),
})

const GetOAuthConnectionParamsSchema = z.object({
  oauthConnectionId: z.string().min(1).optional(),
})

const ListOAuthConnectionsQuerySchema = z.object({
  userId: IdentifierSchema,
  appId: IdentifierSchema.optional(),
  provider: z.string().min(1).optional(),
  status: z.enum(['pending', 'connected', 'expired', 'revoked', 'error']).optional(),
  launchableOnly: BooleanQuerySchema.optional(),
})

export const AuthApiRoutes = {
  platformSessions: '/api/auth/platform/sessions',
  platformSessionsValidate: '/api/auth/platform/sessions/validate',
  platformSessionsRefresh: '/api/auth/platform/sessions/refresh',
  platformSessionsRevoke: '/api/auth/platform/sessions/revoke',
  oauthStart: '/api/auth/oauth/start',
  oauthCallback: '/api/auth/oauth/callback',
  oauthRefresh: '/api/auth/oauth/refresh',
  oauthRevoke: '/api/auth/oauth/revoke',
  oauthConnection: '/api/auth/oauth/:oauthConnectionId',
  oauthConnections: '/api/auth/oauth',
} as const

export type AuthApiErrorCode =
  | PlatformAuthFailure['code']
  | OAuthAuthFailure['code']
  | 'invalid-json'
  | 'invalid-query'
  | 'invalid-route-params'

export interface AuthApiSuccessBody<T> {
  ok: true
  data: T
}

export interface AuthApiErrorBody {
  ok: false
  error: {
    domain: 'api' | 'auth' | 'oauth'
    code: AuthApiErrorCode
    message: string
    details?: string[]
    retryable?: boolean
  }
}

export interface AuthApiOptions {
  oauthAdapters?: Record<string, OAuthProviderAdapter>
}

export interface GetOAuthConnectionRouteParams {
  oauthConnectionId?: string
}

export function createAuthApi(
  platformAuthService: PlatformAuthService,
  oauthAuthService: OAuthAuthService,
  options: AuthApiOptions = {}
) {
  const oauthAdapters = options.oauthAdapters ?? {}

  return {
    issuePlatformSession: async (request: Request): Promise<Response> => {
      const parsedBody = await parseJsonBody(request, IssuePlatformSessionBodySchema)
      if (!parsedBody.ok) {
        return parsedBody.response
      }

      const result = await platformAuthService.issuePlatformSession(parsedBody.data)
      return toAuthResponse(result, 201)
    },

    validatePlatformSession: async (request: Request): Promise<Response> => {
      const parsedBody = await parseJsonBody(request, ValidatePlatformSessionBodySchema)
      if (!parsedBody.ok) {
        return parsedBody.response
      }

      const result = await platformAuthService.validatePlatformSession(parsedBody.data)
      return toAuthResponse(result, 200)
    },

    refreshPlatformSession: async (request: Request): Promise<Response> => {
      const parsedBody = await parseJsonBody(request, RefreshPlatformSessionBodySchema)
      if (!parsedBody.ok) {
        return parsedBody.response
      }

      const result = await platformAuthService.refreshPlatformSession(parsedBody.data)
      return toAuthResponse(result, 200)
    },

    revokePlatformSession: async (request: Request): Promise<Response> => {
      const parsedBody = await parseJsonBody(request, RevokePlatformSessionBodySchema)
      if (!parsedBody.ok) {
        return parsedBody.response
      }

      const result = await platformAuthService.revokePlatformSession(parsedBody.data)
      return toAuthResponse(result, 200)
    },

    startOAuthConnection: async (request: Request): Promise<Response> => {
      const parsedBody = await parseJsonBody(request, StartOAuthConnectionBodySchema)
      if (!parsedBody.ok) {
        return parsedBody.response
      }

      const result = await oauthAuthService.startOAuthConnection(parsedBody.data)
      return toAuthResponse(result, 201)
    },

    completeOAuthConnection: async (request: Request): Promise<Response> => {
      const parsedBody = await parseJsonBody(request, CompleteOAuthConnectionBodySchema)
      if (!parsedBody.ok) {
        return parsedBody.response
      }

      const adapter = oauthAdapters[parsedBody.data.provider.provider]
      if (!adapter) {
        return jsonResponse<AuthApiErrorBody>(
          501,
          toApiErrorBody(failureResult('oauth', 'oauth-provider-adapter-missing', `No OAuth adapter is configured for provider "${parsedBody.data.provider.provider}".`))
        )
      }

      const result = await oauthAuthService.completeOAuthConnection({
        ...parsedBody.data,
        adapter,
      })
      return toAuthResponse(result, 200)
    },

    refreshOAuthConnection: async (request: Request): Promise<Response> => {
      const parsedBody = await parseJsonBody(request, RefreshOAuthConnectionBodySchema)
      if (!parsedBody.ok) {
        return parsedBody.response
      }

      const adapter = oauthAdapters[parsedBody.data.provider.provider]
      if (!adapter) {
        return jsonResponse<AuthApiErrorBody>(
          501,
          toApiErrorBody(failureResult('oauth', 'oauth-provider-adapter-missing', `No OAuth adapter is configured for provider "${parsedBody.data.provider.provider}".`))
        )
      }

      const result = await oauthAuthService.refreshOAuthConnection({
        ...parsedBody.data,
        adapter,
      })
      return toAuthResponse(result, 200)
    },

    revokeOAuthConnection: async (request: Request): Promise<Response> => {
      const parsedBody = await parseJsonBody(request, RevokeOAuthConnectionBodySchema)
      if (!parsedBody.ok) {
        return parsedBody.response
      }

      const result = await oauthAuthService.revokeOAuthConnection(parsedBody.data)
      return toAuthResponse(result, 200)
    },

    getOAuthConnection: async (
      request: Request,
      params: GetOAuthConnectionRouteParams = {}
    ): Promise<Response> => {
      const url = new URL(request.url)
      const parsedQuery = GetOAuthConnectionQuerySchema.safeParse(searchParamsToObject(url.searchParams))
      if (!parsedQuery.success) {
        return jsonResponse<AuthApiErrorBody>(
          400,
          toApiErrorBody(
            failureResult(
              'api',
              'invalid-query',
              'OAuth lookup query is invalid.',
              { details: parsedQuery.error.issues.map((issue) => issue.message) }
            )
          )
        )
      }

      const parsedParams = GetOAuthConnectionParamsSchema.safeParse(params)
      if (!parsedParams.success) {
        return jsonResponse<AuthApiErrorBody>(
          400,
          toApiErrorBody(
            failureResult(
              'api',
              'invalid-route-params',
              'OAuth lookup route params are invalid.',
              { details: parsedParams.error.issues.map((issue) => issue.message) }
            )
          )
        )
      }

      const oauthConnectionId = parsedParams.data.oauthConnectionId
      const { userId, appId, provider } = parsedQuery.data
      if (!oauthConnectionId && !(userId && appId && provider)) {
        return jsonResponse<AuthApiErrorBody>(
          400,
          toApiErrorBody(
            failureResult(
              'api',
              'invalid-query',
              'OAuth lookup requires oauthConnectionId or a userId/appId/provider selector.'
            )
          )
        )
      }

      const result = await oauthAuthService.getOAuthConnection({
        oauthConnectionId,
        userId,
        appId,
        provider,
      })
      if (!result.ok) {
        return toAuthResponse(result, 200)
      }

      return jsonResponse<AuthApiSuccessBody<{ connection: ReturnType<typeof toPublicOAuthConnectionRecord> }>>(200, {
        ok: true,
        data: {
          connection: toPublicOAuthConnectionRecord(result.value),
        },
      })
    },

    listOAuthConnections: async (request: Request): Promise<Response> => {
      const url = new URL(request.url)
      const parsedQuery = ListOAuthConnectionsQuerySchema.safeParse(searchParamsToObject(url.searchParams))
      if (!parsedQuery.success) {
        return jsonResponse<AuthApiErrorBody>(
          400,
          toApiErrorBody(
            failureResult(
              'api',
              'invalid-query',
              'OAuth list query is invalid.',
              { details: parsedQuery.error.issues.map((issue) => issue.message) }
            )
          )
        )
      }

      const connections = await oauthAuthService.listOAuthConnectionsByUser(parsedQuery.data.userId)
      const filtered = connections.filter((connection) => {
        if (parsedQuery.data.appId && connection.appId !== parsedQuery.data.appId) {
          return false
        }

        if (parsedQuery.data.provider && connection.provider !== parsedQuery.data.provider) {
          return false
        }

        if (parsedQuery.data.status && connection.status !== parsedQuery.data.status) {
          return false
        }

        if (parsedQuery.data.launchableOnly) {
          return (
            connection.status === 'connected' &&
            Boolean(connection.accessTokenCiphertext) &&
            (!connection.accessTokenExpiresAt || Date.parse(connection.accessTokenExpiresAt) > Date.now())
          )
        }

        return true
      })

      return jsonResponse<AuthApiSuccessBody<{ connections: Array<ReturnType<typeof toPublicOAuthConnectionRecord>> }>>(200, {
        ok: true,
        data: {
          connections: filtered.map((connection) => toPublicOAuthConnectionRecord(connection)),
        },
      })
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
      response: jsonResponse<AuthApiErrorBody>(
        400,
        toApiErrorBody(failureResult('api', 'invalid-json', 'Request body must be valid JSON.'))
      ),
    }
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonResponse<AuthApiErrorBody>(
        400,
        toApiErrorBody(
          failureResult('api', 'invalid-json', 'Request body shape is invalid.', {
            details: parsed.error.issues.map((issue) => issue.message),
          })
        )
      ),
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

function toAuthResponse<T>(
  result: PlatformAuthResult<T> | OAuthAuthResult<T>,
  successStatus: number
): Response {
  if (result.ok) {
    return jsonResponse<AuthApiSuccessBody<T>>(successStatus, {
      ok: true,
      data: result.value,
    })
  }

  return jsonResponse<AuthApiErrorBody>(statusForFailure(result.code), toApiErrorBody(result))
}

function statusForFailure(code: AuthApiErrorCode): number {
  switch (code) {
    case 'invalid-json':
    case 'invalid-query':
    case 'invalid-route-params':
    case 'invalid-request':
      return 400
    case 'platform-session-not-found':
    case 'oauth-connection-not-found':
      return 404
    case 'platform-session-revoked':
    case 'platform-session-expired':
    case 'platform-session-refresh-expired':
    case 'oauth-connection-revoked':
    case 'oauth-connection-expired':
      return 403
    case 'oauth-provider-adapter-missing':
      return 501
    case 'platform-session-refresh-invalid':
    case 'platform-session-invalid-token':
    case 'oauth-connection-not-pending':
    case 'oauth-connection-missing-refresh-token':
    case 'oauth-connection-missing-code-verifier':
    case 'oauth-token-exchange-failed':
    case 'oauth-token-refresh-failed':
    case 'oauth-token-missing':
      return 409
  }
}

function jsonResponse<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}
