# Shared Contracts

## Purpose

`src/shared/contracts/` is the single source of truth for all TutorMeAI platform contracts that must be shared across:

- the Vercel client
- the Railway backend
- embedded third-party apps
- tests and validation utilities

No cross-surface contract should be introduced outside this directory.

## Ownership

- Architectural ownership: Lead Architect Agent
- Schema ownership: Plugin SDK / Contract Agent
- Runtime message ownership: Embedded Runtime Agent
- Auth payload ownership: Auth & Security Agent

Backend and frontend agents may consume contracts but should not create parallel versions elsewhere.

## Versioning Rules

- Contracts are versioned under `src/shared/contracts/v1/`.
- Use additive changes whenever possible.
- Breaking changes require:
  1. updating `docs/architecture.md`
  2. updating `docs/state-model.md`
  3. updating downstream docs or tickets
  4. documenting migration impact in the same change
- Contracts should use explicit version fields where runtime messages or manifests may outlive a single deploy.

## Directory Layout

The Phase 0 layout is:

```text
src/shared/contracts/
  index.ts
  README.md
  v1/
    README.md
    app-manifest/
    tool-schema/
    runtime-messages/
    completion-signal/
    app-session-state/
    conversation-context/
    auth/
    safety-review/
    errors/
```

## Initial Contract Domains

- `app-manifest`: registration metadata for apps
- `tool-schema`: callable tool definitions
- `runtime-messages`: iframe host/app message envelopes
- `completion-signal`: app completion payloads
- `app-session-state`: durable app session records and snapshots
- `conversation-context`: app-aware context summaries used by orchestration
- `auth`: platform auth and per-app OAuth payloads
- `safety-review`: approval and review records
- `errors`: normalized cross-layer errors

## Ticket Ownership

- Ticket 03: `v1/app-manifest/`
- Ticket 04: `v1/tool-schema/`
- Ticket 05: `v1/runtime-messages/`
- Ticket 06: `v1/completion-signal/`
- Later backend/runtime tickets: session, auth, context, and error contracts

## Implemented In This Repo

The following v1 contracts are now implemented and exported from `src/shared/contracts/index.ts`:

- `app-manifest`: typed manifest schema, validator, and example manifests
- `tool-schema`: typed tool contract plus JSON-schema-like input/output definitions
- `runtime-messages`: typed iframe host/app message envelope for bootstrap, invoke, state, heartbeat, completion, and error events
- `completion-signal`: typed completion payload used by app runtimes and orchestration follow-up flows

These implementations are the source of truth for downstream registry, runtime bridge, and routing work. Do not introduce parallel manifest or message shapes elsewhere.

## Contract Boundaries

### Belongs Here

- manifest schemas
- tool schemas
- runtime message envelopes
- completion payloads
- app session snapshots
- auth config and token-shape metadata
- normalized cross-surface error shapes

### Does Not Belong Here

- client-only UI props
- server-only ORM models
- embedded-app implementation details
- platform-specific helper utilities that are not part of a contract boundary
