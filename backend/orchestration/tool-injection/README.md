# Tool Injection Layer

Ticket 17 turns eligible tool records into a bounded, deterministic payload that the LLM runtime can consume.

## Responsibilities

- accept discovered tools from the backend tool-discovery layer
- optionally incorporate active conversation app context
- prioritize the active app when building the injection payload
- limit the number of tools and the complexity of each schema preview
- emit explicit metadata for later routing and execution tracing

## Output Shape

The service returns:

- `toolDeclarations`: the selected tool records with their full tool schema and a compact schema preview
- `promptFragments`: deterministic instruction lines for prompt assembly
- `selection`: count and truncation metadata

## Truncation Rules

- total tools are capped by `maxToolCount`
- per-app tool exposure is capped by `maxToolsPerApp`
- schema previews cap nesting depth and property count
- prompt lines are truncated to a deterministic maximum length

## Ordering Rules

- active-app tools sort first when a conversation context marks one as active
- within the active app, explicitly available tool names sort first
- remaining tools sort by app name, app id, then tool name

This keeps the later routing layer simple: it can inject or log the payload exactly as built here, without recomputing eligibility.
