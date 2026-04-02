# Tool Discovery Service

Ticket 16 adds a deterministic backend service for discovering which third-party app tools are currently eligible for a conversation turn.

## Responsibilities

- load registered apps from the app registry service
- filter out ineligible apps and tools based on approval, app filters, and auth readiness
- prioritize the currently active app when requested
- return a typed tool list that later orchestration layers can inject into prompts or routing logic

## Inputs

- registry records from `AppRegistryService.listApps()`
- approval policy
- platform auth readiness
- per-app OAuth readiness
- optional app allowlist / denylist
- optional active app preference

## Current Policy

- `tool.authRequirement = "none"` is always eligible
- `tool.authRequirement = "platform-session"` requires `platformAuthenticated = true`
- `tool.authRequirement = "app-oauth"` requires `appOAuthStates[appId] = "connected"`
- approved apps are the default view unless the caller explicitly requests otherwise
- active-app ordering is deterministic and optional

## Output Shape

The service returns:

- a sorted list of eligible tool records with app metadata and auth readiness reason
- selection metadata showing which apps were included or omitted

This gives Ticket 17 a clean boundary for dynamic tool injection without forcing the prompt layer to reimplement registry and auth filtering.
