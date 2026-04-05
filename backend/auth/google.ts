import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { AuthTokenCipher, OAuthProviderAdapter, OAuthProviderConfig, OAuthProviderResult, OAuthTokenSet } from './types'

const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DEFAULT_GOOGLE_SCOPES = ['openid', 'email', 'profile']

export interface GoogleOAuthRuntimeConfig {
  clientSecret: string
  provider: OAuthProviderConfig
}

export interface GoogleOAuthAdapterOptions {
  clientSecret: string
  fetchImpl?: typeof fetch
  now?: () => number
}

export function loadGoogleOAuthRuntimeConfig(
  env: Record<string, string | undefined> = process.env
): GoogleOAuthRuntimeConfig | null {
  const clientId = normalizeNonEmptyString(env.GOOGLE_OAUTH_CLIENT_ID)
  const clientSecret = normalizeNonEmptyString(env.GOOGLE_OAUTH_CLIENT_SECRET)
  const redirectUri = normalizeNonEmptyString(env.GOOGLE_OAUTH_REDIRECT_URI)

  if (!clientId || !clientSecret || !redirectUri) {
    return null
  }

  const provider = normalizeNonEmptyString(env.GOOGLE_OAUTH_PROVIDER) ?? 'google'
  const authorizationUrl = normalizeNonEmptyString(env.GOOGLE_OAUTH_AUTHORIZATION_URL) ?? GOOGLE_AUTHORIZATION_URL
  const tokenUrl = normalizeNonEmptyString(env.GOOGLE_OAUTH_TOKEN_URL) ?? GOOGLE_TOKEN_URL
  const scopes = parseScopeList(env.GOOGLE_OAUTH_SCOPES)

  return {
    clientSecret,
    provider: {
      provider,
      authorizationUrl,
      tokenUrl,
      clientId,
      redirectUri,
      defaultScopes: scopes.length > 0 ? scopes : DEFAULT_GOOGLE_SCOPES,
      pkce: true,
      extraAuthorizationParameters: {
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent',
      },
    },
  }
}

export function createGoogleOAuthAdapter(options: GoogleOAuthAdapterOptions): OAuthProviderAdapter {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now

  return {
    async exchangeAuthorizationCode(request) {
      return exchangeGoogleToken(
        fetchImpl,
        {
          code: request.authorizationCode,
          client_id: request.provider.clientId,
          client_secret: options.clientSecret,
          code_verifier: request.codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: request.redirectUri,
        },
        request.provider.tokenUrl,
        now
      )
    },
    async refreshTokens(request) {
      return exchangeGoogleToken(
        fetchImpl,
        {
          client_id: request.provider.clientId,
          client_secret: options.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: request.refreshToken,
        },
        request.provider.tokenUrl,
        now
      )
    },
  }
}

export function createHashedTokenCipher(secret: string): AuthTokenCipher {
  const normalizedSecret = normalizeNonEmptyString(secret)
  if (!normalizedSecret) {
    throw new Error('Token cipher secret is required.')
  }

  const key = Uint8Array.from(createHash('sha256').update(normalizedSecret).digest())

  return {
    seal(value: string) {
      const plaintext = new TextEncoder().encode(value)
      const iv = Uint8Array.from(randomBytes(12))
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const ciphertext = Buffer.concat([Buffer.from(cipher.update(plaintext)), Buffer.from(cipher.final())])
      const authTag = Uint8Array.from(cipher.getAuthTag())

      return Buffer.concat([Buffer.from(iv), Buffer.from(authTag), ciphertext]).toString('base64url')
    },
    open(value: string) {
      const payload = Uint8Array.from(Buffer.from(value, 'base64url'))
      if (payload.length < 29) {
        throw new Error('Ciphertext payload is invalid.')
      }

      const iv = payload.subarray(0, 12)
      const authTag = payload.subarray(12, 28)
      const ciphertext = payload.subarray(28)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(Buffer.from(authTag))

      return Buffer.concat([Buffer.from(decipher.update(ciphertext)), Buffer.from(decipher.final())]).toString('utf8')
    },
  }
}

async function exchangeGoogleToken(
  fetchImpl: typeof fetch,
  fields: Record<string, string | undefined>,
  tokenUrl: string,
  now: () => number
): Promise<OAuthProviderResult<OAuthTokenSet>> {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string' && value.length > 0) {
      body.set(key, value)
    }
  }

  let response: Response
  try {
    response = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    })
  } catch (error) {
    return {
      ok: false,
      message: 'Google token exchange request failed.',
      details: [error instanceof Error ? error.message : String(error)],
      retryable: true,
    }
  }

  const payload = await parseJsonPayload(response)
  if (!response.ok) {
    return {
      ok: false,
      message: buildGoogleErrorMessage(payload) ?? 'Google token exchange failed.',
      details: payload ? [JSON.stringify(payload)] : undefined,
      retryable: response.status >= 500,
    }
  }

  const accessToken = normalizeNonEmptyString(readString(payload, 'access_token'))
  if (!accessToken) {
    return {
      ok: false,
      message: 'Google token exchange succeeded without an access token.',
    }
  }

  const expiresIn = readNumber(payload, 'expires_in')
  const scope = normalizeNonEmptyString(readString(payload, 'scope'))
  const idToken = normalizeNonEmptyString(readString(payload, 'id_token'))
  const refreshToken = normalizeNonEmptyString(readString(payload, 'refresh_token'))
  const tokenType = normalizeNonEmptyString(readString(payload, 'token_type'))
  const idTokenClaims = idToken ? parseJwtPayload(idToken) : null

  return {
    ok: true,
    value: {
      accessToken,
      refreshToken,
      expiresAt: typeof expiresIn === 'number' ? new Date(now() + expiresIn * 1000).toISOString() : null,
      scopes: scope ? scope.split(/\s+/u).filter(Boolean) : undefined,
      tokenType: tokenType ?? null,
      idToken: idToken ?? null,
      externalAccountId: readString(idTokenClaims, 'sub') ?? readString(payload, 'sub') ?? null,
    },
  }
}

async function parseJsonPayload(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text()
  if (!text.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function buildGoogleErrorMessage(payload: Record<string, unknown> | null) {
  const error = normalizeNonEmptyString(readString(payload, 'error'))
  const description = normalizeNonEmptyString(readString(payload, 'error_description'))
  if (error && description) {
    return `${error}: ${description}`
  }

  return description ?? error ?? null
}

function parseScopeList(rawValue: string | undefined) {
  return (rawValue ?? '')
    .split(/[,\s]+/u)
    .map((value) => value.trim())
    .filter(Boolean)
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split('.')
  if (segments.length < 2) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')) as unknown
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>
    }
  } catch {
    return null
  }

  return null
}

function readString(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key]
  return typeof value === 'string' ? value : null
}

function readNumber(payload: Record<string, unknown> | null, key: string): number | null {
  const value = payload?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeNonEmptyString(value: string | undefined | null) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}
