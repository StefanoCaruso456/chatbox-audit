import { createHash, createHmac, randomBytes } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { IdentifierSchema } from '@shared/contracts/v1'
import { OriginSchema, normalizeOrigin } from '@shared/contracts/v1/shared'
import { TutorMeAIUserRoleSchema, type TutorMeAIUserRole } from '@shared/types/settings'
import { z } from 'zod'
import { failureResult, toApiErrorBody } from '../errors'
import {
  createRuntimeAuthRepository,
  createGoogleOAuthAdapter,
  createHashedTokenCipher,
  OAuthAuthService,
  PlatformAuthService,
  fetchGoogleUserProfile,
  loadGoogleOAuthRuntimeConfig,
  toPublicOAuthConnectionRecord,
  type AuthRepository,
  type GoogleUserProfile,
  type OAuthAuthErrorCode,
  type OAuthProviderConfig,
  type PlatformAuthErrorCode,
  type UserRecord,
} from '../auth'

const DEFAULT_STATIC_ROOT_DIR = resolve(process.cwd(), 'release/app/dist/renderer')
const DEFAULT_ALLOWED_ORIGINS = ['https://chatbox-audit.vercel.app', 'http://localhost:1212', 'http://localhost:3000']
const GOOGLE_START_PATH = '/api/auth/oauth/google/start'
const GOOGLE_CALLBACK_PATH = '/api/auth/oauth/callback'
const OAUTH_CONNECTION_PATH = '/api/auth/oauth'
const PLATFORM_GOOGLE_START_PATH = '/api/auth/platform/google/start'
const PLATFORM_GOOGLE_CALLBACK_PATH = '/api/auth/platform/google/callback'
const PLATFORM_ME_PATH = '/api/auth/me'
const PLATFORM_PROFILE_PATH = '/api/auth/profile'
const PLATFORM_REFRESH_PATH = '/api/auth/platform/refresh'
const PLATFORM_LOGOUT_PATH = '/api/auth/platform/logout'
const PLATFORM_GOOGLE_COOKIE_NAME = 'tutormeai_platform_google'

const OAuthConnectionQuerySchema = z.object({
  userId: IdentifierSchema.optional(),
  appId: IdentifierSchema.optional(),
  provider: z.string().trim().min(1).optional(),
  oauthConnectionId: z.string().trim().min(1).optional(),
})

const PlatformRefreshBodySchema = z.object({
  refreshToken: z.string().trim().min(1),
})

const PlatformLogoutBodySchema = z.object({
  refreshToken: z.string().trim().min(1).optional(),
})

const PlatformUsernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u, {
    message: 'Username must use lowercase letters, numbers, dots, underscores, or hyphens.',
  })

const PlatformProfileBodySchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  username: PlatformUsernameSchema,
  role: TutorMeAIUserRoleSchema,
})

type CallbackPayload =
  | {
      type: 'tutormeai.oauth.callback'
      ok: true
      appId: string
      provider: string
      userId: string
      status: 'connected'
    }
  | {
      type: 'tutormeai.oauth.callback'
      ok: false
      code: string
      message: string
    }

type PlatformCallbackPayload =
  | {
      type: 'tutormeai.platform-auth.callback'
      ok: true
      accessToken: string
      refreshToken: string
      user: PublicPlatformUser
    }
  | {
      type: 'tutormeai.platform-auth.callback'
      ok: false
      code: string
      message: string
    }

interface PublicPlatformUser {
  userId: string
  email: string | null
  username: string | null
  displayName: string
  role: TutorMeAIUserRole | null
  pictureUrl: string | null
  onboardingCompletedAt: string | null
}

interface PlatformGoogleCookiePayload {
  clientOrigin: string
  state: string
  codeVerifier: string
  createdAt: string
}

export interface RailwayWebAppOptions {
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  now?: () => string
  repository?: AuthRepository
  staticRootDir?: string
}

export interface RailwayWebApp {
  handleRequest(request: Request): Promise<Response>
}

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

