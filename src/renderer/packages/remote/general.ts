import { ofetch } from 'ofetch'
import type { Config, CopilotDetail, RemoteConfig, Settings } from '../../../shared/types'
import { getAPIOrigin, getChatboxHeaders } from './core'

export async function checkNeedUpdate(version: string, os: string, config: Config, settings: Settings) {
  type Response = {
    need_update?: boolean
  }

  const res = await ofetch<Response>(`${getAPIOrigin()}/chatbox_need_update/${version}`, {
    method: 'POST',
    retry: 3,
    body: {
      uuid: config.uuid,
      os,
      allowReportingAndTracking: settings.allowReportingAndTracking ? 1 : 0,
    },
  })

  return !!res.need_update
}

export async function listCopilots(lang: string) {
  type Response = {
    data: CopilotDetail[]
  }

  const res = await ofetch<Response>(`${getAPIOrigin()}/api/copilots/list`, {
    method: 'POST',
    retry: 3,
    body: { lang },
  })

  return res.data
}

export async function recordCopilotShare(detail: CopilotDetail) {
  await ofetch(`${getAPIOrigin()}/api/copilots/share-record`, {
    method: 'POST',
    body: {
      detail,
    },
  })
}

export async function getPremiumPrice() {
  type Response = {
    data: {
      price: number
      discount: number
      discountLabel: string
    }
  }

  const res = await ofetch<Response>(`${getAPIOrigin()}/api/premium/price`, {
    retry: 3,
  })

  return res.data
}

export async function getRemoteConfig(config: keyof RemoteConfig) {
  type Response = {
    data: Pick<RemoteConfig, typeof config>
  }

  const res = await ofetch<Response>(`${getAPIOrigin()}/api/remote_config/${config}`, {
    retry: 3,
    headers: await getChatboxHeaders(),
  })

  return res.data
}

export interface DialogConfig {
  markdown: string
  buttons: { label: string; url: string }[]
}

export async function getDialogConfig(params: { uuid: string; language: string; version: string }) {
  type Response = {
    data: DialogConfig | null
  }

  const res = await ofetch<Response>(`${getAPIOrigin()}/api/dialog_config`, {
    method: 'POST',
    retry: 3,
    body: params,
    headers: await getChatboxHeaders(),
  })

  return res.data || null
}
