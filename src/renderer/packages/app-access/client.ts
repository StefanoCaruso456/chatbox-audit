import type { TutorMeAIUserRole } from '@shared/types/settings'
import { resolveTutorMeAIBackendOrigin } from '@/packages/tutormeai-auth/client'

export interface TutorMeAIAppAccessRequest {
  appAccessRequestId: string
  appId: string
  appName: string
  studentUserId: string
  studentDisplayName: string
  studentEmail: string | null
  studentRole: TutorMeAIUserRole | null
  status: 'pending' | 'approved' | 'declined'
  decisionReason: string | null
  decidedByUserId: string | null
  decidedByDisplayName: string | null
  requestedAt: string
  decidedAt: string | null
  updatedAt: string
}

export async function submitTutorMeAIAppAccessRequest(input: {
  accessToken: string
  appId: string
  appName: string
  backendOrigin?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}): Promise<{
  access: TutorMeAIAppAccessRequest['status']
  request: TutorMeAIAppAccessRequest
}> {
  const response = await (input.fetchImpl ?? fetch)(
    new URL('/api/app-access/requests', input.backendOrigin ?? resolveTutorMeAIBackendOrigin()).toString(),
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        appId: input.appId,
        appName: input.appName,
      }),
      mode: 'cors',
      signal: input.signal,
    }
  )

  const payload = (await response.json()) as
    | {
        ok: true
        data: {
          access: TutorMeAIAppAccessRequest['status']
          request: TutorMeAIAppAccessRequest
        }
      }
    | {
        ok: false
        error?: {
          message?: string
        }
      }

  if (!response.ok || !payload.ok) {
    throw new Error(readApiErrorMessage(payload, response.status, 'Failed to create the app access request.'))
  }

  return payload.data
}

export async function fetchTutorMeAIMyAppAccessRequest(input: {
  accessToken: string
  appId: string
  backendOrigin?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}): Promise<TutorMeAIAppAccessRequest | null> {
  const url = new URL('/api/app-access/requests/mine', input.backendOrigin ?? resolveTutorMeAIBackendOrigin())
  url.searchParams.set('appId', input.appId)

  const response = await (input.fetchImpl ?? fetch)(url.toString(), {
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
          request: TutorMeAIAppAccessRequest | null
        }
      }
    | {
        ok: false
        error?: {
          message?: string
        }
      }

  if (!response.ok || !payload.ok) {
    throw new Error(readApiErrorMessage(payload, response.status, 'Failed to read the app access request.'))
  }

  return payload.data.request
}

export async function listTutorMeAIPendingAppAccessRequests(input: {
  accessToken: string
  backendOrigin?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}): Promise<TutorMeAIAppAccessRequest[]> {
  const response = await (input.fetchImpl ?? fetch)(
    new URL('/api/app-access/requests/pending', input.backendOrigin ?? resolveTutorMeAIBackendOrigin()).toString(),
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${input.accessToken}`,
      },
      mode: 'cors',
      signal: input.signal,
    }
  )

  const payload = (await response.json()) as
    | {
        ok: true
        data: {
          requests: TutorMeAIAppAccessRequest[]
        }
      }
    | {
        ok: false
        error?: {
          message?: string
        }
      }

  if (!response.ok || !payload.ok) {
    throw new Error(readApiErrorMessage(payload, response.status, 'Failed to load pending app access requests.'))
  }

  return payload.data.requests
}

export async function decideTutorMeAIAppAccessRequest(input: {
  accessToken: string
  appAccessRequestId: string
  status: 'approved' | 'declined'
  decisionReason?: string
  backendOrigin?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}): Promise<TutorMeAIAppAccessRequest> {
  const response = await (input.fetchImpl ?? fetch)(
    new URL(
      `/api/app-access/requests/${encodeURIComponent(input.appAccessRequestId)}/decision`,
      input.backendOrigin ?? resolveTutorMeAIBackendOrigin()
    ).toString(),
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        status: input.status,
        decisionReason: input.decisionReason,
      }),
      mode: 'cors',
      signal: input.signal,
    }
  )

  const payload = (await response.json()) as
    | {
        ok: true
        data: {
          request: TutorMeAIAppAccessRequest
        }
      }
    | {
        ok: false
        error?: {
          message?: string
        }
      }

  if (!response.ok || !payload.ok) {
    throw new Error(readApiErrorMessage(payload, response.status, 'Failed to decide the app access request.'))
  }

  return payload.data.request
}

function readApiErrorMessage(
  payload: { ok: false; error?: { message?: string } } | null | undefined,
  status: number,
  fallback: string
) {
  return payload?.error?.message ?? `${fallback} (status ${status}).`
}
