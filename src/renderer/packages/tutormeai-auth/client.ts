import { OriginSchema, normalizeOrigin } from '@shared/contracts/v1/shared'

export const DEFAULT_TUTORMEAI_BACKEND_ORIGIN = 'https://chatbox-audit-production.up.railway.app'

export interface TutorMeAIPlatformUser {
  userId: string
  email: string | null
  displayName: string
  pictureUrl: string | null
}

export interface TutorMeAIPlatformSessionSummary {
  platformSessionId: string
  provider: string
  status: 'active' | 'expired' | 'revoked'
  sessionExpiresAt: string
  refreshExpiresAt: string
}

export type TutorMeAIPlatformCallbackMessage =
  | {
      type: 'tutormeai.platform-auth.callback'
      ok: true
      accessToken: string
      refreshToken: string
      user: TutorMeAIPlatformUser
    }
  | {
      type: 'tutormeai.platform-auth.callback'
      ok: false
      code: string
      message: string
    }

export function resolveTutorMeAIBackendOrigin(
  currentOrigin: string | undefined = typeof window !== 'undefined' ? window.location.origin : undefined,
  env: Record<string, string | undefined> = process.env
): string {
  const configuredOrigin = normalizeOriginCandidate(env.TUTORMEAI_BACKEND_ORIGIN)
  if (configuredOrigin) {
    return configuredOrigin
  }

  const current = normalizeOriginCandidate(currentOrigin)
  if (current) {
    const hostname = new URL(current).hostname
    if (hostname.endsWith('.railway.app')) {
      return current
    }
  }

  return DEFAULT_TUTORMEAI_BACKEND_ORIGIN
}

export function buildTutorMeAIPlatformGoogleStartUrl(input: {
  backendOrigin: string
  clientOrigin: string
}) {
  const url = new URL('/api/auth/platform/google/start', input.backendOrigin)
  url.searchParams.set('clientOrigin', normalizeOrigin(input.clientOrigin))
  return url.toString()
}

export async function fetchTutorMeAIPlatformProfile(input: {
  backendOrigin: string
  accessToken: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}): Promise<{
  user: TutorMeAIPlatformUser
  session: TutorMeAIPlatformSessionSummary
}> {
  const response = await (input.fetchImpl ?? fetch)(new URL('/api/auth/me', input.backendOrigin).toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${input.accessToken}`,
    },
    mode: 'cors',
    signal: input.signal,
  })

  const payload = (await response.json()) as
    | {
        ok: true
        data: {
          user: TutorMeAIPlatformUser
          session: TutorMeAIPlatformSessionSummary
        }
      }
    | {
        ok: false
        error?: {
          message?: string
        }
      }

  if (!response.ok || !payload.ok) {
    throw new Error(readApiErrorMessage(payload, response.status, 'TutorMeAI session lookup failed.'))
  }

  return payload.data
}

export async function refreshTutorMeAIPlatformSession(input: {
  backendOrigin: string
  refreshToken: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}): Promise<{
  accessToken: string
  refreshToken: string
  user: TutorMeAIPlatformUser
  session: TutorMeAIPlatformSessionSummary
}> {
  const response = await (input.fetchImpl ?? fetch)(new URL('/api/auth/platform/refresh', input.backendOrigin).toString(), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      refreshToken: input.refreshToken,
    }),
    mode: 'cors',
    signal: input.signal,
  })

  const payload = (await response.json()) as
    | {
        ok: true
        data: {
          accessToken: string
          refreshToken: string
          user: TutorMeAIPlatformUser
          session: TutorMeAIPlatformSessionSummary
        }
      }
    | {
        ok: false
        error?: {
          message?: string
        }
      }

  if (!response.ok || !payload.ok) {
    throw new Error(readApiErrorMessage(payload, response.status, 'TutorMeAI session refresh failed.'))
  }

  return payload.data
}

export async function logoutTutorMeAIPlatformSession(input: {
  backendOrigin: string
  accessToken?: string | null
  refreshToken?: string | null
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}) {
  const response = await (input.fetchImpl ?? fetch)(new URL('/api/auth/platform/logout', input.backendOrigin).toString(), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(input.accessToken ? { authorization: `Bearer ${input.accessToken}` } : {}),
    },
    body: JSON.stringify({
      refreshToken: input.refreshToken ?? undefined,
    }),
    mode: 'cors',
    signal: input.signal,
  })

  if (response.ok) {
    return
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        ok: false
        error?: {
          message?: string
        }
      }
    | null
  throw new Error(readApiErrorMessage(payload, response.status, 'TutorMeAI logout failed.'))
}

export function isTutorMeAIPlatformCallbackMessage(
  event: MessageEvent,
  backendOrigin: string
): event is MessageEvent<TutorMeAIPlatformCallbackMessage> {
  if (event.origin !== normalizeOrigin(backendOrigin)) {
    return false
  }

  const payload = event.data
  return Boolean(payload && typeof payload === 'object' && payload.type === 'tutormeai.platform-auth.callback')
}

function readApiErrorMessage(
  payload: { ok: false; error?: { message?: string } } | null,
  status: number,
  fallback: string
) {
  const message = !payload?.ok ? payload?.error?.message : undefined
  return message && message.length > 0 ? message : `${fallback} Status ${status}.`
}

function normalizeOriginCandidate(value: string | null | undefined) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const parsed = OriginSchema.safeParse(value)
  return parsed.success ? normalizeOrigin(parsed.data) : null
}
