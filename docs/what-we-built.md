# What We Built On Top Of Chatbox

## Executive Summary

This codebase started from upstream Chatbox, a strong multi-provider AI workspace. The work in this fork expands that foundation into a broader product:

- a cleaner workspace for everyday AI use
- a governed app platform where approved products can run beside chat
- a reusable Apps SDK / cloud-plugin model that couples the LM, app runtime, and trust layer
- a backend platform for auth, orchestration, security review, and logging

In short, this is no longer just a desktop chat client. It is becoming a packaged AI workspace and application platform that can support both B2B deployments and end-user offerings.

## Before And After

| Area | Upstream Chatbox | This Fork |
| --- | --- | --- |
| Core product | Multi-provider AI chat workspace | AI workspace plus governed app platform |
| User journey | Prompt in, answer out | Prompt, app launch, app state, completion, follow-up context |
| App model | Tool use and local product features | Approved apps, embedded runtimes, catalog, launch policies, app context |
| Backend role | Mostly client-centric product shell | Backend-owned registry, orchestration, auth, security, and logging |
| Commercial shape | End-user AI client | B2B platform, partner app layer, and end-user packaged experiences |
| Governance | Standard app behavior and settings | Review queue, approval model, trust docs, student/reviewer controls |

## Product Surfaces Added In This Fork

### 1. Workspace And UX Upgrades

- projects and chat grouping
- cleaner sidebar organization
- clearer conversation mode controls
- onboarding improvements around session modes and platform access
- voice input in the composer
- more responsive compose and panel behavior

### 2. Approved App Platform

- approved app catalog with categories, tags, grade ranges, and launch guidance
- multiple integration models:
  - runtime
  - partner embed
  - API adapter
  - district adapter
  - browser session
  - native replacement
- right-side governed app workspace
- app launch flows from chat and from the app library
- app state that can feed later turns in the conversation

### 3. Runtime Products

Implemented examples include:

- Chess Tutor
- Chess.com wrapper experience
- Flashcards Coach
- Planner Connect

These are important because they prove three distinct product patterns:

- internal runtime app
- wrapped third-party experience
- authenticated app with platform-managed OAuth

### 4. Apps SDK / Cloud-Plugin Layer

The repo now contains a reusable app-platform layer that sits between chat and the app runtime:

- typed app manifests
- typed tool schemas
- typed runtime message envelopes
- completion signals
- conversation app context
- catalog and app-query helpers
- SDK provider and adapter abstractions

This is the part that makes the product sellable as more than a one-off app. It is a reusable packaging layer for LM-coupled applications.

### 5. Backend Platform

New backend domains model the platform as a real service, not only a renderer feature:

- app registry
- orchestration
- conversations
- app sessions
- tool invocation logging
- auth
- security
- app access approvals
- Railway web server and PostgreSQL schema/migrations

### 6. Trust, Review, And Access Control

This fork adds a more defensible governance layer:

- app review states and reviewer workflow
- permission and auth review guidance
- role-aware onboarding for students, teachers, admins, and district leaders
- teacher/admin approval flow for student app access
- origin checks, launchability checks, and policy helpers

### 7. Analytics And Product Reporting

The product now also points toward a measurable learning and workflow platform:

- explicit analytics views for teachers and parents around activity, prompts, time-in-app, and assignment signals
- role and data foundations that support school-admin and district-level reporting as the next extension
- runtime observability and Braintrust export
- a clearer story around usage, outcomes, and product health

For the full role-based breakdown, see [Analytics Platform](./analytics-platform.md).

## UI Cleanup And Experience Improvements

The interface work in this fork matters because the repo is now serving more than one product layer. The UI changes reduce friction while making room for apps, projects, and onboarding.

Key UX changes:

- projects make the workspace feel organized instead of chat-list-only
- the sidebar better matches a modern workspace mental model
- the composer is more capable without feeling heavier
- the app panel keeps tools beside the conversation instead of breaking flow
- mobile and compact behavior is handled more deliberately through drawers and responsive layout decisions

For the detailed UI pass, see [UI Cleanup](./ui-cleanup.md).

## Implementation Map

### Product shell

- `src/renderer`
- `src/main`
- `src/preload`

### Apps SDK and contracts

- `src/shared/contracts/v1`
- `src/renderer/packages/apps-sdk`
- `src/renderer/data/approvedApps.ts`

### App runtime and surfaces

- `src/renderer/components/apps`
- `src/renderer/components/message-parts`
- `src/renderer/routes/embedded-apps`
- `src/renderer/packages/tutormeai-apps`

### Backend platform

- `backend/registry`
- `backend/orchestration`
- `backend/auth`
- `backend/security`
- `backend/app-access`
- `backend/app-sessions`
- `backend/conversations`
- `backend/tool-invocations`
- `backend/server`
- `backend/db`

## Why The Apps SDK Matters Commercially

The Apps SDK turns this work from "custom app features inside chat" into a platform package.

### B2B packaging

The platform can be sold as:

- a governed AI workspace for schools, districts, and education programs
- an internal productivity shell for teams that need approved apps beside chat
- a partner platform where institutions decide which apps are available, how auth works, and what governance rules apply

### End-user packaging

The same platform can support:

- premium tutor-style app bundles
- focused study products such as flashcards, planner, or coaching experiences
- subscriptions where the user buys both the assistant and the app workflow together

### Partner / ecosystem packaging

Because the app surface is typed and governed, it can also be positioned as:

- a partner SDK for third-party developers
- a cloud-plugin model that couples app state, tool schemas, completion signals, and LM follow-up
- a safer alternative to unrestricted plugin execution

## What Is Already Real In This Repo

This fork already proves:

- the app catalog and integration modes
- the shared contract package
- the renderer Apps SDK
- embedded app runtime flows
- backend platform domains
- auth and access-control patterns
- runtime telemetry export
- reviewer queue and review harness UI surfaces

## Current Boundary

The intended production split is still:

- client on Vercel
- backend on Railway
- PostgreSQL for persistence

Inside this repo, those responsibilities are still modeled together. That means the product vision is ahead of the deployment split, but the implementation already shows the product shape clearly.