export function createRailwayWebApp(options: RailwayWebAppOptions = {}): RailwayWebApp {
  const env = options.env ?? process.env
  const now = options.now ?? (() => new Date().toISOString())
  const fetchImpl = options.fetchImpl ?? fetch
  const repository = options.repository ?? createRuntimeAuthRepository(env)
  const staticRootDir = resolve(options.staticRootDir ?? DEFAULT_STATIC_ROOT_DIR)
  const indexFile = join(staticRootDir, 'index.html')
  const googleConfig = loadGoogleOAuthRuntimeConfig(env)
  const tokenSecret =
    normalizeNonEmptyString(env.TUTORMEAI_AUTH_TOKEN_SECRET) ??
    normalizeNonEmptyString(env.AUTH_TOKEN_CIPHER_SECRET) ??
    googleConfig?.clientSecret
  const oauthService = new OAuthAuthService(repository, {
    now,
    tokenCipher: tokenSecret ? createHashedTokenCipher(tokenSecret) : undefined,
  })
  const platformAuthService = new PlatformAuthService(repository, {
    now,
    sessionTtlMs: parsePositiveInteger(env.TUTORMEAI_PLATFORM_SESSION_TTL_MS),
    refreshTtlMs: parsePositiveInteger(env.TUTORMEAI_PLATFORM_REFRESH_TTL_MS),
  })
  const googleAdapter = googleConfig
    ? createGoogleOAuthAdapter({
        clientSecret: googleConfig.clientSecret,
        fetchImpl,
        now: () => Date.parse(now()),
      })
    : null

  return {
    async handleRequest(request) {
      const url = new URL(request.url)

      if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/auth/')) {
        return withCors(request, new Response(null, { status: 204 }), env)
      }

      if (url.pathname === '/health') {
        return jsonResponse(existsSync(indexFile) ? 200 : 503, {
          ready: existsSync(indexFile),
        })
      }

      if (url.pathname === PLATFORM_GOOGLE_START_PATH && request.method === 'GET') {
        return await handlePlatformGoogleStart(request, {
          env,
          googleConfig,
          tokenSecret,
          now,
        })
      }

      if (url.pathname === PLATFORM_GOOGLE_CALLBACK_PATH && request.method === 'GET') {
        return await handlePlatformGoogleCallback(request, {
          env,
          googleConfig,
          googleAdapter,
          fetchImpl,
          now,
          platformAuthService,
          repository,
          tokenSecret,
        })
      }

      if (url.pathname === PLATFORM_ME_PATH && request.method === 'GET') {
        return withCors(request, await handleGetPlatformProfile(request, { platformAuthService, repository }), env)
      }

      if (url.pathname === PLATFORM_PROFILE_PATH && request.method === 'POST') {
        return withCors(
          request,
          await handleUpsertPlatformProfile(request, {
            repository,
            platformAuthService,
            now,
          }),
          env
        )
      }

      if (url.pathname === PLATFORM_REFRESH_PATH && request.method === 'POST') {
        return withCors(
          request,
          await handleRefreshPlatformSession(request, { platformAuthService, repository }),
          env
        )
      }

      if (url.pathname === PLATFORM_LOGOUT_PATH && request.method === 'POST') {
        return withCors(
          request,
          await handleLogoutPlatformSession(request, { platformAuthService }),
          env
        )
      }

      if (url.pathname === GOOGLE_START_PATH && request.method === 'GET') {
        return await handleGoogleOAuthStart(request, {
          env,
          googleConfig,
          oauthService,
          platformAuthService,
        })
      }

      if (url.pathname === GOOGLE_START_PATH && request.method === 'POST') {
        return withCors(
          request,
          await handleGoogleOAuthStart(request, {
            env,
            googleConfig,
            oauthService,
            platformAuthService,
          }),
          env
        )
      }

      if (url.pathname === GOOGLE_CALLBACK_PATH && request.method === 'GET') {
        return await handleGoogleOAuthCallback(request, {
          googleConfig,
          googleAdapter,
          oauthService,
          repository,
        })
      }

      if (url.pathname === OAUTH_CONNECTION_PATH && request.method === 'GET') {
        return withCors(
          request,
          await handleGetOAuthConnection(request, { oauthService, platformAuthService }),
          env
        )
      }

      if (url.pathname.startsWith(`${OAUTH_CONNECTION_PATH}/`) && request.method === 'GET') {
        return withCors(request, await handleGetOAuthConnectionById(request, oauthService), env)
      }

      return serveStaticBundle(request, {
        staticRootDir,
        indexFile,
      })
    },
  }
}

async function handlePlatformGoogleStart(
  request: Request,
  input: {
    env: Record<string, string | undefined>
    googleConfig: ReturnType<typeof loadGoogleOAuthRuntimeConfig>
    tokenSecret?: string | null
    now: () => string
  }
): Promise<Response> {
  if (!input.googleConfig || !input.tokenSecret) {
    return renderPlatformAuthCallbackPage({
      ok: false,
      code: 'oauth-provider-adapter-missing',
      message: 'TutorMeAI Google sign-in is not configured on the Railway backend.',
      status: 503,
    })
  }

  const url = new URL(request.url)
  const clientOriginResult = OriginSchema.safeParse(url.searchParams.get('clientOrigin'))
  if (!clientOriginResult.success) {
    return renderPlatformAuthCallbackPage({
      ok: false,
      code: 'invalid-request',
      message: 'TutorMeAI sign-in requires a valid clientOrigin query parameter.',
      status: 400,
    })
  }

  const clientOrigin = normalizeOrigin(clientOriginResult.data)
  if (!isAllowedClientOrigin(clientOrigin, input.env)) {
    return renderPlatformAuthCallbackPage({
      ok: false,
      code: 'invalid-request',
      message: `Client origin "${clientOrigin}" is not allowed for TutorMeAI sign-in.`,
      status: 403,
    })
  }

  const state = generateOpaqueValue(24)
  const codeVerifier = generateOpaqueValue(32)
  const platformProvider = getPlatformGoogleProviderConfig(request, input.googleConfig.provider, input.env)
  const authorizationUrl = buildAuthorizationUrl(platformProvider, state, codeVerifier, platformProvider.defaultScopes)
  const cookie = serializeSignedCookie(
    PLATFORM_GOOGLE_COOKIE_NAME,
    {
      clientOrigin,
      state,
      codeVerifier,
      createdAt: input.now(),
    } satisfies PlatformGoogleCookiePayload,
    input.tokenSecret
  )

  return new Response(null, {
    status: 302,
    headers: {
      'cache-control': 'no-store',
      location: authorizationUrl,
      'set-cookie': cookie,
    },
  })
}

