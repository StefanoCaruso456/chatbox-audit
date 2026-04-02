# TutorMeAI Backend Database

This directory is the Phase 1 database foundation for the future Railway backend.

Ticket 09 deliverables live here:

- `schema.sql`: canonical PostgreSQL schema snapshot
- `migrations/0001_tutormeai_platform.sql`: executable initial migration
- `index-plan.md`: rationale for the primary indexes needed by persistence, registry, and audit flows

## Design Notes

- IDs are stored as `text` so the database can use the same identifiers already modeled in `src/shared/contracts/v1/`.
- Structured app state, manifests, tool payloads, and completion payloads are stored as `jsonb` because the shared contracts are already typed and versioned at the application layer.
- The schema supports multiple app sessions per conversation history. MVP policy for "one active app per conversation" should be enforced in the backend service layer, not as a hard database constraint.
- App version ownership is enforced with composite foreign keys so an app, session, review record, or invocation cannot accidentally point at another app's version row.
- OAuth token columns are designed for encrypted ciphertext values owned by the Railway backend. Embedded apps and the client must never receive raw long-lived secrets.

## Applying The Initial Migration

```bash
psql "$DATABASE_URL" -f backend/db/migrations/0001_tutormeai_platform.sql
```

## Scope Of This Ticket

Ticket 09 establishes the durable PostgreSQL model for:

- conversations and messages
- app registrations and versioned manifests
- app sessions and completion state
- tool invocation history
- OAuth connections and token storage

Later Phase 1 tickets should build services and APIs on top of these tables rather than introducing parallel persistence shapes.
