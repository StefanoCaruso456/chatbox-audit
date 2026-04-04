/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import { getApprovedAppById } from '@/data/approvedApps'
import { buildSidebarEmbeddedAppRuntime, resolveAppPanelLaunchUrl, resolveApprovedAppPanelRuntime } from './app-panel-runtime'

describe('app panel runtime helpers', () => {
  it('resolves internal app routes against the current web origin', () => {
    expect(resolveAppPanelLaunchUrl('/embedded-apps/chess')).toBe(`${window.location.origin}/embedded-apps/chess`)
  })

  it('adds a cache-busting launch token for internal app routes', () => {
    expect(resolveAppPanelLaunchUrl('/embedded-apps/chess', { cacheBustKey: 'runtime-123' })).toBe(
      `${window.location.origin}/embedded-apps/chess?chatbridge_panel=1&chatbridge_launch=runtime-123`
    )
  })

  it('passes direct iframe launch arguments through the sidebar url for same-origin apps', () => {
    expect(
      resolveAppPanelLaunchUrl('/embedded-apps/flashcards', {
        cacheBustKey: 'runtime-123',
        launchArguments: {
          topic: 'fractions',
          review: true,
        },
      })
    ).toBe(
      `${window.location.origin}/embedded-apps/flashcards?chatbridge_panel=1&chatbridge_launch=runtime-123&topic=fractions&review=true`
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

  it('prefers the active conversation runtime for TutorMeAI apps when a live session exists', () => {
    const app = getApprovedAppById('chess-tutor')
    expect(app).toBeDefined()
    if (!app) {
      return
    }

    const runtime = resolveApprovedAppPanelRuntime(
      app,
      'http://localhost:3000/embedded-apps/chess?chatbridge_panel=1&chatbridge_launch=test',
      4,
      {
        sessionId: 'session.chess',
        session: {
          id: 'session.chess',
          name: 'Chess Session',
          messages: [
            {
              id: 'assistant.1',
              role: 'assistant',
              content: '',
              contentParts: [
                {
                  type: 'embedded-app',
                  appId: 'chess.internal',
                  appName: 'Chess Tutor',
                  appSessionId: 'app-session.chess.live',
                  sourceUrl: 'http://localhost:3000/embedded-apps/chess',
                  status: 'loading',
                  bridge: {
                    expectedOrigin: 'http://localhost:3000',
                    conversationId: 'conversation.live',
                    appSessionId: 'app-session.chess.live',
                    handshakeToken: 'runtime.live',
                    heartbeatTimeoutMs: 30000,
                    bootstrap: {
                      launchReason: 'chat-tool',
                      authState: 'connected',
                      grantedPermissions: ['session:write', 'tool:invoke'],
                      initialState: {
                        fen: 'startpos',
                      },
                      availableTools: [],
                    },
                    pendingInvocation: {
                      toolCallId: 'tool-call.live',
                      toolName: 'chess.launch-game',
                      arguments: {
                        mode: 'practice',
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      }
    )

    expect(runtime).toMatchObject({
      expectedOrigin: 'http://localhost:3000',
      conversationId: 'conversation.live',
      appSessionId: 'app-session.chess.live',
      handshakeToken: 'runtime.live',
      pendingInvocation: {
        toolCallId: 'tool-call.live',
      },
    })
  })

  it('reuses the latest recoverable conversation runtime instead of falling back to a fresh sidebar session', () => {
    const app = getApprovedAppById('chess-tutor')
    expect(app).toBeDefined()
    if (!app) {
      return
    }

    const runtime = resolveApprovedAppPanelRuntime(
      app,
      'http://localhost:3000/embedded-apps/chess?chatbridge_panel=1&chatbridge_launch=test',
      5,
      {
        sessionId: 'session.chess.recoverable',
        session: {
          id: 'session.chess.recoverable',
          name: 'Chess Session Recoverable',
          messages: [
            {
              id: 'assistant.1',
              role: 'assistant',
              content: '',
              contentParts: [
                {
                  type: 'embedded-app',
                  appId: 'chess.internal',
                  appName: 'Chess Tutor',
                  appSessionId: 'app-session.chess.live',
                  sourceUrl: 'http://localhost:3000/embedded-apps/chess',
                  status: 'error',
                  summary: 'Played d4. Black to move.',
                  bridge: {
                    expectedOrigin: 'http://localhost:3000',
                    conversationId: 'conversation.live',
                    appSessionId: 'app-session.chess.live',
                    handshakeToken: 'runtime.live',
                    heartbeatTimeoutMs: 30000,
                    bootstrap: {
                      launchReason: 'chat-tool',
                      authState: 'connected',
                      grantedPermissions: ['session:write', 'tool:invoke'],
                      initialState: {
                        fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
                        turn: 'b',
                        moveCount: 1,
                        lastMove: 'd4',
                      },
                      availableTools: [],
                    },
                  },
                  errorMessage: 'The chess board changed before the requested move could be applied.',
                },
              ],
            },
          ],
        },
      }
    )

    expect(runtime).toMatchObject({
      conversationId: 'conversation.live',
      appSessionId: 'app-session.chess.live',
      handshakeToken: 'runtime.live',
      bootstrap: {
        initialState: {
          fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
          lastMove: 'd4',
        },
      },
    })
  })
})
