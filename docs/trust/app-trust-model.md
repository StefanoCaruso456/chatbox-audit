# TutorMeAI Third-Party App Trust Model

## Purpose

This document defines the trust stance for embedded third-party apps in TutorMeAI.

It is the source of truth for Trust Governance Roadmap Ticket `T1`.

## Core Position

Third-party apps are **untrusted by default**.

TutorMeAI should treat them as guest software running inside a tightly controlled platform, not as peers to the client or backend.

The platform is trusted for:

* UI rendering and host runtime behavior
* identity and authentication
* orchestration and routing
* durable session and conversation state
* approval and policy decisions

Third-party apps are not trusted for:

* unrestricted data access
* self-approval
* direct DOM access to the host page
* access to raw platform tokens
* unrestricted network or origin usage

## MVP Trust Stance

TutorMeAI MVP is a **curated app platform**, not an open marketplace.

Only these app categories can reach users:

1. first-party apps
2. hand-approved partner apps
3. approved app versions hosted on allowlisted origins

TutorMeAI must not support arbitrary live plugin onboarding in production during MVP.

## Trust Principles

### 1. Curated Before Open

Approval is required before production exposure.

### 2. Versioned Trust

Approval applies to a specific app version and approved origin set, not just to an app name or developer.

### 3. Least Privilege

Apps receive the minimum permissions, context, and auth scope necessary for their declared function.

### 4. Deterministic Controls Over Model Judgment

AI-assisted review can help collect evidence or flag concerns, but hard platform rules and human approval remain authoritative.

### 5. Runtime Enforcement Matters

Pre-approval review is not enough. Approved apps must still be sandboxed, monitored, and suspendable after launch.

## Trust Boundary Model

### Trusted Platform Surfaces

* Next.js client on Vercel
* Node.js backend on Railway
* PostgreSQL persistence

### Untrusted Surface

* embedded third-party app iframes

### Controlled Interaction Path

Third-party apps may interact with the platform only through:

* registered manifests and tool schemas
* approved iframe origins
* validated `postMessage` envelopes
* scoped app session data
* backend-brokered auth and token handling

## Data Exposure Rules

Apps must not receive:

* full conversation transcripts by default
* unrelated app session state
* direct access to platform session tokens
* direct access to refresh tokens or OAuth secrets

Apps may receive:

* scoped invocation payloads
* approved app session identifiers
* minimum necessary context summaries
* connection state, not raw long-lived credentials

## Allowed App Access Patterns

TutorMeAI supports three app access patterns:

1. internal apps using platform-owned trust and platform session controls
2. public external apps using no user-specific auth or server-held credentials
3. authenticated external apps using user-level OAuth, brokered by the Railway backend

These patterns are product capabilities, not trust shortcuts. External apps in either pattern still require approval and runtime controls.

## Operational Consequences

Because apps are untrusted by default, the platform must support:

* review-owned approval states
* origin allowlisting
* version-aware launch gating
* runtime policy-violation logging
* app suspension / kill switch controls

## Current Baseline Versus Target

Current baseline already in the repo:

* manifest validation
* tool schema validation
* iframe sandbox policy helpers
* origin validation helpers
* launchability checks tied to review status

Target model defined by this document:

* approval is fully platform-owned
* review is version-aware and evidence-backed
* production launch requires explicit approval
* runtime monitoring and suspension become operational requirements

## Decision Summary

TutorMeAI is building a controlled educational app ecosystem, not a general-purpose plugin marketplace.

That is the most defensible trust position for a K-12 AI product and the position all downstream security and approval work should follow.
