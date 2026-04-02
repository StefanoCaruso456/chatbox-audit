# TutorMeAI Third-Party Developer Guide

## Purpose

This guide explains how a third-party developer integrates an app into the TutorMeAI platform without editing core orchestration logic.

The platform contract is built around four things:

- `AppManifest`
- `ToolSchema`
- embedded iframe UI
- runtime `postMessage` events

## Supported App Patterns

The platform supports three app/access patterns:

1. Internal app with no app-specific auth
2. External public app with server-held credentials or no user-specific auth
3. External authenticated app that requires user-level OAuth2, with tokens owned by the Railway backend

## Required Artifacts

Every app needs:

1. An `AppManifest`
2. One or more `ToolSchema` definitions
3. An iframe entry page
4. Runtime message handlers for bootstrap, invocation, state updates, and completion

## Contract Source Of Truth

Shared contract definitions live in:

- `src/shared/contracts/v1/app-manifest/`
- `src/shared/contracts/v1/tool-schema/`
- `src/shared/contracts/v1/runtime-messages/`
- `src/shared/contracts/v1/completion-signal/`

Do not define parallel payload shapes in app code. Import these shared types directly.

## Minimal Integration Flow

### 1. Define the manifest

Your manifest must declare:

- `appId`
- `slug`
- `name`
- `distribution`
- `authType`
- `allowedOrigins`
- `uiEmbedConfig`
- `toolDefinitions`
- `permissions`
- `safetyMetadata`

Example shape:

```ts
const manifest = {
  version: 'v1',
  appId: 'flashcards.public',
  slug: 'flashcards',
  name: 'Flashcard Coach',
  shortDescription: 'Practice quick recall with AI-assisted flashcards.',
  appVersion: '1.0.0',
  distribution: 'public-external',
  authType: 'none',
  permissions: ['tool:invoke'],
  allowedOrigins: ['https://flashcards.example.com'],
  uiEmbedConfig: {
    entryUrl: 'https://flashcards.example.com/embed',
    targetOrigin: 'https://flashcards.example.com',
    loadingStrategy: 'lazy',
    sandbox: {
      allowScripts: true,
      allowForms: false,
      allowPopups: false,
      allowSameOrigin: false,
    },
  },
  toolDefinitions: [
    {
      name: 'flashcards.start-session',
      description: 'Open the flashcard session for the requested topic.',
      inputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
        },
        required: ['topic'],
      },
      authRequirement: 'none',
      timeoutMs: 30000,
      idempotent: false,
      invocationMode: 'embedded-bridge',
      requiredPermissions: ['tool:invoke'],
    },
  ],
  safetyMetadata: {
    reviewStatus: 'pending',
    ageRating: 'all-ages',
    dataAccessLevel: 'minimal',
  },
}
```

### 2. Register the app

Apps are registered through the backend registry API, which validates the manifest and stores it in a reviewable registry record.

Current registration surface:

- `POST /api/registry/apps`

Current safety behavior:

- registration is allowed
- API-side review status is forced to `pending`
- approved-only discovery is the default read mode

### 3. Expose tools

Each tool must define:

- the tool name
- a human-readable description
- input schema
- optional output schema
- auth requirement
- invocation mode
- timeout
- idempotency

The orchestration layer discovers tools from the manifest, filters them by approval/auth state, and only injects eligible tools into the model.

### 4. Build the iframe app

Your embedded page should:

- receive `host.bootstrap`
- optionally receive `host.invoke`
- render UI without assuming direct parent DOM access
- send `app.state` as progress changes
- send `app.complete` when the workflow is done
- send `app.error` for recoverable or terminal runtime failures

## Runtime Messaging Rules

The app host and iframe communicate through `postMessage` only.

Host-to-app messages:

- `host.bootstrap`
- `host.invoke`

App-to-host messages:

- `app.state`
- `app.heartbeat`
- `app.complete`
- `app.error`

Each message must include:

- `conversationId`
- `appSessionId`
- `appId`
- `sequence`
- `security.handshakeToken`
- `security.expectedOrigin`

The runtime contract now rejects completion messages whose payload ids drift from the outer message envelope.

## Authentication Rules

### Internal apps

- use `distribution: internal`
- typically use `authType: platform-session`

### Public external apps

- use `distribution: public-external`
- must use `authType: none`
- tool auth requirement must stay `none`

### Authenticated external apps

- use `distribution: authenticated-external`
- must use `authType: oauth2`
- must provide `authConfig`
- iframe does not own the OAuth redirect flow or token storage

Important:

- the host platform can request OAuth
- the Railway backend owns callback handling, token storage, refresh, and revoke
- the iframe only receives connection state and scoped outcomes

## Local Testing Workflow

The repo already includes embedded app examples you can model against:

- `src/renderer/routes/embedded-apps/chess.tsx`
- `src/renderer/routes/embedded-apps/flashcards.tsx`
- `src/renderer/routes/embedded-apps/planner.tsx`

Phase 6 integration coverage lives in:

- `test/integration/tutormeai/app-lifecycle.test.tsx`
- `test/integration/tutormeai/routing-scenarios.test.ts`

Run them with:

```bash
pnpm exec vitest run test/integration/tutormeai
```

## Security Expectations

Third-party apps are untrusted by default.

Your app must assume:

- sandboxed iframe execution
- strict origin validation
- no direct access to parent DOM
- no raw long-lived auth tokens in the iframe
- minimum-necessary context only

## Done Criteria For An App Integration

An app is not considered complete until it can:

- register with a valid manifest
- expose at least one valid tool
- render inside the embedded app host
- receive bootstrap and invocation payloads
- send state updates back to the platform
- send a valid completion signal
- support follow-up chat reasoning after completion
