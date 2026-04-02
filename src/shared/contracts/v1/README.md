# Shared Contracts v1

This directory holds the first versioned TutorMeAI contract domains.

Implemented in Phase 0:

- `app-manifest`: validated registration metadata and example manifests
- `app-session-state`: durable app session records and validated snapshots
- `tool-schema`: callable tool contracts with typed input/output schema support
- `runtime-messages`: typed iframe host/app messages
- `completion-signal`: canonical app completion payload
- `conversation-context`: chat-facing active app and completion summary context

Ticket 03-06 coverage in this package:

- Ticket 03: `app-manifest` exports typed schemas, validators, and example manifests for internal, public external, and authenticated external apps
- Ticket 04: `tool-schema` exports typed tool contracts, validation helpers, and example tool definitions
- Ticket 05: `runtime-messages` exports the embedded app host/app message protocol plus example bootstrap, invoke, state, heartbeat, completion, and error messages
- Ticket 06: `completion-signal` exports the canonical completion payload plus example results for chess, flashcards, and authenticated planner-style flows

Still pending in later tickets:

- `auth`
- `safety-review`
- `errors`
