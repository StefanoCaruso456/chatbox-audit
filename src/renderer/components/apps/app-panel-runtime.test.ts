/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import { getApprovedAppById } from '@/data/approvedApps'
import { buildSidebarEmbeddedAppRuntime, resolveAppPanelLaunchUrl } from './app-panel-runtime'

describe('app panel runtime helpers', () => {
  it('resolves internal app routes against the current web origin', () => {
    expect(resolveAppPanelLaunchUrl('/embedded-apps/chess')).toBe(`${window.location.origin}/embedded-apps/chess`)
  })

  it('adds a cache-busting launch token for internal app routes', () => {
    expect(resolveAppPanelLaunchUrl('/embedded-apps/chess', { cacheBustKey: 'runtime-123' })).toBe(
      `${window.location.origin}/embedded-apps/chess?chatbridge_panel=1&chatbridge_launch=runtime-123`
    )
  })

  it('keeps third-party vendor urls stable when resolving panel launches', () => {
    expect(resolveAppPanelLaunchUrl('https://www.duolingo.com/', { cacheBustKey: 'runtime-123' })).toBe(
      'https://www.duolingo.com/'
    )
  })

  it('builds a live embedded runtime config for TutorMeAI apps', () => {
    const app = getApprovedAppById('flashcards-coach')
    expect(app).toBeDefined()
    if (!app) {
      return
    }

    const runtime = buildSidebarEmbeddedAppRuntime(app, 'https://example.com/embedded-apps/flashcards', 2)
    expect(runtime).toMatchObject({
      expectedOrigin: 'https://example.com',
      conversationId: 'conversation.sidebar.flashcards-coach',
      appSessionId: 'app-session.sidebar.flashcards-coach',
      bootstrap: {
        authState: 'not-required',
        initialState: {
          toolArguments: {
            topic: 'fractions',
          },
        },
      },
      pendingInvocation: {
        toolName: 'flashcards.start-session',
        arguments: {
          topic: 'fractions',
        },
      },
    })
  })

  it('does not fabricate embedded runtime state for approved library apps', () => {
    const app = getApprovedAppById('canvas-student')
    expect(app).toBeDefined()
    if (!app) {
      return
    }

    expect(buildSidebarEmbeddedAppRuntime(app, 'https://www.instructure.com/canvas', 1)).toBeNull()
  })

  it('avoids the live runtime path when the launch url is not a web origin', () => {
    const app = getApprovedAppById('chess-tutor')
    expect(app).toBeDefined()
    if (!app) {
      return
    }

    expect(buildSidebarEmbeddedAppRuntime(app, 'file:///tmp/app#index', 1)).toBeNull()
  })
})
