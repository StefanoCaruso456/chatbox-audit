const APPROVED_APP_LAUNCH_OVERRIDES_STORAGE_KEY = 'approved-app-launch-overrides:v1'

export function readApprovedAppLaunchOverrides() {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(APPROVED_APP_LAUNCH_OVERRIDES_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function getApprovedAppLaunchOverride(appId: string) {
  return readApprovedAppLaunchOverrides()[appId] ?? ''
}

export function persistApprovedAppLaunchOverride(appId: string, value: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  const next = { ...readApprovedAppLaunchOverrides() }
  if (value) {
    next[appId] = value
  } else {
    delete next[appId]
  }

  window.localStorage.setItem(APPROVED_APP_LAUNCH_OVERRIDES_STORAGE_KEY, JSON.stringify(next))
}
