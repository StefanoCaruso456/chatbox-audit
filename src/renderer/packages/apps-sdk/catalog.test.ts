import { describe, expect, it } from 'vitest'
import type { ApprovedApp } from '@/types/apps'
import { createAppsCatalog } from './catalog'

function createApp(overrides: Partial<ApprovedApp> & Pick<ApprovedApp, 'id' | 'name'>): ApprovedApp {
  return {
    id: overrides.id,
    name: overrides.name,
    icon: overrides.icon ?? '/icons/mock.png',
    shortSummary: overrides.shortSummary ?? 'Mock app summary',
    category: overrides.category ?? 'Math & STEM',
    gradeRanges: overrides.gradeRanges ?? ['3-5'],
    launchUrl: overrides.launchUrl ?? `https://example.com/${overrides.id}`,
    launchMode: overrides.launchMode ?? 'iframe',
    integrationMode: overrides.integrationMode ?? 'partner-embed',
    isApproved: overrides.isApproved ?? true,
    tags: overrides.tags ?? ['practice'],
    ...overrides,
  }
}

describe('createAppsCatalog', () => {
  const algebraStudio = createApp({
    id: 'algebra-studio',
    name: 'Algebra Studio',
    tags: ['algebra', 'middle-school'],
    gradeRanges: ['6-8'],
  })
  const readingGarden = createApp({
    id: 'reading-garden',
    name: 'Reading Garden',
    category: 'Literacy & Language',
    gradeRanges: ['Pre-K-2'],
    tags: ['phonics', 'early-learning'],
  })
  const chessTutor = createApp({
    id: 'chess-tutor',
    name: 'Chess Tutor',
    integrationMode: 'runtime',
    runtimeBridge: {
      appId: 'chess.internal',
    },
    tags: ['chess', 'strategy'],
  })

  const catalog = createAppsCatalog({
    apps: [readingGarden, algebraStudio, chessTutor],
    milestoneOrder: ['chess-tutor', 'algebra-studio', 'reading-garden'],
  })

  it('indexes apps by id and runtime id', () => {
    expect(catalog.getById('algebra-studio')).toMatchObject({
      name: 'Algebra Studio',
    })
    expect(catalog.getByRuntimeAppId('chess.internal')).toMatchObject({
      id: 'chess-tutor',
    })
  })

  it('filters and sorts apps for the library experience', () => {
    expect(
      catalog.queryApps({
        search: 'learning',
      })
    ).toEqual([readingGarden])

    expect(
      catalog.queryApps({
        category: 'Math & STEM',
        gradeRange: '6-8',
        activeAppId: 'algebra-studio',
      })
    ).toEqual([algebraStudio])

    expect(
      catalog
        .queryApps({
          activeAppId: 'reading-garden',
        })
        .map((app) => app.id)
    ).toEqual(['reading-garden', 'chess-tutor', 'algebra-studio'])
  })

  it('falls back to a generic launch resolver when a host does not supply one', () => {
    expect(catalog.resolveLaunchRequest('open chess tutor')).toMatchObject({
      kind: 'match',
      app: {
        id: 'chess-tutor',
      },
    })

    expect(catalog.resolveLaunchRequest('launch phonics app')).toMatchObject({
      kind: 'match',
      app: {
        id: 'reading-garden',
      },
    })
  })
})