async function handlePlatformGoogleCallback(
  request: Request,
  input: {
    env: Record<string, string | undefined>
    googleConfig: ReturnType<typeof loadGoogleOAuthRuntimeConfig>
    googleAdapter: ReturnType<typeof createGoogleOAuthAdapter> | null
    fetchImpl: typeof fetch
    now: () => string
    platformAuthService: PlatformAuthService
    repository: AuthRepository
    tokenSecret?: string | null
  }
): Promise<Response> {
  const callbackContext = input.tokenSecret
    ? parseSignedCookie<PlatformGoogleCookiePayload>(
        request.headers.get('cookie'),
        PLATFORM_GOOGLE_COOKIE_NAME,
        input.tokenSecret
      )
    : null
  const callbackTargetOrigin = callbackContext?.clientOrigin ?? null

  if (!input.googleConfig || !input.googleAdapter || !input.tokenSecret) {
    return renderPlatformAuthCallbackPage({
      ok: false,
      code: 'oauth-provider-adapter-missing',
      message: 'TutorMeAI Google sign-in is not configured on the Railway backend.',
      status: 503,
      targetOrigin: callbackTargetOrigin,
      clearCookie: true,
      payload: {
        type: 'tutormeai.platform-auth.callback',
        ok: false,
        code: 'oauth-provider-adapter-missing',
        message: 'TutorMeAI Google sign-in is not configured on the Railway backend.',
      },
    })
  }

  const url = new URL(request.url)
  const providerError = normalizeNonEmptyString(url.searchParams.get('error'))
  if (providerError) {
    const description = normalizeNonEmptyString(url.searchParams.get('error_description'))
    const message = description ? `${providerError}: ${description}` : providerError
    return renderPlatformAuthCallbackPage({
      ok: false,
      code: providerError,
      message,
      status: 400,
      targetOrigin: callbackTargetOrigin,
      clearCookie: true,
      payload: {
        type: 'tutormeai.platform-auth.callback',
        ok: false,
        code: providerError,
        message,
      },
    })
  }

  const state = normalizeNonEmptyString(url.searchParams.get('state'))
  const authorizationCode = normalizeNonEmptyString(url.searchParams.get('code'))
  if (!state || !authorizationCode || !callbackContext || callbackContext.state !== state) {
    return renderPlatformAuthCallbackPage({
      ok: false,
      code: 'invalid-request',
      message: 'TutorMeAI sign-in callback is missing a valid state or authorization code.',
      status: 400,
      targetOrigin: callbackTargetOrigin,
      clearCookie: true,
      payload: {
        type: 'tutormeai.platform-auth.callback',
        ok: false,
        code: 'invalid-request',
        message: 'TutorMeAI sign-in callback is missing a valid state or authorization code.',
      },
    })
  }

  const platformProvider = getPlatformGoogleProviderConfig(request, input.googleConfig.provider, input.env)
  const tokenResult = await input.googleAdapter.exchangeAuthorizationCode({
    provider: platformProvider,
    authorizationCode,
    redirectUri: platformProvider.redirectUri,
    codeVerifier: callbackContext.codeVerifier,
    state,
  })

  if (!tokenResult.ok || !tokenResult.value.accessToken) {
    return renderPlatformAuthCallbackPage({
      ok: false,
      code: 'oauth-token-exchange-failed',
      message: tokenResult.ok ? 'Google sign-in did not return an access token.' : tokenResult.message,
      status: 409,
      targetOrigin: callbackTargetOrigin,
      clearCookie: true,
      payload: {
        type: 'tutormeai.platform-auth.callback',
        ok: false,
        code: 'oauth-token-exchange-failed',
        message: tokenResult.ok ? 'Google sign-in did not return an access token.' : tokenResult.message,
      },
    })
  }

  const profileResult = await fetchGoogleUserProfile({
    accessToken: tokenResult.value.accessToken,
    fetchImpl: input.fetchImpl,
  })
  if (!profileResult.ok) {
    return renderPlatformAuthCallbackPage({
      ok: false,
      code: 'oauth-token-exchange-failed',
      message: profileResult.message,
      status: 409,
      targetOrigin: callbackTargetOrigin,
      clearCookie: true,
      payload: {
        type: 'tutormeai.platform-auth.callback',
        ok: false,
        code: 'oauth-token-exchange-failed',
        message: profileResult.message,
      },
    })
  }

  const now = input.now()
  const existingUser = await input.repository.getUserById(buildGoogleUserId(profileResult.value.sub))
  const user = buildGoogleUserRecord(profileResult.value, now, existingUser)
  await input.repository.saveUser(user)

  const issued = await input.platformAuthService.issuePlatformSession({
    userId: user.userId,
    provider: 'google',
    userAgent: normalizeNonEmptyString(request.headers.get('user-agent')),
    ipAddress: getRequestIpAddress(request) ?? undefined,
    metadata: {
      authProvider: 'google',
      email: user.email,
      emailVerified: profileResult.value.emailVerified,
      pictureUrl: profileResult.value.picture,
      googleSubject: profileResult.value.sub,
    },
  })

  if (!issued.ok) {
    return renderPlatformAuthCallbackPage({
      ok: false,
      code: issued.code,
      message: issued.message,
      status: 409,
      targetOrigin: callbackTargetOrigin,
      clearCookie: true,
      payload: {
        type: 'tutormeai.platform-auth.callback',
        ok: false,
        code: issued.code,
        message: issued.message,
      },
    })
  }

  return renderPlatformAuthCallbackPage({
    ok: true,
    message: 'TutorMeAI account connected. You can close this window and return to Chatbox.',
    status: 200,
    targetOrigin: callbackTargetOrigin,
    clearCookie: true,
    payload: {
      type: 'tutormeai.platform-auth.callback',
      ok: true,
      accessToken: issued.value.sessionToken,
      refreshToken: issued.value.refreshToken,
      user: toPublicPlatformUser(user),
    },
  })
}

async function handleGetPlatformProfile(
  request: Request,
  input: {
    platformAuthService: PlatformAuthService
    repository: AuthRepository
  }
): Promise<Response> {
  const session = await authenticatePlatformRequest(request, input.platformAuthService)
  if (session instanceof Response) {
    return session
  }
  if (!session) {
    return jsonResponse(
      401,
      toApiErrorBody(failureResult('auth', 'platform-session-invalid-token', 'A TutorMeAI platform session is required.'))
    )
  }

  const user = await input.repository.getUserById(session.userId)
  if (!user) {
    return jsonResponse(
      404,
      toApiErrorBody(failureResult('auth', 'platform-session-not-found', 'TutorMeAI user account was not found.'))
    )
  }

  return jsonResponse(200, {
    ok: true,
    data: {
      user: toPublicPlatformUser(user),
      session: {
        platformSessionId: session.platformSessionId,
        provider: session.provider,
        status: session.status,
        sessionExpiresAt: session.sessionExpiresAt,
        refreshExpiresAt: session.refreshExpiresAt,
      },
    },
  })
}

