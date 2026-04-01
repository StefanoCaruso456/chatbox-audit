# Shared Contracts v1

This directory holds the first versioned TutorMeAI contract domains.

Implemented in Phase 0:

- `app-manifest`: validated registration metadata and example manifests
- `app-session-state`: durable app session records and validated snapshots
- `tool-schema`: callable tool contracts with typed input/output schema support
- `runtime-messages`: typed iframe host/app messages
- `completion-signal`: canonical app completion payload
- `conversation-context`: chat-facing active app and completion summary context

Still pending in later tickets:

- `auth`
- `safety-review`
- `errors`
