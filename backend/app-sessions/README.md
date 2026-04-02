# TutorMeAI App Session Persistence

This directory contains the Ticket 13 backend service for app session state.

Scope:

- create app sessions independently from chat text
- update validated snapshots, completion payloads, and terminal state
- read app sessions by session ID or conversation ID
- query resumable sessions for recovery and resume flows
- preserve multiple historical sessions within the same conversation

## Design Notes

- The service uses the shared `AppSessionState` contract from `src/shared/contracts/v1/` as the canonical record shape.
- The database schema in `backend/db/schema.sql` remains the storage source of truth.
- The backend service layer enforces the MVP one-active-session-per-conversation rule.
- Active means `pending`, `active`, `waiting-auth`, or `waiting-user`.
- The service is framework-agnostic and intentionally does not add HTTP routes.

## Repository Pattern

The service uses a repository abstraction so a PostgreSQL implementation can be added later without changing the service API.

## Supported Operations

- `createSession`
- `updateSession`
- `recordSnapshot`
- `markWaiting`
- `markActive`
- `markPaused`
- `markCompleted`
- `markFailed`
- `markExpired`
- `getSession`
- `listSessionsByConversation`
- `getActiveSessionForConversation`
- `listResumableSessions`
- `listAllSessions`
