# TutorMeAI App Registry API

This document covers the Ticket 11 HTTP surface for app registration and discovery.

The API layer is intentionally implemented as fetch-style `Request`/`Response` handlers so it can be mounted later in Express, Fastify, or a Railway-native Node server without rewriting the registry rules.

## Routes

### `POST /api/registry/apps`

Registers a new third-party app submission package or a new version submission for an existing app.

Request body:

```json
{
  "submissionVersion": "v1",
  "category": "games",
  "manifest": { "...": "AppManifest v1 payload" },
  "owner": {
    "ownerType": "external-partner",
    "ownerName": "Partner App Studio",
    "contactName": "Taylor Brooks",
    "contactEmail": "taylor@example.com"
  },
  "domains": ["https://apps.example.com"],
  "requestedOAuthScopes": [],
  "stagingUrl": "https://staging.example.com/app",
  "privacyPolicyUrl": "https://example.com/privacy",
  "support": {
    "supportEmail": "support@example.com",
    "responsePolicy": "One business day"
  },
  "releaseNotes": "Initial partner submission.",
  "screenshots": []
}
```

Success response: `201`

```json
{
  "ok": true,
  "data": {
    "app": {
      "appId": "chess.internal",
      "slug": "chess",
      "name": "Chess Tutor",
      "category": "games",
      "distribution": "internal",
      "authType": "platform-session",
      "reviewStatus": "pending",
      "reviewState": "submitted",
      "currentVersionId": "chess.internal@1.0.0",
      "currentVersion": {
        "appVersionId": "chess.internal@1.0.0",
        "appVersion": "1.0.0",
        "manifest": { "...": "AppManifest v1 payload" },
        "submission": { "...": "AppSubmissionPackage v1 payload" },
        "review": {
          "reviewState": "submitted",
          "runtimeReviewStatus": "pending",
          "submittedAt": "2026-04-01T12:00:00.000Z",
          "validationFindings": []
        },
        "createdAt": "2026-04-01T12:00:00.000Z"
      },
      "versions": [
        {
          "appVersionId": "chess.internal@1.0.0",
          "appVersion": "1.0.0",
          "manifest": { "...": "AppManifest v1 payload" },
          "submission": { "...": "AppSubmissionPackage v1 payload" },
          "review": {
            "reviewState": "submitted",
            "runtimeReviewStatus": "pending",
            "submittedAt": "2026-04-01T12:00:00.000Z",
            "validationFindings": []
          },
          "createdAt": "2026-04-01T12:00:00.000Z"
        }
      ],
      "createdAt": "2026-04-01T12:00:00.000Z",
      "updatedAt": "2026-04-01T12:00:00.000Z"
    }
  }
}
```

Important behavior:

- the API accepts a full submission package, not just `manifest + category`
- the API forces externally submitted apps into platform-owned `reviewState: "submitted"` and `reviewStatus: "pending"`
- this avoids trusting caller-supplied approval state before the dedicated review model exists
- deterministic submission validators can reject malformed or unsafe onboarding payloads before human review

### `GET /api/registry/apps`

Lists registered apps.

Supported query params:

- `approvedOnly=true|false`
- `distribution=internal|public-external|authenticated-external`
- `authType=none|platform-session|oauth2`

Default behavior:

- `approvedOnly` defaults to `true`
- if the API is mounted with default options, `approvedOnly=false` is rejected

Success response: `200`

```json
{
  "ok": true,
  "data": {
    "apps": []
  }
}
```

### `GET /api/registry/apps/:appId`

Fetches a single app by `appId`.

Supported query params:

- `approvedOnly=true|false`

Alternative lookup form:

- `GET /api/registry/apps?slug=<app-slug>` can be mounted to the same lookup handler when no `appId` route param is supplied

Success response: `200`

```json
{
  "ok": true,
  "data": {
    "app": {
      "appId": "flashcards.public",
      "slug": "flashcards"
    }
  }
}
```

## Error Shape

All route failures use the same JSON envelope:

```json
{
  "ok": false,
  "error": {
    "domain": "api",
    "code": "invalid-query",
    "message": "Registry list query is invalid.",
    "details": ["Optional validation details"],
    "retryable": false
  }
}
```

`domain` distinguishes route-surface failures such as invalid JSON or invalid query params from registry-domain failures returned by the service layer.

## Error Codes

### Request / route parsing

- `invalid-json`: request body could not be parsed or failed body validation
- `invalid-query`: query string failed validation or omitted required lookup data
- `invalid-route-params`: route params failed validation
- `unapproved-read-disabled`: caller attempted to read unapproved apps from a route surface that does not allow it

### Service-mapped errors

- `invalid-manifest`: submitted manifest failed shared contract validation
- `invalid-submission-package`: submitted onboarding package failed schema or deterministic review checks
- `invalid-category`: registration omitted a usable category
- `slug-conflict`: submitted slug conflicts with another registered app
- `version-conflict`: submitted app version already exists with different manifest contents
- `not-found`: requested app does not exist
- `not-approved`: requested app exists but is not approved for exposure

## Status Code Mapping

- `201`: successful registration
- `200`: successful list or get
- `400`: invalid JSON, invalid query, invalid route params, invalid manifest/category, invalid-submission-package
- `403`: unapproved-read-disabled, not-approved
- `404`: not-found
- `409`: slug-conflict, version-conflict
