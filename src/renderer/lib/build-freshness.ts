const BUILD_CHECK_MIN_INTERVAL_MS = 30_000

function looksLikeEntryBundle(pathname: string) {
  const segments = pathname.split('/')
  const basename = segments[segments.length - 1] ?? ''
  return basename === 'index.js' || basename.startsWith('index.') || basename.startsWith('index-')
}

function normalizeScriptPath(scriptUrl: string, baseUrl: string) {
  try {
    const parsed = new URL(scriptUrl, baseUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    if (!looksLikeEntryBundle(parsed.pathname)) {
      return null
    }
    return parsed.pathname
  } catch {
    return null
  }
}

export function extractEntryBundlePathFromHtml(html: string, baseUrl: string): string | null {
  const scriptPattern = /<script\b[^>]*\bsrc=(['"])([^"'<>]+)\1[^>]*>/gi
  let match: RegExpExecArray | null = null
  let lastMatchingPath: string | null = null

  while ((match = scriptPattern.exec(html)) !== null) {
    const normalizedPath = normalizeScriptPath(match[2], baseUrl)
    if (normalizedPath) {
      lastMatchingPath = normalizedPath
    }
  }

  return lastMatchingPath
}

export function extractEntryBundlePathFromDocument(doc: Document): string | null {
  const scripts = Array.from(doc.querySelectorAll<HTMLScriptElement>('script[src]'))

  for (const script of scripts) {
    const src = script.getAttribute('src')
    if (!src) {
      continue
    }

    const normalizedPath = normalizeScriptPath(src, doc.baseURI)
    if (normalizedPath) {
      return normalizedPath
    }
  }

  return null
}

export function shouldInstallBuildFreshnessWatcher(win: Window = window): boolean {
  if (win.top !== win) {
    return false
  }

  const protocol = win.location.protocol
  return protocol === 'http:' || protocol === 'https:'
}

type ProbeOptions = {
  doc?: Document
  fetchImpl?: typeof fetch
  htmlUrl?: string
  reload?: () => void
}

export async function probeForNewerBuild(options: ProbeOptions = {}): Promise<boolean> {
  const doc = options.doc ?? document
  const fetchImpl = options.fetchImpl ?? fetch
  const reload = options.reload ?? (() => window.location.reload())
  const currentBundlePath = extractEntryBundlePathFromDocument(doc)

  if (!currentBundlePath) {
    return false
  }

  const baseUrl = options.htmlUrl ?? new URL('/', window.location.href).toString()
  const probeUrl = new URL(baseUrl)
  probeUrl.searchParams.set('chatbridge_build_probe', Date.now().toString())

  const response = await fetchImpl(probeUrl.toString(), {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      Accept: 'text/html',
    },
  })

  if (!response.ok) {
    return false
  }

  const latestBundlePath = extractEntryBundlePathFromHtml(await response.text(), response.url || probeUrl.toString())
  if (!latestBundlePath || latestBundlePath === currentBundlePath) {
    return false
  }

  reload()
  return true
}

type InstallWatcherOptions = {
  minIntervalMs?: number
  fetchImpl?: typeof fetch
  reload?: () => void
}

export function installBuildFreshnessWatcher(options: InstallWatcherOptions = {}) {
  if (!shouldInstallBuildFreshnessWatcher(window)) {
    return () => {}
  }

  const minIntervalMs = options.minIntervalMs ?? BUILD_CHECK_MIN_INTERVAL_MS
  let destroyed = false
  let inFlight = false
  let lastCheckedAt = 0

  const maybeCheck = async (force = false) => {
    if (destroyed || inFlight) {
      return
    }

    const now = Date.now()
    if (!force && now - lastCheckedAt < minIntervalMs) {
      return
    }

    inFlight = true
    lastCheckedAt = now

    try {
      await probeForNewerBuild({
        fetchImpl: options.fetchImpl,
        reload: options.reload,
      })
    } catch {
      // Network failures or transient HTML parsing issues should never break the app shell.
    } finally {
      inFlight = false
    }
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void maybeCheck(false)
    }
  }

  const handleFocus = () => {
    void maybeCheck(false)
  }

  void maybeCheck(true)

  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('focus', handleFocus)

  return () => {
    destroyed = true
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('focus', handleFocus)
  }
}
