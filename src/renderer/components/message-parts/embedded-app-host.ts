export type EmbeddedAppHostState = 'idle' | 'loading' | 'ready' | 'error'

export interface EmbeddedAppHostStatusCopy {
  badge: string
  title: string
  description: string
}

export interface EmbeddedAppHostProps {
  appId: string
  appName: string
  appSlug?: string
  src?: string | null
  state?: EmbeddedAppHostState
  title?: string
  subtitle?: string
  description?: string
  iframeTitle?: string
  loadingLabel?: string
  errorTitle?: string
  errorMessage?: string
  height?: number | string
  sandbox?: string
  allow?: string
  className?: string
  onRetry?: () => void
  onOpenInNewTab?: () => void
  onLoad?: () => void
  onError?: () => void
}

export function normalizeEmbeddedAppSrc(src?: string | null): string | null {
  if (typeof src !== 'string') {
    return null
  }

  const trimmed = src.trim()
  if (!trimmed) {
    return null
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return null
  }

  try {
    return new URL(trimmed).toString()
  } catch {
    return null
  }
}

export function getEmbeddedAppStatusCopy(state: EmbeddedAppHostState): EmbeddedAppHostStatusCopy {
  if (state === 'idle') {
    return {
      badge: 'Ready',
      title: 'App ready to launch',
      description: 'The embedded app will appear here once the platform hands off the session.',
    }
  }

  if (state === 'loading') {
    return {
      badge: 'Launching',
      title: 'Loading app experience',
      description: 'The app is booting in a sandboxed iframe and syncing its initial state.',
    }
  }

  if (state === 'error') {
    return {
      badge: 'Blocked',
      title: 'App failed to load',
      description: 'The host could not render the app. You can retry or continue in chat.',
    }
  }

  return {
    badge: 'Active',
    title: 'App session is active',
    description: 'The embedded app is connected and ready for postMessage updates.',
  }
}