async function handleUpsertPlatformProfile(
  request: Request,
  input: {
    repository: AuthRepository
    platformAuthService: PlatformAuthService
    now: () => string
  }
): Promise<Response> {
  const session = await authenticatePlatformRequest(request, input.platformAuthService)
  if (session instanceof Response) {
    return session
  }
  if (!session) {
    return jsonResponse(
      401,
      toApiErrorBody(failureResult('auth', 'platform-session-invalid-token', 'A TutorMeAI platform session is required.'))
    )
  }

  const parsedBody = await parseJsonBody(request, PlatformProfileBodySchema)
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  const existingUser = await input.repository.getUserById(session.userId)
  if (!existingUser) {
    return jsonResponse(
      404,
      toApiErrorBody(failureResult('auth', 'platform-session-not-found', 'TutorMeAI user account was not found.'))
    )
  }

  const usernameOwner = await input.repository.getUserByUsername(parsedBody.data.username)
  if (usernameOwner && usernameOwner.userId !== existingUser.userId) {
    return jsonResponse(
      409,
      toApiErrorBody(failureResult('api', 'invalid-request', 'That username is already taken. Choose a different one.'))
    )
  }

  const now = input.now()
  const updatedUser: UserRecord = {
    ...existingUser,
    displayName: parsedBody.data.displayName,
    username: parsedBody.data.username,
    role: parsedBody.data.role,
    onboardingCompletedAt: existingUser.onboardingCompletedAt ?? now,
    updatedAt: now,
    metadata: {
      ...existingUser.metadata,
      onboardingCompleted: true,
      onboardingCompletedAt: existingUser.onboardingCompletedAt ?? now,
      onboardingSource: existingUser.onboardingCompletedAt ? 'profile-update' : 'signup',
    },
  }

  try {
    await input.repository.saveUser(updatedUser)
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return jsonResponse(
        409,
        toApiErrorBody(failureResult('api', 'invalid-request', 'That username is already taken. Choose a different one.'))
      )
    }

    throw error
  }

  return jsonResponse(200, {
    ok: true,
    data: {
      user: toPublicPlatformUser(updatedUser),
    },
  })
}

async function handleRefreshPlatformSession(
  request: Request,
  input: {
    platformAuthService: PlatformAuthService
    repository: AuthRepository
  }
): Promise<Response> {
  const parsedBody = await parseJsonBody(request, PlatformRefreshBodySchema)
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  const refreshed = await input.platformAuthService.refreshPlatformSession(parsedBody.data)
  if (!refreshed.ok) {
    return jsonResponse(statusForPlatformFailure(refreshed.code), toApiErrorBody(refreshed))
  }

  const user = await input.repository.getUserById(refreshed.value.session.userId)
  if (!user) {
    return jsonResponse(
      404,
      toApiErrorBody(failureResult('auth', 'platform-session-not-found', 'TutorMeAI user account was not found.'))
    )
  }

  return jsonResponse(200, {
    ok: true,
    data: {
      accessToken: refreshed.value.sessionToken,
      refreshToken: refreshed.value.refreshToken,
      user: toPublicPlatformUser(user),
      session: {
        platformSessionId: refreshed.value.session.platformSessionId,
        provider: refreshed.value.session.provider,
        status: refreshed.value.session.status,
        sessionExpiresAt: refreshed.value.session.sessionExpiresAt,
        refreshExpiresAt: refreshed.value.session.refreshExpiresAt,
      },
    },
  })
}

async function handleLogoutPlatformSession(
  request: Request,
  input: {
    platformAuthService: PlatformAuthService
  }
): Promise<Response> {
  const parsedBody = await parseJsonBody(request, PlatformLogoutBodySchema)
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  const sessionToken = readBearerToken(request)
  const result = await input.platformAuthService.revokePlatformSession({
    sessionToken: sessionToken ?? undefined,
    refreshToken: parsedBody.data.refreshToken,
    reason: 'user-logout',
  })

  if (!result.ok) {
    return jsonResponse(statusForPlatformFailure(result.code), toApiErrorBody(result))
  }

  return jsonResponse(200, {
    ok: true,
    data: {
      revoked: true,
    },
  })
}

