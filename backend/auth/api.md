# Backend Auth API

This document describes the framework-agnostic auth route surface exported by `backend/auth/api.ts`.

## Platform Authentication

### `POST /api/auth/platform/sessions`

Issues a new TutorMeAI platform session.

Request body:

- `userId` required
- `provider` optional, defaults to `tutormeai-platform`
- `platformSessionId` optional
- `sessionTtlMs` optional
- `refreshTtlMs` optional
- `userAgent` optional
- `ipAddress` optional
- `metadata` optional JSON object

Success response:

- `201`
- `{ ok: true, data: { session, sessionToken, refreshToken } }`

Error response:

- `400 invalid-json`
- `400 invalid-request`

### `POST /api/auth/platform/sessions/validate`

Validates a platform session token and optionally updates `lastUsedAt`.

Request body:

- `sessionToken` required
- `touchLastUsedAt` optional

Success response:

- `200`
- `{ ok: true, data: PlatformSessionRecord }`

Error response:

- `404 platform-session-not-found`
- `403 platform-session-revoked`
- `403 platform-session-expired`

### `POST /api/auth/platform/sessions/refresh`

Rotates a session using a refresh token.

Request body:

- `refreshToken` required
- `sessionTtlMs` optional
- `refreshTtlMs` optional

Success response:

- `200`
- `{ ok: true, data: { session, sessionToken, refreshToken } }`

Error response:

- `404 platform-session-not-found`
- `403 platform-session-refresh-expired`
- `409 platform-session-refresh-invalid`

### `POST /api/auth/platform/sessions/revoke`

Revokes a platform session using one selector.

Request body:

- `platformSessionId` optional
- `sessionToken` optional
- `refreshToken` optional
- `reason` optional

Success response:

- `200`
- `{ ok: true, data: PlatformSessionRecord }`

Error response:

- `400 invalid-request`
- `404 platform-session-not-found`

## Per-App OAuth

### `POST /api/auth/oauth/start`

Starts a per-app OAuth flow and returns the backend-owned authorization URL plus PKCE state.

Request body:

- `userId` required
- `appId` required
- `provider` required OAuth provider config
- `authorizationState` optional
- `codeVerifier` optional
- `requestedScopes` optional
- `metadata` optional JSON object

Success response:

- `201`
- `{ ok: true, data: { connection, authorizationUrl, state, codeVerifier } }`

Error response:

- `400 invalid-json`
- `400 invalid-request`

### `POST /api/auth/oauth/callback`

Completes OAuth with an authorization code and a configured provider adapter.

Request body:

- `state` required
- `authorizationCode` required
- `provider` required OAuth provider config

Success response:

- `200`
- `{ ok: true, data: { connection } }`

Error response:

- `404 oauth-connection-not-found`
- `403 oauth-connection-expired`
- `403 oauth-connection-revoked`
- `409 oauth-connection-not-pending`
- `409 oauth-token-exchange-failed`
- `501 oauth-provider-adapter-missing`

### `POST /api/auth/oauth/refresh`

Refreshes a connected OAuth token set.

Request body:

- `oauthConnectionId` optional
- `userId` optional
- `appId` optional
- `provider` required OAuth provider config

Success response:

- `200`
- `{ ok: true, data: { connection } }`

Error response:

- `404 oauth-connection-not-found`
- `403 oauth-connection-expired`
- `403 oauth-connection-revoked`
- `409 oauth-connection-missing-refresh-token`
- `409 oauth-token-refresh-failed`
- `501 oauth-provider-adapter-missing`

### `POST /api/auth/oauth/revoke`

Revokes an OAuth connection and clears stored token ciphertext.

Request body:

- `oauthConnectionId` optional
- `userId` optional
- `appId` optional
- `provider` optional when using `oauthConnectionId`, required for user/app lookup
- `reason` optional

Success response:

- `200`
- `{ ok: true, data: OAuthConnectionRecord }`

Error response:

- `404 oauth-connection-not-found`

### `GET /api/auth/oauth/:oauthConnectionId`

Fetches a single OAuth connection.

Route params:

- `oauthConnectionId` optional when the query selector is used instead

Query:

- `userId` optional
- `appId` optional
- `provider` optional

Success response:

- `200`
- `{ ok: true, data: OAuthConnectionRecord }`

Error response:

- `400 invalid-query`
- `400 invalid-route-params`
- `404 oauth-connection-not-found`

### `GET /api/auth/oauth`

Lists a user’s OAuth connections.

Query:

- `userId` required
- `appId` optional
- `provider` optional
- `status` optional
- `launchableOnly` optional

Success response:

- `200`
- `{ ok: true, data: { connections } }`

## State Transitions

Platform sessions:

- `active` -> `active` on validation or refresh
- `active` -> `expired` when session or refresh expiry closes
- `active` -> `revoked` on explicit revoke

OAuth connections:

- `pending` -> `connected` on successful callback exchange
- `pending` -> `expired` when callback state expires
- `connected` -> `connected` on refresh
- `connected` -> `revoked` on disconnect or revoke
