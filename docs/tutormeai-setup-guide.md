# TutorMeAI Setup Guide

## Goal

This guide explains how to run and verify the TutorMeAI third-party app platform work inside the current Chatbox codebase.

The current implementation is still a single repository. The intended production split is:

- Vercel-hosted Next.js client
- Railway-hosted Node.js backend
- PostgreSQL for persistence

Inside this repo, those responsibilities are modeled in the existing renderer shell plus the new `backend/` and `src/shared/contracts/` surfaces.

## Prerequisites

- Node.js `^20.19.0 || >=22.12.0 <23.0.0`
- `pnpm >= 10`

Optional local tools:

- `psql` if you want to apply the PostgreSQL schema manually
- `gh` if you want to inspect or open GitHub PRs locally

## Install

```bash
pnpm install
```

## Run The App Shell

Desktop-oriented dev shell:

```bash
pnpm run dev
```

Web-oriented preview build:

```bash
pnpm run build:web
pnpm run serve:web
```

## TutorMeAI Implementation Areas

Shared contracts:

- `src/shared/contracts/v1/`

Backend platform domains:

- `backend/db/`
- `backend/registry/`
- `backend/conversations/`
- `backend/app-sessions/`
- `backend/tool-invocations/`
- `backend/orchestration/`
- `backend/auth/`
- `backend/security/`

Renderer and embedded app runtime:

- `src/renderer/components/message-parts/`
- `src/renderer/packages/tutormeai-apps/`
- `src/renderer/routes/embedded-apps/`

TutorMeAI integration tests:

- `test/integration/tutormeai/app-lifecycle.test.tsx`
- `test/integration/tutormeai/routing-scenarios.test.ts`

## High-Value Verification Commands

Phase 6 QA block:

```bash
pnpm exec vitest run \
  src/shared/contracts/v1/index.test.ts \
  src/renderer/components/message-parts/embedded-app-runtime.test.ts \
  test/integration/tutormeai/app-lifecycle.test.tsx \
  test/integration/tutormeai/routing-scenarios.test.ts
```

Focused lint/format validation:

```bash
pnpm exec biome check \
  src/shared/contracts/v1/runtime-messages/index.ts \
  src/shared/contracts/v1/index.test.ts \
  test/integration/tutormeai/app-lifecycle.test.tsx \
  test/integration/tutormeai/routing-scenarios.test.ts
```

Focused integration-only run:

```bash
pnpm exec vitest run test/integration/tutormeai
```

## Database Setup

Canonical schema files live in `backend/db/`.

Apply the migrations with:

```bash
psql "$DATABASE_URL" -f backend/db/migrations/0001_tutormeai_platform.sql
psql "$DATABASE_URL" -f backend/db/migrations/0002_tutormeai_auth_security.sql
```

## What "Working" Means In This Repo

The current case-study implementation proves:

- typed app manifests, tool schemas, runtime messages, and completion signals
- app registry, orchestration, auth, and security service layers
- embedded app launch and `postMessage` runtime flow
- three example app patterns:
  - internal chess app
  - public flashcards app
  - authenticated planner app
- multi-app context retention and failure recovery

## Current Limitations

- The production Vercel client and Railway backend are documented architecture targets, but this repo still hosts the proof-of-concept in one codebase.
- The authenticated app pattern is implemented through a host-managed OAuth framework plus a demo planner experience, not a live production third-party provider.
- Cost logging schema exists, but live deployment telemetry still needs a production connection before the model can report real usage dashboards.
