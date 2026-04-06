import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { InMemoryAppAccessRepository } from '../app-access'
import { PlatformAuthService } from '../auth'
import { InMemoryAuthRepository } from '../auth/repository'
import { createRailwayWebApp } from './railway-web-app'

async function createStaticRoot() {
  const directory = await mkdtemp(join(tmpdir(), 'chatbox-railway-web-'))
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Chatbox</title>')
  return directory
}

describe('createRailwayWebApp', () => {
  it('completes platform Google sign-in, validates the session, refreshes it, and logs out', async () => {
    const staticRootDir = await createStaticRoot()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(
          JSON.stringify({
            access_token: 'platform-access-token',
            refresh_token: 'platform-refresh-token',
            expires_in: 3600,
            scope: 'openid email profile',
            token_type: 'Bearer',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          }
        )
      }

      if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
        return new Response(
          JSON.stringify({
            sub: 'google-user-456',
            email: 'stefano@example.com',
            email_verified: true,
            name: 'Stefano Caruso',
            picture: 'https://example.com/avatar.png',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          }
        )
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const app = createRailwayWebApp({
      staticRootDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {
        GOOGLE_OAUTH_CLIENT_ID: 'client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
        GOOGLE_OAUTH_REDIRECT_URI: 'https://chatbox-audit-production.up.railway.app/api/auth/platform/google/callback',
        TUTORMEAI_PLATFORM_GOOGLE_REDIRECT_URI:
          'https://chatbox-audit-production.up.railway.app/api/auth/platform/google/callback',
        TUTORMEAI_AUTH_TOKEN_SECRET: 'test-auth-secret',
      },
    })

    const startResponse = await app.handleRequest(
      new Request(
        'https://chatbox-audit-production.up.railway.app/api/auth/platform/google/start?clientOrigin=https://chatbox-audit.vercel.app'
      )
    )

    expect(startResponse.status).toBe(302)
    expect(startResponse.headers.get('set-cookie')).toContain('tutormeai_platform_google=')

    const authorizationUrl = new URL(startResponse.headers.get('location') ?? '')
    const state = authorizationUrl.searchParams.get('state')
    expect(state).toBeTruthy()

    const callbackResponse = await app.handleRequest(
      new Request(
        `https://chatbox-audit-production.up.railway.app/api/auth/platform/google/callback?state=${encodeURIComponent(state ?? '')}&code=platform-code`,
        {
          headers: {
            cookie: startResponse.headers.get('set-cookie') ?? '',
            'user-agent': 'Vitest',
            'x-forwarded-for': '203.0.113.10',
          },
        }
      )
    )

    expect(callbackResponse.status).toBe(200)
    const callbackHtml = await callbackResponse.text()
    expect(callbackHtml).toContain('TutorMeAI Signed In')
    expect(callbackHtml).toContain('tutormeai.platform-auth.callback')

    const callbackPayload = extractPayloadFromCallbackHtml(callbackHtml)
    expect(callbackPayload.ok).toBe(true)
    if (!callbackPayload.ok) {
      return
    }

    const meResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/auth/me', {
        headers: {
          authorization: `Bearer ${callbackPayload.accessToken}`,
          origin: 'https://chatbox-audit.vercel.app',
        },
      })
    )

    expect(meResponse.status).toBe(200)
    const meBody = (await meResponse.json()) as {
      ok: true
      data: {
        user: {
          userId: string
          email: string | null
          username: string | null
          role: string | null
          onboardingCompletedAt: string | null
        }
      }
    }
    expect(meBody.data.user.userId).toBe('user.google.google.user.456')
    expect(meBody.data.user.email).toBe('stefano@example.com')
    expect(meBody.data.user.username).toBeNull()
    expect(meBody.data.user.role).toBeNull()
    expect(meBody.data.user.onboardingCompletedAt).toBeNull()

    const profileResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/auth/profile', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${callbackPayload.accessToken}`,
          'content-type': 'application/json',
          origin: 'https://chatbox-audit.vercel.app',
        },
        body: JSON.stringify({
          displayName: 'Stefano',
          username: 'stefano.caruso',
          role: 'student',
        }),
      })
    )

    expect(profileResponse.status).toBe(200)
    const profileBody = (await profileResponse.json()) as {
      ok: true
      data: {
        user: {
          username: string | null
          role: string | null
          onboardingCompletedAt: string | null
          displayName: string
        }
      }
    }
    expect(profileBody.data.user.displayName).toBe('Stefano')
    expect(profileBody.data.user.username).toBe('stefano.caruso')
    expect(profileBody.data.user.role).toBe('student')
    expect(profileBody.data.user.onboardingCompletedAt).toBeTruthy()

    const refreshResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/auth/platform/refresh', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://chatbox-audit.vercel.app',
        },
        body: JSON.stringify({
          refreshToken: callbackPayload.refreshToken,
        }),
      })
    )

    expect(refreshResponse.status).toBe(200)
    const refreshBody = (await refreshResponse.json()) as {
      ok: true
      data: {
        accessToken: string
        refreshToken: string
        user: {
          username: string | null
          role: string | null
          onboardingCompletedAt: string | null
        }
      }
    }
    expect(refreshBody.data.accessToken).not.toBe(callbackPayload.accessToken)
    expect(refreshBody.data.refreshToken).not.toBe(callbackPayload.refreshToken)
    expect(refreshBody.data.user.username).toBe('stefano.caruso')
    expect(refreshBody.data.user.role).toBe('student')
    expect(refreshBody.data.user.onboardingCompletedAt).toBeTruthy()

    const logoutResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/auth/platform/logout', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${refreshBody.data.accessToken}`,
          'content-type': 'application/json',
          origin: 'https://chatbox-audit.vercel.app',
        },
        body: JSON.stringify({
          refreshToken: refreshBody.data.refreshToken,
        }),
      })
    )

    expect(logoutResponse.status).toBe(200)

    const afterLogoutResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/auth/me', {
        headers: {
          authorization: `Bearer ${refreshBody.data.accessToken}`,
          origin: 'https://chatbox-audit.vercel.app',
        },
      })
    )

    expect(afterLogoutResponse.status).toBe(401)
  })

  it('starts Google OAuth and exposes a sanitized connection lookup with CORS', async () => {
    const staticRootDir = await createStaticRoot()
    const app = createRailwayWebApp({
      staticRootDir,
      env: {
        GOOGLE_OAUTH_CLIENT_ID: 'client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
        GOOGLE_OAUTH_REDIRECT_URI: 'https://chatbox-audit-production.up.railway.app/api/auth/oauth/callback',
      },
    })

    const startResponse = await app.handleRequest(
      new Request(
        'https://chatbox-audit-production.up.railway.app/api/auth/oauth/google/start?userId=user.student.demo&appId=planner.oauth&clientOrigin=https://chatbox-audit.vercel.app'
      )
    )

    expect(startResponse.status).toBe(302)
    const authorizationUrl = new URL(startResponse.headers.get('location') ?? '')
    expect(authorizationUrl.origin).toBe('https://accounts.google.com')
    const state = authorizationUrl.searchParams.get('state')
    expect(state).toBeTruthy()

    const lookupResponse = await app.handleRequest(
      new Request(
        'https://chatbox-audit-production.up.railway.app/api/auth/oauth?userId=user.student.demo&appId=planner.oauth&provider=google',
        {
          headers: {
            origin: 'https://chatbox-audit.vercel.app',
          },
        }
      )
    )

    expect(lookupResponse.headers.get('access-control-allow-origin')).toBe('https://chatbox-audit.vercel.app')
    const lookupBody = (await lookupResponse.json()) as {
      ok: true
      data: {
        connection: {
          status: string
          hasAccessToken: boolean
          accessTokenCiphertext?: string
        }
      }
    }
    expect(lookupBody.data.connection.status).toBe('pending')
    expect('accessTokenCiphertext' in lookupBody.data.connection).toBe(false)
  })

  it('completes the callback, posts a success payload, and stores a connected status', async () => {
    const staticRootDir = await createStaticRoot()
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          scope: 'openid email profile',
          token_type: 'Bearer',
          id_token: 'header.eyJzdWIiOiJnb29nbGUtdXNlci0xMjMifQ.signature',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    })

    const app = createRailwayWebApp({
      staticRootDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {
        GOOGLE_OAUTH_CLIENT_ID: 'client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
        GOOGLE_OAUTH_REDIRECT_URI: 'https://chatbox-audit-production.up.railway.app/api/auth/oauth/callback',
      },
    })

    const startResponse = await app.handleRequest(
      new Request(
        'https://chatbox-audit-production.up.railway.app/api/auth/oauth/google/start?userId=user.student.demo&appId=planner.oauth&clientOrigin=https://chatbox-audit.vercel.app'
      )
    )

    const authorizationUrl = new URL(startResponse.headers.get('location') ?? '')
    const state = authorizationUrl.searchParams.get('state')
    expect(state).toBeTruthy()

    const callbackResponse = await app.handleRequest(
      new Request(
        `https://chatbox-audit-production.up.railway.app/api/auth/oauth/callback?state=${encodeURIComponent(state ?? '')}&code=planner-code`
      )
    )

    expect(callbackResponse.status).toBe(200)
    const callbackHtml = await callbackResponse.text()
    expect(callbackHtml).toContain('TutorMeAI Planner Connected')
    expect(callbackHtml).toContain('tutormeai.oauth.callback')
    expect(callbackHtml).toContain('https://chatbox-audit.vercel.app')

    const lookupResponse = await app.handleRequest(
      new Request(
        'https://chatbox-audit-production.up.railway.app/api/auth/oauth?userId=user.student.demo&appId=planner.oauth&provider=google',
        {
          headers: {
            origin: 'https://chatbox-audit.vercel.app',
          },
        }
      )
    )

    const lookupBody = (await lookupResponse.json()) as {
      ok: true
      data: {
        connection: {
          status: string
          hasAccessToken: boolean
          hasRefreshToken: boolean
          externalAccountId: string | null
        }
      }
    }

    expect(lookupBody.data.connection.status).toBe('connected')
    expect(lookupBody.data.connection.hasAccessToken).toBe(true)
    expect(lookupBody.data.connection.hasRefreshToken).toBe(true)
    expect(lookupBody.data.connection.externalAccountId).toBe('google-user-123')
  })

  it('lists registered students for reviewer assignment and persists assigned students on the platform profile', async () => {
    const staticRootDir = await createStaticRoot()
    const repository = new InMemoryAuthRepository()
    const authService = new PlatformAuthService(repository, {
      now: () => '2026-04-05T05:00:00.000Z',
    })

    await repository.saveUser({
      userId: 'student.alpha',
      email: 'alpha@example.com',
      username: 'alpha.student',
      displayName: 'Alpha Student',
      role: 'student',
      onboardingCompletedAt: '2026-04-05T05:00:00.000Z',
      metadata: {},
      createdAt: '2026-04-05T05:00:00.000Z',
      updatedAt: '2026-04-05T05:00:00.000Z',
      deletedAt: null,
    })
    await repository.saveUser({
      userId: 'student.beta',
      email: 'beta@example.com',
      username: 'beta.student',
      displayName: 'Beta Student',
      role: 'student',
      onboardingCompletedAt: '2026-04-05T05:00:00.000Z',
      metadata: {},
      createdAt: '2026-04-05T05:00:00.000Z',
      updatedAt: '2026-04-05T05:00:00.000Z',
      deletedAt: null,
    })
    await repository.saveUser({
      userId: 'teacher.user',
      email: 'teacher@example.com',
      username: 'teacher.demo',
      displayName: 'Teacher Demo',
      role: 'teacher',
      onboardingCompletedAt: '2026-04-05T05:00:00.000Z',
      metadata: {},
      createdAt: '2026-04-05T05:00:00.000Z',
      updatedAt: '2026-04-05T05:00:00.000Z',
      deletedAt: null,
    })

    const teacherSession = await authService.issuePlatformSession({ userId: 'teacher.user' })
    expect(teacherSession.ok).toBe(true)
    if (!teacherSession.ok) {
      return
    }

    const app = createRailwayWebApp({
      staticRootDir,
      repository,
      now: () => '2026-04-05T05:00:00.000Z',
    })

    const studentsResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/auth/students', {
        headers: {
          authorization: `Bearer ${teacherSession.value.sessionToken}`,
          origin: 'https://chatbox-audit.vercel.app',
        },
      })
    )

    expect(studentsResponse.status).toBe(200)
    const studentsBody = (await studentsResponse.json()) as {
      ok: true
      data: {
        students: Array<{
          userId: string
          displayName: string
        }>
      }
    }
    expect(studentsBody.data.students.map((student) => student.userId)).toEqual(['student.alpha', 'student.beta'])

    const profileResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/auth/profile', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${teacherSession.value.sessionToken}`,
          'content-type': 'application/json',
          origin: 'https://chatbox-audit.vercel.app',
        },
        body: JSON.stringify({
          displayName: 'Teacher Demo',
          username: 'teacher.demo',
          role: 'teacher',
          students: ['student.beta'],
        }),
      })
    )

    expect(profileResponse.status).toBe(200)
    const profileBody = (await profileResponse.json()) as {
      ok: true
      data: {
        user: {
          role: string | null
          students: string[]
        }
      }
    }
    expect(profileBody.data.user.role).toBe('teacher')
    expect(profileBody.data.user.students).toEqual(['student.beta'])

    const savedTeacher = await repository.getUserById('teacher.user')
    expect(savedTeacher?.metadata).toMatchObject({
      students: ['student.beta'],
    })
  })

  it('lets a teacher approve a student app request and makes the updated request visible to the student immediately', async () => {
    const staticRootDir = await createStaticRoot()
    const repository = new InMemoryAuthRepository()
    const appAccessRepository = new InMemoryAppAccessRepository()
    const authService = new PlatformAuthService(repository, {
      now: () => '2026-04-05T05:00:00.000Z',
    })

    await repository.saveUser({
      userId: 'student.user',
      email: 'student@example.com',
      username: 'student.demo',
      displayName: 'Student Demo',
      role: 'student',
      onboardingCompletedAt: '2026-04-05T05:00:00.000Z',
      metadata: {},
      createdAt: '2026-04-05T05:00:00.000Z',
      updatedAt: '2026-04-05T05:00:00.000Z',
      deletedAt: null,
    })
    await repository.saveUser({
      userId: 'teacher.user',
      email: 'teacher@example.com',
      username: 'teacher.demo',
      displayName: 'Teacher Demo',
      role: 'teacher',
      onboardingCompletedAt: '2026-04-05T05:00:00.000Z',
      metadata: {
        students: ['student.user'],
      },
      createdAt: '2026-04-05T05:00:00.000Z',
      updatedAt: '2026-04-05T05:00:00.000Z',
      deletedAt: null,
    })
    await repository.saveUser({
      userId: 'other.teacher',
      email: 'other-teacher@example.com',
      username: 'other.teacher',
      displayName: 'Other Teacher',
      role: 'teacher',
      onboardingCompletedAt: '2026-04-05T05:00:00.000Z',
      metadata: {
        students: ['student.other'],
      },
      createdAt: '2026-04-05T05:00:00.000Z',
      updatedAt: '2026-04-05T05:00:00.000Z',
      deletedAt: null,
    })

    const studentSession = await authService.issuePlatformSession({ userId: 'student.user' })
    const teacherSession = await authService.issuePlatformSession({ userId: 'teacher.user' })
    const otherTeacherSession = await authService.issuePlatformSession({ userId: 'other.teacher' })
    expect(studentSession.ok).toBe(true)
    expect(teacherSession.ok).toBe(true)
    expect(otherTeacherSession.ok).toBe(true)
    if (!studentSession.ok || !teacherSession.ok || !otherTeacherSession.ok) {
      return
    }

    const app = createRailwayWebApp({
      staticRootDir,
      repository,
      appAccessRepository,
      now: () => '2026-04-05T05:00:00.000Z',
    })

    const requestResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/app-access/requests', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${studentSession.value.sessionToken}`,
          'content-type': 'application/json',
          origin: 'https://chatbox-audit.vercel.app',
        },
        body: JSON.stringify({
          appId: 'chess-tutor',
          appName: 'Chess Tutor',
        }),
      })
    )

    expect(requestResponse.status).toBe(200)
    const requestBody = (await requestResponse.json()) as {
      ok: true
      data: {
        access: 'pending'
        request: {
          appAccessRequestId: string
          studentUserId: string
          appId: string
        }
      }
    }
    expect(requestBody.data.access).toBe('pending')
    expect(requestBody.data.request.studentUserId).toBe('student.user')
    expect(requestBody.data.request.appId).toBe('chess-tutor')

    const pendingResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/app-access/requests/pending', {
        headers: {
          authorization: `Bearer ${teacherSession.value.sessionToken}`,
          origin: 'https://chatbox-audit.vercel.app',
        },
      })
    )

    expect(pendingResponse.status).toBe(200)
    const pendingBody = (await pendingResponse.json()) as {
      ok: true
      data: {
        requests: Array<{
          appAccessRequestId: string
          studentDisplayName: string
          appName: string
        }>
      }
    }
    expect(pendingBody.data.requests).toHaveLength(1)
    expect(pendingBody.data.requests[0].studentDisplayName).toBe('Student Demo')
    expect(pendingBody.data.requests[0].appName).toBe('Chess Tutor')

    const otherPendingResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/app-access/requests/pending', {
        headers: {
          authorization: `Bearer ${otherTeacherSession.value.sessionToken}`,
          origin: 'https://chatbox-audit.vercel.app',
        },
      })
    )

    expect(otherPendingResponse.status).toBe(200)
    const otherPendingBody = (await otherPendingResponse.json()) as {
      ok: true
      data: {
        requests: Array<unknown>
      }
    }
    expect(otherPendingBody.data.requests).toHaveLength(0)

    const unauthorizedDecisionResponse = await app.handleRequest(
      new Request(
        `https://chatbox-audit-production.up.railway.app/api/app-access/requests/${requestBody.data.request.appAccessRequestId}/decision`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${otherTeacherSession.value.sessionToken}`,
            'content-type': 'application/json',
            origin: 'https://chatbox-audit.vercel.app',
          },
          body: JSON.stringify({
            status: 'approved',
          }),
        }
      )
    )

    expect(unauthorizedDecisionResponse.status).toBe(403)

    const approveResponse = await app.handleRequest(
      new Request(
        `https://chatbox-audit-production.up.railway.app/api/app-access/requests/${requestBody.data.request.appAccessRequestId}/decision`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${teacherSession.value.sessionToken}`,
            'content-type': 'application/json',
            origin: 'https://chatbox-audit.vercel.app',
          },
          body: JSON.stringify({
            status: 'approved',
          }),
        }
      )
    )

    expect(approveResponse.status).toBe(200)
    const approveBody = (await approveResponse.json()) as {
      ok: true
      data: {
        request: {
          status: 'approved'
          decidedByUserId: string | null
          decidedByDisplayName: string | null
        }
      }
    }
    expect(approveBody.data.request.status).toBe('approved')
    expect(approveBody.data.request.decidedByUserId).toBe('teacher.user')
    expect(approveBody.data.request.decidedByDisplayName).toBe('Teacher Demo')

    const myRequestResponse = await app.handleRequest(
      new Request(
        'https://chatbox-audit-production.up.railway.app/api/app-access/requests/mine?appId=chess-tutor',
        {
          headers: {
            authorization: `Bearer ${studentSession.value.sessionToken}`,
            origin: 'https://chatbox-audit.vercel.app',
          },
        }
      )
    )

    expect(myRequestResponse.status).toBe(200)
    const myRequestBody = (await myRequestResponse.json()) as {
      ok: true
      data: {
        request: {
          status: 'approved'
          decidedByUserId: string | null
        } | null
      }
    }
    expect(myRequestBody.data.request?.status).toBe('approved')
    expect(myRequestBody.data.request?.decidedByUserId).toBe('teacher.user')
  })

  it('blocks student app requests until an assigned teacher or administrator exists', async () => {
    const staticRootDir = await createStaticRoot()
    const repository = new InMemoryAuthRepository()
    const appAccessRepository = new InMemoryAppAccessRepository()
    const authService = new PlatformAuthService(repository, {
      now: () => '2026-04-05T05:00:00.000Z',
    })

    await repository.saveUser({
      userId: 'student.user',
      email: 'student@example.com',
      username: 'student.demo',
      displayName: 'Student Demo',
      role: 'student',
      onboardingCompletedAt: '2026-04-05T05:00:00.000Z',
      metadata: {},
      createdAt: '2026-04-05T05:00:00.000Z',
      updatedAt: '2026-04-05T05:00:00.000Z',
      deletedAt: null,
    })

    const studentSession = await authService.issuePlatformSession({ userId: 'student.user' })
    expect(studentSession.ok).toBe(true)
    if (!studentSession.ok) {
      return
    }

    const app = createRailwayWebApp({
      staticRootDir,
      repository,
      appAccessRepository,
      now: () => '2026-04-05T05:00:00.000Z',
    })

    const requestResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/app-access/requests', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${studentSession.value.sessionToken}`,
          'content-type': 'application/json',
          origin: 'https://chatbox-audit.vercel.app',
        },
        body: JSON.stringify({
          appId: 'chess-tutor',
          appName: 'Chess Tutor',
        }),
      })
    )

    expect(requestResponse.status).toBe(403)
    const requestBody = (await requestResponse.json()) as {
      ok: false
      error: {
        message: string
      }
    }
    expect(requestBody.error.message).toContain('No assigned teacher or administrator')
  })

  it('proxies Chess.com diagram data and the emboard shell through the Railway backend', async () => {
    const staticRootDir = await createStaticRoot()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === 'https://www.chess.com/callback/diagram/10477955') {
        return new Response(
          JSON.stringify({
            id: 10477955,
            toUserId: null,
            clubId: null,
            type: 'chessGame',
            boardOptions: {
              coordinates: 'inside',
              flipBoard: false,
              colorScheme: 'bases',
              pieceStyle: 'neo_wood',
            },
            themeIds: {},
            setup: [
              {
                pgn: '[Event "Example"]\n\n1. d4 Nf6 *',
                nodeLimits: {
                  focusNode: 0,
                  beginNode: 0,
                  endNode: 0,
                },
                tags: {
                  white: 'White',
                  black: 'Black',
                  event: 'Example',
                },
                variant: 'Chess',
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          }
        )
      }

      if (url === 'https://www.chess.com/emboard?id=10477955&_height=640') {
        return new Response('<html><head></head><body>shell</body></html>', {
          status: 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
          },
        })
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const app = createRailwayWebApp({
      staticRootDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    const diagramResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/chess-com/diagram/10477955', {
        headers: {
          origin: 'https://chatbox-audit.vercel.app',
        },
      })
    )

    expect(diagramResponse.status).toBe(200)
    expect(diagramResponse.headers.get('access-control-allow-origin')).toBe('https://chatbox-audit.vercel.app')
    const diagramBody = (await diagramResponse.json()) as {
      ok: true
      data: {
        id: number
        setup: Array<{ pgn: string }>
      }
    }
    expect(diagramBody.data.id).toBe(10477955)
    expect(diagramBody.data.setup[0]?.pgn).toContain('1. d4 Nf6')

    const shellResponse = await app.handleRequest(
      new Request('https://chatbox-audit-production.up.railway.app/api/chess-com/emboard-shell/10477955', {
        headers: {
          origin: 'https://chatbox-audit.vercel.app',
        },
      })
    )

    expect(shellResponse.status).toBe(200)
    expect(shellResponse.headers.get('access-control-allow-origin')).toBe('https://chatbox-audit.vercel.app')
    expect(await shellResponse.text()).toContain('<body>shell</body>')
  })
})

function extractPayloadFromCallbackHtml(html: string) {
  const payloadMatch = html.match(/const payload = (.*?);\n/s)
  if (!payloadMatch?.[1]) {
    throw new Error('Expected callback HTML to include an inline payload.')
  }

  return JSON.parse(payloadMatch[1]) as
    | {
        type: 'tutormeai.platform-auth.callback'
        ok: true
        accessToken: string
        refreshToken: string
      }
    | {
        type: 'tutormeai.platform-auth.callback'
        ok: false
        code: string
        message: string
      }
}