async function handleGoogleOAuthStart(
  request: Request,
  input: {
    env: Record<string, string | undefined>
    googleConfig: ReturnType<typeof loadGoogleOAuthRuntimeConfig>
    oauthService: OAuthAuthService
    platformAuthService: PlatformAuthService
  }
): Promise<Response> {
  if (!input.googleConfig) {
    const unavailableResponse = jsonResponse(
      503,
      toApiErrorBody(
        failureResult('oauth', 'oauth-provider-adapter-missing', 'Google OAuth is not configured on the Railway backend.')
      )
    )
    return request.method === 'POST'
      ? unavailableResponse
      : renderOAuthCallbackPage({
          ok: false,
          code: 'oauth-provider-adapter-missing',
          message: 'Google OAuth is not configured on the Railway backend.',
          status: 503,
        })
  }

  let clientOrigin: string
  let appIdValue: string
  let userIdValue: string

  if (request.method === 'POST') {
    const session = await authenticatePlatformRequest(request, input.platformAuthService)
    if (session instanceof Response) {
      return session
    }
    if (!session) {
      return jsonResponse(
        401,
        toApiErrorBody(failureResult('auth', 'platform-session-invalid-token', 'A TutorMeAI platform session is required.'))
      )
    }

    const parsedBody = await parseJsonBody(
      request,
      z.object({
        appId: IdentifierSchema.optional(),
        clientOrigin: OriginSchema,
      })
    )
    if (!parsedBody.ok) {
      return parsedBody.response
    }

    appIdValue = parsedBody.data.appId ?? 'planner.oauth'
    userIdValue = session.userId
    clientOrigin = normalizeOrigin(parsedBody.data.clientOrigin)
  } else {
    const url = new URL(request.url)
    const userId = IdentifierSchema.safeParse(url.searchParams.get('userId'))
    const appId = IdentifierSchema.safeParse(url.searchParams.get('appId'))
    const clientOriginResult = OriginSchema.safeParse(url.searchParams.get('clientOrigin'))

    if (!userId.success || !appId.success || !clientOriginResult.success) {
      return renderOAuthCallbackPage({
        ok: false,
        code: 'invalid-request',
        message: 'OAuth start requires valid userId, appId, and clientOrigin query parameters.',
        status: 400,
      })
    }

    userIdValue = userId.data
    appIdValue = appId.data
    clientOrigin = normalizeOrigin(clientOriginResult.data)
  }

  if (!isAllowedClientOrigin(clientOrigin, input.env)) {
    const invalidOrigin = request.method === 'POST'
      ? jsonResponse(
          403,
          toApiErrorBody(
            failureResult('oauth', 'invalid-request', `Client origin "${clientOrigin}" is not allowed for TutorMeAI OAuth.`)
          )
        )
      : renderOAuthCallbackPage({
          ok: false,
          code: 'invalid-request',
          message: `Client origin "${clientOrigin}" is not allowed for TutorMeAI OAuth.`,
          status: 403,
        })
    return invalidOrigin
  }

  const started = await input.oauthService.startOAuthConnection({
    userId: userIdValue,
    appId: appIdValue,
    provider: input.googleConfig.provider,
    metadata: {
      clientOrigin,
      requestedFrom: new URL(request.url).origin,
    },
  })

  if (!started.ok) {
    return request.method === 'POST'
      ? jsonResponse(statusForOAuthFailure(started.code), toApiErrorBody(started))
      : renderOAuthCallbackPage({
          ok: false,
          code: started.code,
          message: started.message,
          status: statusForOAuthFailure(started.code),
        })
  }

  if (request.method === 'POST') {
    return jsonResponse(200, {
      ok: true,
      data: {
        authorizationUrl: started.value.authorizationUrl,
        oauthConnectionId: started.value.connection.oauthConnectionId,
      },
    })
  }

  return new Response(null, {
    status: 302,
    headers: {
      'cache-control': 'no-store',
      location: started.value.authorizationUrl,
    },
  })
}

async function handleGoogleOAuthCallback(
  request: Request,
  input: {
    googleConfig: ReturnType<typeof loadGoogleOAuthRuntimeConfig>
    googleAdapter: ReturnType<typeof createGoogleOAuthAdapter> | null
    oauthService: OAuthAuthService
    repository: AuthRepository
  }
): Promise<Response> {
  const url = new URL(request.url)
  const state = normalizeNonEmptyString(url.searchParams.get('state'))
  const callbackTargetOrigin = state
    ? await lookupCallbackTargetOrigin(input.repository, state)
    : null

  if (!input.googleConfig || !input.googleAdapter) {
    return renderOAuthCallbackPage({
      ok: false,
      code: 'oauth-provider-adapter-missing',
      message: 'Google OAuth is not configured on the Railway backend.',
      status: 503,
      targetOrigin: callbackTargetOrigin,
      payload: {
        type: 'tutormeai.oauth.callback',
        ok: false,
        code: 'oauth-provider-adapter-missing',
        message: 'Google OAuth is not configured on the Railway backend.',
      },
    })
  }

  const providerError = normalizeNonEmptyString(url.searchParams.get('error'))
  if (providerError) {
    const description = normalizeNonEmptyString(url.searchParams.get('error_description'))
    const message = description ? `${providerError}: ${description}` : providerError
    return renderOAuthCallbackPage({
      ok: false,
      code: providerError,
      message,
      status: 400,
      targetOrigin: callbackTargetOrigin,
      payload: {
        type: 'tutormeai.oauth.callback',
        ok: false,
        code: providerError,
        message,
      },
    })
  }

  const authorizationCode = normalizeNonEmptyString(url.searchParams.get('code'))
  if (!state || !authorizationCode) {
    return renderOAuthCallbackPage({
      ok: false,
      code: 'invalid-request',
      message: 'Google OAuth callback is missing the state or authorization code.',
      status: 400,
      targetOrigin: callbackTargetOrigin,
      payload: {
        type: 'tutormeai.oauth.callback',
        ok: false,
        code: 'invalid-request',
        message: 'Google OAuth callback is missing the state or authorization code.',
      },
    })
  }

  const completed = await input.oauthService.completeOAuthConnection({
    state,
    authorizationCode,
    provider: input.googleConfig.provider,
    adapter: input.googleAdapter,
  })

  if (!completed.ok) {
    return renderOAuthCallbackPage({
      ok: false,
      code: completed.code,
      message: completed.message,
      status: statusForOAuthFailure(completed.code),
      targetOrigin: callbackTargetOrigin,
      payload: {
        type: 'tutormeai.oauth.callback',
        ok: false,
        code: completed.code,
        message: completed.message,
      },
    })
  }

  const targetOrigin = getClientOriginFromMetadata(completed.value.connection.metadata) ?? callbackTargetOrigin

  return renderOAuthCallbackPage({
    ok: true,
    message: 'Google account connected. You can close this window and return to Chatbox.',
    status: 200,
    targetOrigin,
    payload: {
      type: 'tutormeai.oauth.callback',
      ok: true,
      appId: completed.value.connection.appId,
      provider: completed.value.connection.provider,
      userId: completed.value.connection.userId,
      status: 'connected',
    },
  })
}

