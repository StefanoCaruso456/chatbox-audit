# Tool Routing Service

Tickets 18, 20, and 21 define the deterministic routing layer that selects between plain chat, clarification, or a concrete third-party app tool.

## Responsibilities

- score eligible tools from the discovery layer against the user request
- prefer direct, explicit matches over broad heuristics
- refuse app invocation cleanly when the request is unrelated, invalid, or missing active-app context
- ask for clarification when multiple tools are close matches or the request explicitly mentions competing apps
- build a normalized tool-invocation request that later logging/execution layers can consume

## Route Outcomes

- `invoke-tool`: a single tool is clearly the best match
- `clarify`: multiple tools are close matches or the request is ambiguous
- `plain-chat`: no tool matches strongly enough to route, so the system refuses app invocation and stays in chat

## Deterministic Rules

- exact app/tool name matches outrank token overlap
- active apps receive a small deterministic bonus
- follow-up intent words such as `again`, `continue`, or `resume` can increase the score for the active app
- explicit multi-app requests such as `chess or flashcards` return `clarify` instead of auto-firing
- generic actions such as `open` return `clarify` when more than one app is plausible
- weak or unrelated requests return `plain-chat` with explicit refusal reason codes
- follow-up phrasing without an active app session returns `plain-chat` instead of guessing

## Invocation Adapter

The adapter returns a `QueueToolInvocationRequest`-compatible shape with routing metadata and a `queued` transition log entry so the later logging service can attach it without reinterpreting the decision.
