# TutorMeAI Permission And Auth Review Taxonomy

## Purpose

This document defines how app permissions and auth patterns should be categorized and reviewed.

It is the source of truth for Trust Governance Roadmap Ticket `T4`.

## Current Contract Permissions

Current app permission values in the shared contract are:

* `conversation:read-summary`
* `conversation:write-summary`
* `session:read`
* `session:write`
* `tool:invoke`
* `user:read-profile`
* `oauth:connect`

These are the platform-recognized permissions. Review should happen at both the contract level and the policy level.

## Permission Categories

### Conversation Context Permissions

* `conversation:read-summary`
* `conversation:write-summary`

Review expectation:

* app must justify why it needs conversation-level summary access
* full transcript access is not implied

### App Session Permissions

* `session:read`
* `session:write`

Review expectation:

* access should stay scoped to the app's own session
* cross-app state access is not allowed

### Execution Permissions

* `tool:invoke`

Review expectation:

* only apps that genuinely execute platform-mediated tools should request it

### User Identity Permissions

* `user:read-profile`

Review expectation:

* user identity access must be justified narrowly
* apps should receive only the minimum user profile data needed for the use case

### Auth Bootstrap Permissions

* `oauth:connect`

Review expectation:

* this allows the app flow to request account connection through the platform
* it does not imply direct iframe ownership of OAuth tokens

## Permission Risk Guidance

### Lower Risk

* `conversation:read-summary`

### Moderate Risk

* `conversation:write-summary`
* `session:read`
* `user:read-profile`

### Higher Risk

* `session:write`
* `tool:invoke`
* `oauth:connect`

Higher-risk permissions should receive more explicit reviewer scrutiny and stronger justification.

## Auth Taxonomy

TutorMeAI supports three access/auth patterns:

### 1. Internal App

Typical contract shape:

* distribution: `internal`
* authType: `platform-session`

Review meaning:

* app is still reviewed
* app trust is higher operationally, but least privilege still applies

### 2. Public External App

Typical contract shape:

* distribution: `public-external`
* authType: `none`

Review meaning:

* app should not require user-specific login
* if observed behavior introduces hidden login requirements, that is a policy mismatch

### 3. Authenticated External App

Typical contract shape:

* distribution: `authenticated-external`
* authType: `oauth2`

Review meaning:

* OAuth scopes must be justified
* backend-brokered connection flow is required
* raw long-lived credentials must not be exposed to the iframe

## Review Rules

### Permission Rules

1. every requested permission must map to a real, declared product behavior
2. apps must not request permissions “just in case”
3. higher-risk permissions require stronger reviewer notes

### Auth Rules

1. auth type must match observed runtime behavior
2. public external apps must not silently behave like authenticated apps
3. authenticated external apps must not bypass backend-brokered OAuth handling

### Scope Rules

For OAuth apps:

1. requested scopes must map to declared functionality
2. broad scopes should default to rejection unless clearly justified
3. scope review must be documented in the review artifact

## Anti-Patterns To Reject

Examples of rejectable permission/auth patterns:

* requesting `oauth:connect` without a real account-linked feature
* requesting `user:read-profile` when the app only needs generic content
* asking for session write access when the app is read-only
* public external app showing undeclared login prompts
* authenticated external app trying to manage OAuth fully inside the iframe

## Decision Summary

TutorMeAI should review permissions and auth as product-risk signals, not just as contract fields. The goal is to keep third-party apps useful while preserving least privilege and platform control.
