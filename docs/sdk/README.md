# ChatBridge Apps SDK

## What It Is

The ChatBridge Apps SDK is the reusable layer that connects:

- the language model
- the approved app catalog
- the embedded app runtime
- the backend trust and orchestration platform

It behaves like a governed cloud-plugin system rather than a loose widget library. The platform stays in control of launch policy, auth, app context, and follow-up behavior while the app provides focused functionality beside the conversation.

## Why It Matters

Without this layer, the repo is just "chat plus some custom embedded tools."

With this layer, the repo becomes:

- a reusable application platform
- a sellable LM-coupled package for B2B buyers
- a foundation for end-user premium experiences
- a partner-facing integration surface for third-party apps

## SDK Building Blocks

### Shared contracts

The versioned contract package defines the stable data model between host, app, and backend:

- app manifest
- app session state
- tool schema
- runtime messages
- completion signal
- conversation context

Primary path:

- `src/shared/contracts/v1`

### Renderer SDK

The renderer-side SDK provides:

- app lookup by id or runtime id
- app catalog querying and filtering
- launch-resolution support
- adapter hooks into UI state
- provider hooks for active app, requested app, and panel width

Primary path:

- `src/renderer/packages/apps-sdk`

### Catalog layer

The approved app catalog packages product metadata with operational metadata:

- integration mode
- auth model
- capabilities
- setup checklist
- sample prompts
- launch overrides
- runtime bridge details

Primary path:

- `src/renderer/data/approvedApps.ts`

### Runtime bridge

The runtime bridge lets the host and app exchange typed messages for:

- bootstrap
- invocation
- state updates
- heartbeat
- errors
- completion

Primary paths:

- `src/shared/contracts/v1/runtime-messages`
- `src/renderer/components/apps`
- `src/renderer/components/message-parts`
- `src/renderer/routes/embedded-apps`

### Backend platform

The backend gives the SDK its platform authority:

- registry
- orchestration
- auth
- security
- session persistence
- tool invocation logging

Primary path:

- `backend/`

## How The SDK Couples With The LM

The important product idea is not just "open an app."

The real value is this loop:

1. user asks for help in chat
2. platform decides whether chat alone is enough or whether an approved app should launch
3. app opens inside the governed workspace
4. app emits typed state updates and completion data
5. backend stores durable app context
6. later turns can use compact summaries of what happened inside the app

That is what makes the SDK feel like a cloud-plugin package that rounds out the LM instead of just decorating the UI.

## Supported Integration Models

The current catalog supports multiple app strategies:

- `runtime`: app is a ChatBridge-native or tightly controlled runtime
- `partner-embed`: approved embed path for partner products
- `api-adapter`: ChatBridge owns the UI and talks to vendor APIs
- `district-adapter`: school or district launch entry point
- `browser-session`: governed browser-session shell
- `native-replacement`: ChatBridge recreates the focused workflow directly

This is important commercially because different products need different trust and integration models.

## Current Repo Entry Points

### SDK and catalog

- `src/renderer/packages/apps-sdk`
- `src/renderer/data/approvedApps.ts`

### Contracts

- `src/shared/contracts/v1`

### App runtime examples

- `src/renderer/routes/embedded-apps/chess.tsx`
- `src/renderer/routes/embedded-apps/chess-com.tsx`
- `src/renderer/routes/embedded-apps/flashcards.tsx`
- `src/renderer/routes/embedded-apps/planner.tsx`

### Orchestration and trust

- `src/renderer/packages/tutormeai-apps`
- `backend/orchestration`
- `backend/registry`
- `backend/auth`
- `backend/security`

## Commercial Packaging

### B2B package

The SDK can support:

- district or school app libraries
- role-aware approval and access control
- governed app launches
- institution-owned trust and review workflows
- reporting and telemetry

### End-user package

The SDK can also support:

- premium study or productivity app bundles
- assistant plus app subscriptions
- guided flows where the user buys a complete package, not just model access

### Partner package

For partners, the SDK can become:

- an integration target with typed manifests and tool schemas
- a safer app model than unrestricted plugins
- a way to ship domain-specific workflows that stay inside the ChatBridge shell

## Positioning Guidance

When describing this system externally, the clearest framing is:

"A governed apps SDK for LM-native products. It couples chat, typed tools, embedded runtimes, app completion context, and backend trust controls into one reusable platform layer."

That is stronger than calling it only an iframe system or only a plugin system, because it includes orchestration, trust, and post-app context as part of the product.
