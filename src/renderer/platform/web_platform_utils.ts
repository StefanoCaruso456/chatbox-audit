import { v4 as uuidv4 } from 'uuid'
import platform from '@/platform'
import * as remote from '../packages/remote'

export async function parseUrlContentFree(url: string) {
  const result = await remote.parseUserLinkFree({ url })
  const key = `parseUrl-` + uuidv4()
  await platform.setStoreBlob(key, result.text)
  return { key, title: result.title }
}
