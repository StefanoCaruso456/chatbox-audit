import { shell } from 'electron'
import log from 'electron-log/main'

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function normalizeFilePathname(url: URL): string {
  return decodeURIComponent(url.pathname).replace(/\/+$/, '')
}

export function parseTrustedExternalUrl(rawUrl: string): URL | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null
  }

  try {
    const parsedUrl = new URL(rawUrl.trim())
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsedUrl.protocol)) {
      return null
    }
    return parsedUrl
  } catch {
    return null
  }
}

export function isTrustedRendererNavigation(targetUrl: string, rendererUrl?: string): boolean {
  try {
    const parsedTargetUrl = new URL(targetUrl)

    if (!rendererUrl) {
      return false
    }

    const parsedRendererUrl = new URL(rendererUrl)

    if (parsedTargetUrl.protocol === 'file:' || parsedRendererUrl.protocol === 'file:') {
      return (
        parsedTargetUrl.protocol === 'file:' &&
        parsedRendererUrl.protocol === 'file:' &&
        normalizeFilePathname(parsedTargetUrl) === normalizeFilePathname(parsedRendererUrl)
      )
    }

    return parsedTargetUrl.origin === parsedRendererUrl.origin
  } catch {
    return false
  }
}

export async function openTrustedExternalUrl(rawUrl: string, source: string): Promise<boolean> {
  const parsedUrl = parseTrustedExternalUrl(rawUrl)

  if (!parsedUrl) {
    log.warn(`[security] Blocked external URL from ${source}:`, rawUrl)
    return false
  }

  try {
    await shell.openExternal(parsedUrl.toString())
    return true
  } catch (error) {
    log.warn(`[security] Failed to open external URL from ${source}:`, rawUrl, error)
    return false
  }
}
