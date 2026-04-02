# Orchestration Backend

Phase 2 orchestration services compose the Phase 1 backend domains without coupling directly to the renderer or embedded runtime.

Current modules:

- `tool-discovery`: filters eligible tools from approved app registry records
- `app-context`: assembles typed conversation app context for follow-up turns

The next tickets can build on these services for prompt/tool injection and routing.
