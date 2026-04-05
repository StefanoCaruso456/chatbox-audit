import type { ApprovedApp } from '@/types/apps'

const MIRO_HOST_PATTERN = /(^|\.)miro\.com$/i

export function sanitizeAbsoluteUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return ''
    }
    return parsed.toString()
  } catch {
    return ''
  }
}

function extractIframeSrc(value: string) {
  const srcMatch = value.match(/<iframe[^>]+src=(['"])(.*?)\1/i)
  return srcMatch?.[2] ?? value
}

function isMiroHostname(hostname: string) {
  return MIRO_HOST_PATTERN.test(hostname)
}

function getMiroBoardId(pathname: string) {
  const liveEmbedMatch = pathname.match(/\/app\/live-embed\/([^/]+)/i)
  if (liveEmbedMatch?.[1]) {
    return decodeURIComponent(liveEmbedMatch[1])
  }

  const boardMatch = pathname.match(/\/app\/board\/([^/]+)/i)
  if (boardMatch?.[1]) {
    return decodeURIComponent(boardMatch[1])
  }

  return ''
}

export function normalizeMiroLaunchUrl(value: string) {
  const candidate = sanitizeAbsoluteUrl(extractIframeSrc(value))
  if (!candidate) {
    return ''
  }

  const parsed = new URL(candidate)
  if (!isMiroHostname(parsed.hostname)) {
    return ''
  }

  const boardId = getMiroBoardId(parsed.pathname)
  if (!boardId) {
    return ''
  }

  const normalized = new URL(`https://miro.com/app/live-embed/${boardId}/`)
  parsed.searchParams.forEach((paramValue, paramKey) => {
    normalized.searchParams.set(paramKey, paramValue)
  })
  normalized.searchParams.set('autoplay', normalized.searchParams.get('autoplay') || 'true')
  normalized.searchParams.set('usePostAuth', 'true')
  return normalized.toString()
}

export function normalizeLaunchUrl(app: Pick<ApprovedApp, 'id'>, value: string) {
  if (app.id === 'miro') {
    return normalizeMiroLaunchUrl(value)
  }

  return sanitizeAbsoluteUrl(value)
}

export function getLaunchUrlValidationMessage(app: Pick<ApprovedApp, 'id' | 'name'>, value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (normalizeLaunchUrl(app, trimmed)) {
    return null
  }

  if (app.id === 'miro') {
    return 'Paste a Miro board URL, Miro live-embed URL, or Miro iframe snippet.'
  }

  return `Enter a valid ${app.name} http(s) launch URL.`
}

export function getPreviewReferrerPolicy(app: Pick<ApprovedApp, 'id'>) {
  if (app.id === 'miro') {
    return 'no-referrer-when-downgrade'
  }

  return 'strict-origin-when-cross-origin'
}