async function handleGetOAuthConnection(
  request: Request,
  input: {
    oauthService: OAuthAuthService
    platformAuthService: PlatformAuthService
  }
): Promise<Response> {
  const url = new URL(request.url)
  const parsedQuery = OAuthConnectionQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsedQuery.success) {
    return jsonResponse(
      400,
      toApiErrorBody(
        failureResult('api', 'invalid-query', 'OAuth lookup query is invalid.', {
          details: parsedQuery.error.issues.map((issue) => issue.message),
        })
      )
    )
  }

  const { oauthConnectionId, userId, appId, provider } = parsedQuery.data
  const platformSession =
    !oauthConnectionId && !userId ? await authenticatePlatformRequest(request, input.platformAuthService, false) : null
  const resolvedUserId = platformSession && !(platformSession instanceof Response) ? platformSession.userId : userId

  if (!oauthConnectionId && !(resolvedUserId && appId && provider)) {
    return jsonResponse(
      400,
      toApiErrorBody(
        failureResult('api', 'invalid-query', 'OAuth lookup requires oauthConnectionId or a userId/appId/provider selector.')
      )
    )
  }

  if (platformSession instanceof Response) {
    return platformSession
  }

  const result = await input.oauthService.getOAuthConnection({
    oauthConnectionId,
    userId: resolvedUserId,
    appId,
    provider,
  })

  if (!result.ok) {
    return jsonResponse(statusForOAuthFailure(result.code), toApiErrorBody(result))
  }

  return jsonResponse(200, {
    ok: true,
    data: {
      connection: toPublicOAuthConnectionRecord(result.value),
    },
  })
}

async function handleGetOAuthConnectionById(request: Request, oauthService: OAuthAuthService): Promise<Response> {
  const url = new URL(request.url)
  const oauthConnectionId = normalizeNonEmptyString(url.pathname.slice(`${OAUTH_CONNECTION_PATH}/`.length))
  if (!oauthConnectionId) {
    return jsonResponse(
      400,
      toApiErrorBody(failureResult('api', 'invalid-route-params', 'OAuth lookup route params are invalid.'))
    )
  }

  const result = await oauthService.getOAuthConnection({ oauthConnectionId })
  if (!result.ok) {
    return jsonResponse(statusForOAuthFailure(result.code), toApiErrorBody(result))
  }

  return jsonResponse(200, {
    ok: true,
    data: {
      connection: toPublicOAuthConnectionRecord(result.value),
    },
  })
}

async function serveStaticBundle(
  request: Request,
  input: {
    staticRootDir: string
    indexFile: string
  }
): Promise<Response> {
  const filePath = resolveRequestedPath(new URL(request.url).pathname, input.staticRootDir, input.indexFile)
  if (!filePath) {
    return new Response('Forbidden', {
      status: 403,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    })
  }

  try {
    if (filePath === input.indexFile) {
      const html = await readFile(input.indexFile)
      return new Response(html.toString('utf8'), {
        status: 200,
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/html; charset=utf-8',
        },
      })
    }

    return new Response(Readable.toWeb(createReadStream(filePath)) as BodyInit, {
      status: 200,
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      },
    })
  } catch (error) {
    return new Response(`Server error: ${error instanceof Error ? error.message : String(error)}`, {
      status: 500,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    })
  }
}

function resolveRequestedPath(urlPath: string, staticRootDir: string, indexFile: string): string | null {
  const decodedPath = decodeURIComponent(urlPath || '/')
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '')
  const requestedPath = join(staticRootDir, normalizedPath)
  const resolvedPath = resolve(requestedPath)

  if (!resolvedPath.startsWith(staticRootDir)) {
    return null
  }

  if (existsSync(resolvedPath) && statSync(resolvedPath).isFile()) {
    return resolvedPath
  }

  return indexFile
}

