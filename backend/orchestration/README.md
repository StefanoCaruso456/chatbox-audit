# Orchestration Backend

Phase 2 orchestration services compose the Phase 1 backend domains without coupling directly to the renderer or embedded runtime.

Current modules:

- `tool-discovery`: filters eligible tools from approved app registry records
- `app-context`: assembles typed conversation app context for follow-up turns
- `tool-injection`: builds the bounded tool payload exposed to the model
- `tool-routing`: deterministically decides between tool invocation, clarification, or plain-chat refusal

The next tickets can build on these services for renderer integration, streaming, and embedded runtime execution without moving routing policy into the client.
