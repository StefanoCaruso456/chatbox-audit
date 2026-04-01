import { getLogger } from '@/lib/utils'
import platform from '@/platform'
import { USE_BETA_CHATBOX, USE_LOCAL_API, USE_LOCAL_CHATBOX } from '@/variables'
import * as chatboxaiAPI from '../../../shared/request/chatboxai_pool'
import { createAfetch } from '../../../shared/request/request'
import { getOS } from '../navigator'

export const log = getLogger('remote-api')

let afetchInstance: ReturnType<typeof createAfetch> | null = null
let afetchPromise: Promise<ReturnType<typeof createAfetch>> | null = null

export async function getPlatformInfo() {
  return {
    type: platform.type,
    platform: await platform.getPlatform(),
    os: getOS(),
    version: await platform.getVersion(),
  }
}

function initAfetch(): Promise<ReturnType<typeof createAfetch>> {
  if (afetchPromise) {
    return afetchPromise
  }

  afetchPromise = (async () => {
    afetchInstance = createAfetch(await getPlatformInfo())
    return afetchInstance
  })()

  return afetchPromise
}

export async function getAfetch() {
  if (!afetchInstance) {
    return await initAfetch()
  }

  return afetchInstance
}

export function getAPIOrigin() {
  if (USE_LOCAL_API) {
    return 'http://localhost:8002'
  }

  return chatboxaiAPI.getChatboxAPIOrigin()
}

export function getChatboxOrigin() {
  if (USE_LOCAL_CHATBOX) {
    return 'http://localhost:3002'
  }

  if (USE_BETA_CHATBOX) {
    return 'https://beta.chatboxai.app'
  }

  return 'https://chatboxai.app'
}

export async function getChatboxHeaders() {
  const platformInfo = await getPlatformInfo()

  return {
    'CHATBOX-PLATFORM': platformInfo.platform,
    'CHATBOX-PLATFORM-TYPE': platformInfo.type,
    'CHATBOX-VERSION': platformInfo.version,
    'CHATBOX-OS': platformInfo.os,
  }
}