function withCors(request: Request, response: Response, env: Record<string, string | undefined>): Response {
  const allowedOrigin = getCorsOrigin(request, env)
  const headers = new Headers(response.headers)
  headers.set('cache-control', headers.get('cache-control') ?? 'no-store')
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  headers.set('access-control-allow-headers', 'authorization, content-type')
  headers.set('access-control-max-age', '600')
  headers.append('vary', 'origin')

  if (allowedOrigin) {
    headers.set('access-control-allow-origin', allowedOrigin)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function getCorsOrigin(request: Request, env: Record<string, string | undefined>): string | null {
  const requestOrigin = normalizeNonEmptyString(request.headers.get('origin'))
  if (!requestOrigin) {
    return null
  }

  return isAllowedClientOrigin(requestOrigin, env) ? normalizeOrigin(requestOrigin) : null
}

function isAllowedClientOrigin(origin: string, env: Record<string, string | undefined>): boolean {
  const parsedOrigin = OriginSchema.safeParse(origin)
  if (!parsedOrigin.success) {
    return false
  }

  const normalized = normalizeOrigin(parsedOrigin.data)
  const explicitOrigins = parseOriginList(env.TUTORMEAI_ALLOWED_ORIGINS)
  if (explicitOrigins.includes(normalized)) {
    return true
  }

  if (DEFAULT_ALLOWED_ORIGINS.includes(normalized)) {
    return true
  }

  const { hostname, protocol } = new URL(normalized)
  if (protocol === 'https:' && hostname.endsWith('.vercel.app') && hostname.includes('chatbox-audit')) {
    return true
  }

  return false
}

async function lookupCallbackTargetOrigin(repository: AuthRepository, state: string): Promise<string | null> {
  const connection = await repository.getOAuthConnectionByStateHash(hashAuthorizationState(state))
  return connection ? getClientOriginFromMetadata(connection.metadata) : null
}

function getClientOriginFromMetadata(metadata: Record<string, unknown> | null | undefined): string | null {
  const clientOrigin = metadata?.clientOrigin
  if (typeof clientOrigin !== 'string') {
    return null
  }

  const parsedOrigin = OriginSchema.safeParse(clientOrigin)
  return parsedOrigin.success ? normalizeOrigin(parsedOrigin.data) : null
}

function hashAuthorizationState(state: string) {
  return createHash('sha256').update(state).digest('base64url')
}

function renderOAuthCallbackPage(input: {
  ok: boolean
  message: string
  status: number
  code?: string
  targetOrigin?: string | null
  payload?: CallbackPayload
}): Response {
  const title = input.ok ? 'TutorMeAI Planner Connected' : 'TutorMeAI Planner Sign-in Failed'
  const payload = input.payload ? JSON.stringify(input.payload) : 'null'
  const targetOrigin = input.targetOrigin ? JSON.stringify(input.targetOrigin) : 'null'
  const codeLine = input.code ? `<p><strong>Code:</strong> ${escapeHtml(input.code)}</p>` : ''
  const description = escapeHtml(input.message)

  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0f172a;
        color: #e2e8f0;
        font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(480px, calc(100vw - 32px));
        padding: 28px;
        border-radius: 20px;
        background: rgba(15, 23, 42, 0.88);
        border: 1px solid rgba(148, 163, 184, 0.24);
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.35);
      }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0 0 10px; }
      .status { color: ${input.ok ? '#5eead4' : '#fca5a5'}; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <p class="status">${input.ok ? 'Connected' : 'Needs attention'}</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${description}</p>
      ${codeLine}
      <p>You can close this window and return to Chatbox.</p>
    </main>
    <script>
      const payload = ${payload};
      const targetOrigin = ${targetOrigin};
      if (payload && targetOrigin && window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, targetOrigin);
      }
      setTimeout(() => {
        try {
          window.close();
        } catch {}
      }, 400);
    </script>
  </body>
</html>`

  return new Response(body, {
    status: input.status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
    },
  })
}

function renderPlatformAuthCallbackPage(input: {
  ok: boolean
  message: string
  status: number
  code?: string
  targetOrigin?: string | null
  clearCookie?: boolean
  payload?: PlatformCallbackPayload
}): Response {
  const title = input.ok ? 'TutorMeAI Signed In' : 'TutorMeAI Sign-in Failed'
  const payload = input.payload ? JSON.stringify(input.payload) : 'null'
  const targetOrigin = input.targetOrigin ? JSON.stringify(input.targetOrigin) : 'null'
  const codeLine = input.code ? `<p><strong>Code:</strong> ${escapeHtml(input.code)}</p>` : ''
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #020617;
        color: #e2e8f0;
        font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(480px, calc(100vw - 32px));
        padding: 28px;
        border-radius: 20px;
        background: rgba(15, 23, 42, 0.88);
        border: 1px solid rgba(148, 163, 184, 0.24);
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.35);
      }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0 0 10px; }
      .status { color: ${input.ok ? '#5eead4' : '#fca5a5'}; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <p class="status">${input.ok ? 'Signed in' : 'Needs attention'}</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(input.message)}</p>
      ${codeLine}
      <p>You can close this window and return to Chatbox.</p>
    </main>
    <script>
      const payload = ${payload};
      const targetOrigin = ${targetOrigin};
      if (payload && targetOrigin && window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, targetOrigin);
      }
      setTimeout(() => {
        try {
          window.close();
        } catch {}
      }, 400);
    </script>
  </body>
</html>`

  const headers = new Headers({
    'cache-control': 'no-store',
    'content-type': 'text/html; charset=utf-8',
  })
  if (input.clearCookie) {
    headers.set('set-cookie', clearCookie(PLATFORM_GOOGLE_COOKIE_NAME))
  }

  return new Response(body, {
    status: input.status,
    headers,
  })
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return {
      ok: false,
      response: jsonResponse(
        400,
        toApiErrorBody(failureResult('api', 'invalid-json', 'Request body must be valid JSON.'))
      ),
    }
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonResponse(
        400,
        toApiErrorBody(
          failureResult('api', 'invalid-json', 'Request body shape is invalid.', {
            details: parsed.error.issues.map((issue) => issue.message),
          })
        )
      ),
    }
  }

  return {
    ok: true,
    data: parsed.data,
  }
}

async function authenticatePlatformRequest(
  request: Request,
  platformAuthService: PlatformAuthService,
  required = true
) {
  const sessionToken = readBearerToken(request)
  if (!sessionToken) {
    if (required) {
      return jsonResponse(
        401,
        toApiErrorBody(failureResult('auth', 'platform-session-invalid-token', 'A TutorMeAI platform session is required.'))
      )
    }
    return null
  }

  const validated = await platformAuthService.validatePlatformSession({
    sessionToken,
  })
  if (!validated.ok) {
    return jsonResponse(statusForPlatformFailure(validated.code), toApiErrorBody(validated))
  }

  return validated.value
}

function readBearerToken(request: Request) {
  const authorization = normalizeNonEmptyString(request.headers.get('authorization'))
  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
    return null
  }

  return authorization.slice('bearer '.length).trim()
}

function statusForPlatformFailure(code: 'invalid-json' | PlatformAuthErrorCode): number {
  switch (code) {
    case 'invalid-json':
    case 'invalid-request':
      return 400
    case 'platform-session-not-found':
      return 404
    case 'platform-session-invalid-token':
    case 'platform-session-revoked':
    case 'platform-session-expired':
    case 'platform-session-refresh-expired':
    case 'platform-session-refresh-invalid':
      return 401
  }
}

