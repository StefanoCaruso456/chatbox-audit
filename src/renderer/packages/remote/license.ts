import { ofetch } from 'ofetch'
import type { ChatboxAILicenseDetail } from '../../../shared/types'
import { getAfetch, getAPIOrigin, getChatboxHeaders } from './core'

export async function getLicenseDetail(params: { licenseKey: string }) {
  type Response = {
    data: ChatboxAILicenseDetail | null
  }

  const res = await ofetch<Response>(`${getAPIOrigin()}/api/license/detail`, {
    retry: 3,
    headers: {
      Authorization: params.licenseKey,
      ...(await getChatboxHeaders()),
    },
  })

  return res.data || null
}

export interface LicenseDetailError {
  code: string
  detail: string
  status: number
  title: string
}

export interface LicenseDetailResponse {
  data: ChatboxAILicenseDetail | null
  error?: LicenseDetailError
}

export async function getLicenseDetailRealtime(params: { licenseKey: string }): Promise<LicenseDetailResponse> {
  type Response = {
    data: ChatboxAILicenseDetail | null
    error?: LicenseDetailError
  }

  let capturedError: LicenseDetailError | undefined

  try {
    const res = await ofetch<Response>(`${getAPIOrigin()}/api/license/detail/realtime`, {
      retry: 5,
      headers: {
        Authorization: params.licenseKey,
        ...(await getChatboxHeaders()),
      },
      onResponseError({ response }) {
        const body = response._data as { error?: LicenseDetailError } | undefined
        if (body?.error) {
          capturedError = body.error
        }
      },
    })

    return { data: res.data || null, error: res.error }
  } catch (error: unknown) {
    if (capturedError) {
      return { data: null, error: capturedError }
    }

    throw error
  }
}

export async function activateLicense(params: { licenseKey: string; instanceName: string }) {
  type Response = {
    data: {
      valid: boolean
      instanceId: string
      error: string
    }
  }

  const afetch = await getAfetch()
  const res = await afetch(
    `${getAPIOrigin()}/api/license/activate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
      body: JSON.stringify(params),
    },
    {
      parseChatboxRemoteError: true,
      retry: 5,
    }
  )

  const json: Response = await res.json()
  return json.data
}

export async function deactivateLicense(params: { licenseKey: string; instanceId: string }) {
  const afetch = await getAfetch()

  await afetch(
    `${getAPIOrigin()}/api/license/deactivate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    },
    {
      parseChatboxRemoteError: true,
      retry: 5,
    }
  )
}

export async function validateLicense(params: { licenseKey: string; instanceId: string }) {
  type Response = {
    data: {
      valid: boolean
    }
  }

  const afetch = await getAfetch()
  const res = await afetch(
    `${getAPIOrigin()}/api/license/validate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
      body: JSON.stringify(params),
    },
    {
      parseChatboxRemoteError: true,
      retry: 5,
    }
  )

  const json: Response = await res.json()
  return json.data
}
