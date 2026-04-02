# Tool Routing Service

Ticket 18 adds the deterministic routing layer that selects between plain chat, clarification, or a concrete third-party app tool.

## Responsibilities

- score eligible tools from the discovery layer against the user request
- prefer direct, explicit matches over broad heuristics
- fall back safely when the request is unrelated or too weak to route
- ask for clarification when multiple tools are close matches
- build a normalized tool-invocation request that later logging/execution layers can consume

## Route Outcomes

- `invoke-tool`: a single tool is clearly the best match
- `clarify`: multiple tools are close matches or the request is ambiguous
- `plain-chat`: no tool matches strongly enough to route

## Deterministic Rules

- exact app/tool name matches outrank token overlap
- active apps receive a small deterministic bonus
- follow-up intent words such as `again`, `continue`, or `resume` can increase the score for the active app
- ambiguous or close-score cases return `clarify` instead of auto-firing
- weak or unrelated requests return `plain-chat`

## Invocation Adapter

The adapter returns a `QueueToolInvocationRequest`-compatible shape with routing metadata and a `queued` transition log entry so the later logging service can attach it without reinterpreting the decision.
