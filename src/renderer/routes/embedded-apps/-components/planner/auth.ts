import { IdentifierSchema } from '@shared/contracts/v1'
import { OriginSchema, normalizeOrigin } from '@shared/contracts/v1/shared'
import { resolveTutorMeAIBackendOrigin } from '@/packages/tutormeai-auth/client'

export const PLANNER_OAUTH_APP_ID = 'planner.oauth'
export const PLANNER_OAUTH_PROVIDER = 'google'

export interface PlannerAuthProfileInput {
  email?: string
  name?: string
}

export interface PlannerOAuthConnectionRecord {
  oauthConnectionId: string
  userId: string
  appId: string
  provider: string
  status: 'pending' | 'connected' | 'expired' | 'revoked' | 'error'
  requestedScopes: string[]
  externalAccountId: string | null
  scopes: string[]
  tokenType: string | null
  accessTokenExpiresAt: string | null
  refreshTokenExpiresAt: string | null
  lastRefreshedAt: string | null
  connectedAt: string | null
  disconnectedAt: string | null
  createdAt: string
  updatedAt: string
  hasAccessToken: boolean
  hasRefreshToken: boolean
}

export type PlannerOAuthAuthState = 'connected' | 'required' | 'expired'

export type PlannerOAuthPopupMessage =
  | {
      type: 'tutormeai.oauth.callback'
      ok: true
      appId: string
      provider: string
      userId: string
      status: 'connected'
    }
  | {
      type: 'tutormeai.oauth.callback'
      ok: false
      code: string
      message: string
    }

export function buildPlannerAuthUserId(profile: PlannerAuthProfileInput): string {
  const preferredValue = normalizeNonEmptyString(profile.email) ?? normalizeNonEmptyString(profile.name) ?? 'student'
  const normalized = preferredValue
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '.')
    .replace(/^[._:-]+|[._:-]+$/gu, '')
    .replace(/[._:-]{2,}/gu, '.')

  const identifier = IdentifierSchema.safeParse(`user.${normalized || 'student'}`)
  if (identifier.success) {
    return identifier.data
  }

  return 'user.student'
}

export function resolvePlannerBackendOrigin(
  currentOrigin: string | undefined = typeof window !== 'undefined' ? window.location.origin : undefined,
  env: Record<string, string | undefined> = process.env
): string {
  return resolveTutorMeAIBackendOrigin(currentOrigin, env)
}

export function buildPlannerOAuthStartUrl(input: {
  backendOrigin: string
  clientOrigin: string
  userId: string
  appId?: string
}) {
  const url = new URL('/api/auth/oauth/google/start', input.backendOrigin)
  url.searchParams.set('userId', input.userId)
  url.searchParams.set('appId', input.appId ?? PLANNER_OAUTH_APP_ID)
  url.searchParams.set('clientOrigin', normalizeOrigin(input.clientOrigin))
  return url.toString()
}

export async function requestPlannerOAuthAuthorizationUrl(input: {
  backendOrigin: string
  clientOrigin: string
  accessToken: string
  appId?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}) {
  const response = await (input.fetchImpl ?? fetch)(new URL('/api/auth/oauth/google/start', input.backendOrigin).toString(), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      appId: input.appId ?? PLANNER_OAUTH_APP_ID,
      clientOrigin: normalizeOrigin(input.clientOrigin),
    }),
    mode: 'cors',
    signal: input.signal,
  })

  const payload = (await response.json()) as
    | {
        ok: true
        data: {
          authorizationUrl: string
        }
      }
    | {
        ok: false
        error?: {
          message?: string
        }
      }

  if (!response.ok || !payload.ok) {
    const message =
      !payload.ok && payload.error?.message
        ? payload.error.message
        : `Planner OAuth start failed with status ${response.status}.`
    throw new Error(message)
  }

  return payload.data.authorizationUrl
}

export async function fetchPlannerOAuthConnection(
  input: {
    backendOrigin: string
    userId?: string
    appId?: string
    accessToken?: string
    fetchImpl?: typeof fetch
    signal?: AbortSignal
  }
): Promise<PlannerOAuthConnectionRecord | null> {
  const url = new URL('/api/auth/oauth', input.backendOrigin)
  url.searchParams.set('appId', input.appId ?? PLANNER_OAUTH_APP_ID)
  url.searchParams.set('provider', PLANNER_OAUTH_PROVIDER)
  if (input.userId) {
    url.searchParams.set('userId', input.userId)
  }

  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...(input.accessToken ? { authorization: `Bearer ${input.accessToken}` } : {}),
    },
    mode: 'cors',
    signal: input.signal,
  })

  if (response.status === 404) {
    return null
  }

  const payload = (await response.json()) as
    | {
        ok: true
        data: { connection: PlannerOAuthConnectionRecord }
      }
    | {
        ok: false
        error?: {
          message?: string
        }
      }

  if (!response.ok || !payload.ok) {
    const message =
      !payload.ok && payload.error?.message
        ? payload.error.message
        : `Planner OAuth lookup failed with status ${response.status}.`
    throw new Error(message)
  }

  return payload.data.connection
}

export function derivePlannerOAuthAuthState(connection: PlannerOAuthConnectionRecord | null): PlannerOAuthAuthState {
  if (!connection) {
    return 'required'
  }

  if (connection.status === 'connected' && connection.hasAccessToken) {
    return 'connected'
  }

  if (connection.status === 'expired') {
    return 'expired'
  }

  return 'required'
}

export function isPlannerOAuthCallbackMessage(
  event: MessageEvent,
  backendOrigin: string
): event is MessageEvent<PlannerOAuthPopupMessage> {
  if (event.origin !== normalizeOrigin(backendOrigin)) {
    return false
  }

  const payload = event.data
  return Boolean(payload && typeof payload === 'object' && payload.type === 'tutormeai.oauth.callback')
}

function normalizeNonEmptyString(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function normalizeOriginCandidate(value: string | null | undefined) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const parsed = OriginSchema.safeParse(value)
  return parsed.success ? normalizeOrigin(parsed.data) : null
}