function statusForOAuthFailure(code: OAuthAuthErrorCode | 'invalid-query' | 'invalid-route-params'): number {
  switch (code) {
    case 'invalid-query':
    case 'invalid-route-params':
    case 'invalid-request':
      return 400
    case 'oauth-connection-not-found':
      return 404
    case 'oauth-connection-revoked':
    case 'oauth-connection-expired':
      return 403
    case 'oauth-provider-adapter-missing':
      return 503
    case 'oauth-connection-not-pending':
    case 'oauth-connection-missing-refresh-token':
    case 'oauth-connection-missing-code-verifier':
    case 'oauth-token-exchange-failed':
    case 'oauth-token-refresh-failed':
    case 'oauth-token-missing':
      return 409
  }
}

function parseOriginList(rawValue: string | undefined) {
  return (rawValue ?? '')
    .split(/[,\s]+/u)
    .map((value) => value.trim())
    .filter((value) => OriginSchema.safeParse(value).success)
    .map((value) => normalizeOrigin(value))
}

function buildAuthorizationUrl(
  provider: OAuthProviderConfig,
  state: string,
  codeVerifier: string,
  scopes: string[]
) {
  const url = new URL(provider.authorizationUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', provider.clientId)
  url.searchParams.set('redirect_uri', provider.redirectUri)
  url.searchParams.set('state', state)
  if (scopes.length > 0) {
    url.searchParams.set('scope', scopes.join(' '))
  }

  if (provider.pkce ?? true) {
    url.searchParams.set('code_challenge', createHash('sha256').update(codeVerifier).digest('base64url'))
    url.searchParams.set('code_challenge_method', 'S256')
  }

  for (const [key, value] of Object.entries(provider.extraAuthorizationParameters ?? {})) {
    url.searchParams.set(key, value)
  }

  return url.toString()
}

function getPlatformGoogleProviderConfig(
  request: Request,
  provider: OAuthProviderConfig,
  env: Record<string, string | undefined>
): OAuthProviderConfig {
  return {
    ...provider,
    redirectUri:
      normalizeNonEmptyString(env.TUTORMEAI_PLATFORM_GOOGLE_REDIRECT_URI) ??
      new URL(PLATFORM_GOOGLE_CALLBACK_PATH, request.url).toString(),
  }
}

function serializeSignedCookie(name: string, payload: object, secret: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  return `${name}=${encodedPayload}.${signature}; Path=/api/auth/platform/google; HttpOnly; Secure; SameSite=Lax; Max-Age=900`
}

function parseSignedCookie<T extends object>(cookieHeader: string | null, name: string, secret: string): T | null {
  const rawValue = readCookie(cookieHeader, name)
  if (!rawValue) {
    return null
  }

  const [encodedPayload, signature] = rawValue.split('.', 2)
  if (!encodedPayload || !signature) {
    return null
  }

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  if (signature !== expectedSignature) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : null
  } catch {
    return null
  }
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null
  }

  const pair = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))

  return pair ? pair.slice(name.length + 1) : null
}

function clearCookie(name: string) {
  return `${name}=; Path=/api/auth/platform/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

function generateOpaqueValue(size: number) {
  return randomBytes(size).toString('base64url')
}

function buildGoogleUserRecord(profile: GoogleUserProfile, now: string, existingUser?: UserRecord): UserRecord {
  const userId = buildGoogleUserId(profile.sub)
  return {
    userId,
    email: profile.email ?? existingUser?.email ?? null,
    username: existingUser?.username ?? null,
    displayName: existingUser?.displayName ?? profile.name ?? profile.email ?? 'TutorMeAI User',
    role: existingUser?.role ?? null,
    onboardingCompletedAt: existingUser?.onboardingCompletedAt ?? null,
    metadata: {
      ...(existingUser?.metadata ?? {}),
      authProvider: 'google',
      emailVerified: profile.emailVerified,
      pictureUrl: profile.picture,
      googleSubject: profile.sub,
      givenName: profile.givenName,
      familyName: profile.familyName,
    },
    createdAt: existingUser?.createdAt ?? now,
    updatedAt: now,
    deletedAt: existingUser?.deletedAt ?? null,
  }
}

function buildGoogleUserId(subject: string) {
  const normalizedSubject = subject
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '.')
    .replace(/^[._:-]+|[._:-]+$/gu, '')
    .replace(/[._:-]{2,}/gu, '.')

  const candidate = `user.google.${normalizedSubject || 'account'}`
  const parsed = IdentifierSchema.safeParse(candidate)
  return parsed.success ? parsed.data : `user.google.${createHash('sha256').update(subject).digest('hex').slice(0, 24)}`
}

function toPublicPlatformUser(user: UserRecord): PublicPlatformUser {
  const pictureUrl = typeof user.metadata.pictureUrl === 'string' ? user.metadata.pictureUrl : null
  return {
    userId: user.userId,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    pictureUrl,
    onboardingCompletedAt: user.onboardingCompletedAt,
  }
}

function isUniqueConstraintViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
  )
}

function getRequestIpAddress(request: Request) {
  const forwardedFor = normalizeNonEmptyString(request.headers.get('x-forwarded-for'))
  if (!forwardedFor) {
    return null
  }

  return normalizeNonEmptyString(forwardedFor.split(',')[0] ?? null) ?? null
}

function parsePositiveInteger(value: string | undefined) {
  const normalized = normalizeNonEmptyString(value)
  if (!normalized) {
    return undefined
  }

  const parsed = Number.parseInt(normalized, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function normalizeNonEmptyString(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
