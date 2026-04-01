import platform from '@/platform'
import { authInfoStore } from '@/stores/authInfoStore'
import { createAuthenticatedAfetch } from '../../../shared/request/request'
import { getAfetch, getChatboxHeaders, getChatboxOrigin, getPlatformInfo, log } from './core'

let authenticatedAfetchInstance: ReturnType<typeof createAuthenticatedAfetch> | null = null
let authenticatedAfetchPromise: Promise<ReturnType<typeof createAuthenticatedAfetch>> | null = null

function initAuthenticatedAfetch(): Promise<ReturnType<typeof createAuthenticatedAfetch>> {
  if (authenticatedAfetchPromise) {
    return authenticatedAfetchPromise
  }

  authenticatedAfetchPromise = (async () => {
    authenticatedAfetchInstance = createAuthenticatedAfetch({
      platformInfo: await getPlatformInfo(),
      getTokens: () => Promise.resolve(authInfoStore.getState().getTokens()),
      refreshTokens: async (refreshToken: string) => {
        const result = await refreshAccessToken({ refreshToken })
        authInfoStore.getState().setTokens(result)
        return result
      },
      clearTokens: () => {
        authInfoStore.getState().clearTokens()
        return Promise.resolve()
      },
    })

    return authenticatedAfetchInstance
  })()

  return authenticatedAfetchPromise
}

async function getAuthenticatedAfetch() {
  if (!authenticatedAfetchInstance) {
    return await initAuthenticatedAfetch()
  }

  return authenticatedAfetchInstance
}

export async function requestLoginTicketId() {
  type Response = {
    data: {
      ticket_id: string
    }
  }

  const afetch = await getAfetch()

  let deviceType: string
  if (platform.type === 'mobile') {
    deviceType = await platform.getPlatform()
  } else if (platform.type === 'desktop') {
    deviceType = (await getPlatformInfo()).os
  } else {
    deviceType = platform.type
  }

  const appVersion = await platform.getVersion()
  const deviceName = await platform.getDeviceName()

  log.debug('requestLoginTicketId chatbox origin', getChatboxOrigin())

  const res = await afetch(
    `${getChatboxOrigin()}/api/auth/request_login_ticket`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
      body: JSON.stringify({
        device_type: deviceType,
        app_version: appVersion,
        device_name: deviceName,
      }),
    },
    {
      parseChatboxRemoteError: true,
      retry: 3,
    }
  )

  const json: Response = await res.json()
  return json.data.ticket_id
}

export async function checkLoginStatus(ticketId: string) {
  type Response = {
    data: {
      status?: 'success' | 'rejected' | 'pending'
      access_token?: string
      refresh_token?: string
    }
    success: boolean
  }

  const afetch = await getAfetch()
  const res = await afetch(
    `${getChatboxOrigin()}/api/auth/login_status`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
      body: JSON.stringify({ ticket_id: ticketId }),
    },
    {
      parseChatboxRemoteError: true,
      retry: 2,
    }
  )

  const json: Response = await res.json()
  const responseStatus = json.data.status
  const accessToken = json.data.access_token || null
  const refreshToken = json.data.refresh_token || null

  let status: 'pending' | 'success' | 'rejected' = 'pending'
  if (responseStatus === 'success' && accessToken && refreshToken) {
    status = 'success'
  } else if (responseStatus === 'rejected') {
    status = 'rejected'
  }

  return {
    status,
    accessToken,
    refreshToken,
  }
}

export async function refreshAccessToken(params: { refreshToken: string }) {
  type Response = {
    data: {
      result: string
    }
  }

  const afetch = await getAfetch()
  const res = await afetch(
    `${getChatboxOrigin()}/api/auth/token_refresh`,
    {
      method: 'POST',
      headers: {
        'x-chatbox-refresh-token': params.refreshToken,
        ...(await getChatboxHeaders()),
      },
    },
    {
      parseChatboxRemoteError: true,
      retry: 2,
    }
  )

  const json: Response = await res.json()
  void json

  const accessToken = res.headers.get('x-chatbox-access-token')
  const refreshToken = res.headers.get('x-chatbox-refresh-token')

  if (!accessToken || !refreshToken) {
    log.error('Missing tokens in refresh response headers', {
      accessToken: accessToken ? 'present' : 'missing',
      refreshToken: refreshToken ? 'present' : 'missing',
    })
    throw new Error('Failed to refresh token: missing tokens in response headers')
  }

  return {
    accessToken,
    refreshToken,
  }
}

export async function getUserProfile() {
  type Response = {
    data: {
      email: string
      id: string
      created_at: string
    }
  }

  const afetch = await getAuthenticatedAfetch()
  const res = await afetch(
    `${getChatboxOrigin()}/api/user/profile`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
    },
    {
      parseChatboxRemoteError: true,
      retry: 2,
    }
  )

  const json: Response = await res.json()
  return json.data
}

export interface UserLicense {
  id: number
  key: string
  status: string
  platform: string
  product_name: string
  payment_type: string
  image_usage: number
  unified_token_usage: number
  unified_token_limit: number
  unified_token_usage_details: Array<{
    type: string
    token_usage: number
    token_limit: number
  }>
  image_limit: number
  next_token_refresh_at: string
  expires_at: string
  created_at: string
  recurring_canceled: boolean
  quota_packs: unknown[]
}

export async function listLicensesByUser(): Promise<UserLicense[]> {
  type Response = {
    data: UserLicense[]
  }

  const afetch = await getAuthenticatedAfetch()
  const res = await afetch(
    `${getChatboxOrigin()}/api/license/list_by_user`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
    },
    {
      parseChatboxRemoteError: true,
      retry: 2,
    }
  )

  const json: Response = await res.json()
  return json.data
}
