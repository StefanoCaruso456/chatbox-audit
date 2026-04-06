# Chatbox Community Edition

Chatbox Community Edition is a multi-provider AI workspace built on top of a desktop-first shell and extended with a newer TutorMeAI / ChatBridge platform direction.

This fork now supports two connected goals:

- a strong everyday AI workspace for chat, files, history, projects, and provider switching
- a governed app-aware platform where approved products can run beside chat in a controlled way

## What This Repo Is Now

Upstream Chatbox already provided the core AI workspace. This fork adds a second product layer on top of it:

- projects and cleaner workspace organization
- conversation-mode and composer cleanup
- voice input
- an approved app catalog and right-side app workspace
- embedded runtime products such as Chess Tutor, Chess.com, Flashcards Coach, and Planner Connect
- shared app contracts and a reusable Apps SDK / cloud-plugin layer
- backend services for registry, orchestration, auth, security review, and tool logging
- trust, reviewer workflow, analytics, and education-oriented access controls

## Start Here

- [What We Built](./docs/what-we-built.md)
- [Apps SDK](./docs/sdk/README.md)
- [UI Cleanup](./docs/ui-cleanup.md)
- [Architecture](./docs/architecture.md)
- [Docs Index](./docs/README.md)

## Product Direction

The long-term product is not just "AI chat on desktop."

It is:

- a multi-provider AI workspace
- a tool-aware and app-aware assistant shell
- a foundation for trusted education and productivity workflows

The intended production split is:

- client surface on Vercel
- backend orchestration service on Railway
- PostgreSQL for persistence

Inside this repository, those responsibilities are still modeled together in one codebase.

## Repo Map

Main implementation areas:

- [`src/main`](./src/main): Electron main-process code
- [`src/preload`](./src/preload): preload bridge
- [`src/renderer`](./src/renderer): main product UI and workflows
- [`src/shared`](./src/shared): shared types, providers, contracts, and utilities
- [`backend`](./backend): TutorMeAI platform backend domains
- [`docs`](./docs): product, SDK, trust, engineering, and planning docs
- [`scripts`](./scripts): helper scripts and release wrappers

Useful documentation entry points:

- [`docs/what-we-built.md`](./docs/what-we-built.md): before/after product report
- [`docs/sdk/README.md`](./docs/sdk/README.md): Apps SDK and cloud-plugin model
- [`docs/ui-cleanup.md`](./docs/ui-cleanup.md): UI simplification and workspace cleanup
- [`docs/repo-organization.md`](./docs/repo-organization.md): root-file cleanup and repository layout
- [`docs/tutormeai-setup-guide.md`](./docs/tutormeai-setup-guide.md): run and verify the platform work
- [`docs/tutormeai-third-party-developer-guide.md`](./docs/tutormeai-third-party-developer-guide.md): external app integration guide
- [`docs/trust/README.md`](./docs/trust/README.md): trust, review-state, permission, and reviewer workflow docs

## Quick Verification

Recommended focused checks:

```bash
pnpm exec vitest run test/integration/tutormeai
pnpm exec vitest run src/shared/contracts/v1/index.test.ts
pnpm exec vitest run src/renderer/components/message-parts/embedded-app-runtime.test.ts
```

## Summary

The short version:

- upstream Chatbox gives this repo a strong everyday AI workspace
- this fork adds a second product layer for trusted apps
- that second layer includes shared contracts, runtime examples, trust controls, and a path to backend-owned orchestration
