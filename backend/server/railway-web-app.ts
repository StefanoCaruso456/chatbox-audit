import { createHash } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { IdentifierSchema } from '@shared/contracts/v1'
import { OriginSchema, normalizeOrigin } from '@shared/contracts/v1/shared'
import { z } from 'zod'
import { failureResult, toApiErrorBody } from '../errors'
import {
  createGoogleOAuthAdapter,
  createHashedTokenCipher,
  InMemoryAuthRepository,
  OAuthAuthService,
  loadGoogleOAuthRuntimeConfig,
  toPublicOAuthConnectionRecord,
  type AuthRepository,
  type OAuthAuthErrorCode,
} from '../auth'

const DEFAULT_STATIC_ROOT_DIR = resolve(process.cwd(), 'release/app/dist/renderer')
const DEFAULT_ALLOWED_ORIGINS = ['https://chatbox-audit.vercel.app', 'http://localhost:1212', 'http://localhost:3000']
const GOOGLE_START_PATH = '/api/auth/oauth/google/start'
const GOOGLE_CALLBACK_PATH = '/api/auth/oauth/callback'
const OAUTH_CONNECTION_PATH = '/api/auth/oauth'

const OAuthConnectionQuerySchema = z.object({
  userId: IdentifierSchema.optional(),
  appId: IdentifierSchema.optional(),
  provider: z.string().trim().min(1).optional(),
  oauthConnectionId: z.string().trim().min(1).optional(),
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
  const repository = options.repository ?? new InMemoryAuthRepository()
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
  const googleAdapter = googleConfig
    ? createGoogleOAuthAdapter({
        clientSecret: googleConfig.clientSecret,
        fetchImpl: options.fetchImpl,
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

      if (url.pathname === GOOGLE_START_PATH && request.method === 'GET') {
        return await handleGoogleOAuthStart(request, {
          env,
          googleConfig,
          oauthService,
        })
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
        return withCors(request, await handleGetOAuthConnection(request, oauthService), env)
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

async function handleGoogleOAuthStart(
  request: Request,
  input: {
    env: Record<string, string | undefined>
    googleConfig: ReturnType<typeof loadGoogleOAuthRuntimeConfig>
    oauthService: OAuthAuthService
  }
): Promise<Response> {
  if (!input.googleConfig) {
    return renderOAuthCallbackPage({
      ok: false,
      code: 'oauth-provider-adapter-missing',
      message: 'Google OAuth is not configured on the Railway backend.',
      status: 503,
    })
  }

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

  const clientOrigin = normalizeOrigin(clientOriginResult.data)
  if (!isAllowedClientOrigin(clientOrigin, input.env)) {
    return renderOAuthCallbackPage({
      ok: false,
      code: 'invalid-request',
      message: `Client origin "${clientOrigin}" is not allowed for TutorMeAI OAuth.`,
      status: 403,
    })
  }

  const started = await input.oauthService.startOAuthConnection({
    userId: userId.data,
    appId: appId.data,
    provider: input.googleConfig.provider,
    metadata: {
      clientOrigin,
      requestedFrom: new URL(request.url).origin,
    },
  })

  if (!started.ok) {
    return renderOAuthCallbackPage({
      ok: false,
      code: started.code,
      message: started.message,
      status: statusForOAuthFailure(started.code),
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

async function handleGetOAuthConnection(request: Request, oauthService: OAuthAuthService): Promise<Response> {
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
  if (!oauthConnectionId && !(userId && appId && provider)) {
    return jsonResponse(
      400,
      toApiErrorBody(
        failureResult('api', 'invalid-query', 'OAuth lookup requires oauthConnectionId or a userId/appId/provider selector.')
      )
    )
  }

  const result = await oauthService.getOAuthConnection({
    oauthConnectionId,
    userId,
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
  headers.set('access-control-allow-methods', 'GET, OPTIONS')
  headers.set('access-control-allow-headers', 'content-type')
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  })
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
