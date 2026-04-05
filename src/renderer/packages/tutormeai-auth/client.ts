import { OriginSchema, normalizeOrigin } from '@shared/contracts/v1/shared'
import type { TutorMeAIUserRole } from '@shared/types/settings'

export const DEFAULT_TUTORMEAI_BACKEND_ORIGIN = 'https://chatbox-audit-production.up.railway.app'

export interface TutorMeAIPlatformUser {
  userId: string
  email: string | null
  username: string | null
  displayName: string
  role: TutorMeAIUserRole | null
  pictureUrl: string | null
  onboardingCompletedAt: string | null
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

  return {
    ...payload.data,
    user: normalizeTutorMeAIPlatformUser(payload.data.user),
  }
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

  return {
    ...payload.data,
    user: normalizeTutorMeAIPlatformUser(payload.data.user),
  }
}

export async function updateTutorMeAIPlatformProfile(input: {
  backendOrigin: string
  accessToken: string
  displayName: string
  username: string
  role: TutorMeAIUserRole
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}): Promise<{
  user: TutorMeAIPlatformUser
}> {
  const response = await (input.fetchImpl ?? fetch)(new URL('/api/auth/profile', input.backendOrigin).toString(), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      displayName: input.displayName,
      username: input.username,
      role: input.role,
    }),
    mode: 'cors',
    signal: input.signal,
  })

  const payload = (await response.json()) as
    | {
        ok: true
        data: {
          user: TutorMeAIPlatformUser
        }
      }
    | {
        ok: false
        error?: {
          message?: string
        }
      }

  if (!response.ok || !payload.ok) {
    throw new Error(readApiErrorMessage(payload, response.status, 'TutorMeAI profile update failed.'))
  }

  return {
    user: normalizeTutorMeAIPlatformUser(payload.data.user),
  }
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

export function isTutorMeAIProfileComplete(user: TutorMeAIPlatformUser | null | undefined) {
  return Boolean(user?.username && user?.role && user?.onboardingCompletedAt)
}

export function deriveTutorMeAIUsernameCandidate(user: Pick<TutorMeAIPlatformUser, 'email' | 'displayName' | 'username'>) {
  if (typeof user.username === 'string' && user.username.trim().length > 0) {
    return user.username
  }

  const seed = user.email?.split('@')[0] ?? user.displayName
  const normalized = seed
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '.')
    .replace(/^[._-]+|[._-]+$/gu, '')
    .replace(/[._-]{2,}/gu, '.')

  const candidate = normalized.length >= 3 ? normalized : `user.${normalized || 'account'}`
  return candidate.slice(0, 32)
}

function readApiErrorMessage(
  payload: { ok: boolean; error?: { message?: string } } | null,
  status: number,
  fallback: string
) {
  const message = payload?.ok === false ? payload.error?.message : undefined
  return message && message.length > 0 ? message : `${fallback} Status ${status}.`
}

function normalizeOriginCandidate(value: string | null | undefined) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const parsed = OriginSchema.safeParse(value)
  return parsed.success ? normalizeOrigin(parsed.data) : null
}

function normalizeTutorMeAIPlatformUser(user: TutorMeAIPlatformUser): TutorMeAIPlatformUser {
  return {
    userId: user.userId,
    email: user.email ?? null,
    username: user.username ?? null,
    displayName: user.displayName,
    role: user.role ?? null,
    pictureUrl: user.pictureUrl ?? null,
    onboardingCompletedAt: user.onboardingCompletedAt ?? null,
  }
}
