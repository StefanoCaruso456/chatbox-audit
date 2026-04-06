import { APP_CATEGORY_OPTIONS, type ApprovedApp, gradeRangeMeta, isMultiLevelApp } from '@/types/apps'
import type { AppsSdkCatalog, AppsSdkLaunchResolution, AppsSdkQuery, ChatBridgeAppsSdkConfig } from './types'

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase()
}

function normalizeLaunchLookup(value: string) {
  return value
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function buildSpacedNameVariant(name: string) {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
}

function matchesGradeFilter(app: ApprovedApp, gradeRange: AppsSdkQuery['gradeRange']) {
  if (!gradeRange || gradeRange === 'all') {
    return true
  }

  if (gradeRange === 'Multi-level') {
    return isMultiLevelApp(app)
  }

  return app.gradeRanges.includes(gradeRange)
}

function matchesSearch(app: ApprovedApp, normalizedSearch: string) {
  if (!normalizedSearch) {
    return true
  }

  return (
    app.name.toLowerCase().includes(normalizedSearch) ||
    app.shortSummary.toLowerCase().includes(normalizedSearch) ||
    app.category.toLowerCase().includes(normalizedSearch) ||
    app.gradeRanges.some((range) => {
      const meta = gradeRangeMeta[range]
      return (
        range.toLowerCase().includes(normalizedSearch) ||
        meta.label.toLowerCase().includes(normalizedSearch) ||
        meta.description.toLowerCase().includes(normalizedSearch)
      )
    }) ||
    app.tags.some((tag) => tag.toLowerCase().includes(normalizedSearch))
  )
}

function getDefaultLaunchTerms(app: ApprovedApp) {
  const terms = new Set<string>()
  const addTerm = (value: string | undefined) => {
    if (!value) {
      return
    }

    const normalized = normalizeLaunchLookup(value)
    if (normalized.length >= 3) {
      terms.add(normalized)
    }
  }

  addTerm(app.name)
  addTerm(buildSpacedNameVariant(app.name))
  addTerm(app.id)
  addTerm(app.id.replace(/-/g, ' '))
  app.tags.forEach(addTerm)

  return [...terms]
}

function scoreLaunchTerm(normalizedRequest: string, requestTokens: Set<string>, term: string) {
  if (!term) {
    return 0
  }

  if (normalizedRequest === term) {
    return 1000 + term.length
  }

  if (normalizedRequest.endsWith(term)) {
    return 900 + term.length
  }

  if (normalizedRequest.includes(term)) {
    return 840 + term.length
  }

  const termTokens = term.split(' ').filter(Boolean)
  if (termTokens.length === 0) {
    return 0
  }

  if (termTokens.every((token) => requestTokens.has(token))) {
    return termTokens.length > 1 ? 760 + termTokens.length * 10 : 700 + term.length
  }

  return 0
}

function defaultResolveLaunchRequest(
  apps: readonly ApprovedApp[],
  userRequest: string
): AppsSdkLaunchResolution | null {
  const normalizedRequest = normalizeLaunchLookup(userRequest)
  if (!normalizedRequest) {
    return null
  }

  const requestTokens = new Set(normalizedRequest.split(' ').filter(Boolean))
  const candidates = apps
    .map((app) => {
      let bestScore = 0
      let matchedTerm = ''

      for (const term of getDefaultLaunchTerms(app)) {
        const score = scoreLaunchTerm(normalizedRequest, requestTokens, term)
        if (score > bestScore) {
          bestScore = score
          matchedTerm = term
        }
      }

      return {
        app,
        matchedTerm,
        score: bestScore,
      }
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.app.name.localeCompare(right.app.name))

  if (candidates.length === 0) {
    return null
  }

  const [first, second] = candidates
  if (second && first.score - second.score <= 20 && second.score >= 840) {
    return {
      kind: 'ambiguous',
      apps: [first.app, second.app],
    }
  }

  return {
    kind: 'match',
    app: first.app,
    matchedTerm: first.matchedTerm,
  }
}

export function createAppsCatalog(
  config: Pick<ChatBridgeAppsSdkConfig, 'apps' | 'milestoneOrder' | 'resolveLaunchRequest'>
): AppsSdkCatalog {
  const apps = [...config.apps]
  const byId = new Map(apps.map((app) => [app.id, app] as const))
  const byRuntimeAppId = new Map(
    apps.reduce<[string, ApprovedApp][]>((entries, app) => {
      if (app.runtimeBridge?.appId) {
        entries.push([app.runtimeBridge.appId, app])
      }

      return entries
    }, [])
  )
  const milestoneOrderIndex = new Map((config.milestoneOrder ?? []).map((appId, index) => [appId, index]))
  const resolveLaunchRequest =
    config.resolveLaunchRequest ?? ((userRequest: string) => defaultResolveLaunchRequest(apps, userRequest))

  return {
    apps,
    byId,
    byRuntimeAppId,
    getById(appId) {
      if (!appId) {
        return undefined
      }

      return byId.get(appId)
    },
    getByRuntimeAppId(runtimeAppId) {
      if (!runtimeAppId) {
        return undefined
      }

      return byRuntimeAppId.get(runtimeAppId)
    },
    queryApps(query = {}) {
      const normalizedSearch = normalizeSearchValue(query.search ?? '')
      const activeAppId = query.activeAppId ?? null
      const category = query.category ?? 'all'
      const gradeRange = query.gradeRange ?? 'all'

      return apps
        .filter((app) => {
          const matchesCategory = category === 'all' || app.category === category
          return matchesCategory && matchesGradeFilter(app, gradeRange) && matchesSearch(app, normalizedSearch)
        })
        .sort((left, right) => {
          const leftIsActive = left.id === activeAppId ? 1 : 0
          const rightIsActive = right.id === activeAppId ? 1 : 0
          if (leftIsActive !== rightIsActive) {
            return rightIsActive - leftIsActive
          }

          const leftMilestoneIndex = milestoneOrderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER
          const rightMilestoneIndex = milestoneOrderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER
          if (leftMilestoneIndex !== rightMilestoneIndex) {
            return leftMilestoneIndex - rightMilestoneIndex
          }

          const categoryDelta =
            APP_CATEGORY_OPTIONS.indexOf(left.category) - APP_CATEGORY_OPTIONS.indexOf(right.category)
          if (categoryDelta !== 0) {
            return categoryDelta
          }

          return left.name.localeCompare(right.name)
        })
    },
    resolveLaunchRequest,
  }
}
