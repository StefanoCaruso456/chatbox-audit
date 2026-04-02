# Backend Error Model

Ticket 15 introduces a shared backend error contract for TutorMeAI service and API layers.

## Purpose

- normalize failure envelopes across registry, conversation, app-session, and tool-invocation domains
- make API error payloads predictable for the frontend chat shell
- preserve domain-specific error codes without creating one-off response shapes per module
- extend the same envelope to platform auth, OAuth brokerage, and security policy modules

## Shared Shape

Service failures now follow a common shape:

```ts
{
  ok: false,
  domain: 'registry' | 'conversation' | 'app-session' | 'tool-invocation' | 'app-context' | 'auth' | 'oauth' | 'security' | 'api',
  code: string,
  message: string,
  details?: string[],
  retryable?: boolean
}
```

API responses use the same fields under `error`:

```ts
{
  ok: false,
  error: {
    domain: 'api' | 'registry' | 'conversation' | 'app-session' | 'tool-invocation' | 'app-context' | 'auth' | 'oauth' | 'security',
    code: string,
    message: string,
    details?: string[],
    retryable?: boolean
  }
}
```

## Current Scope

- registry API errors now distinguish API-layer validation failures from registry-service failures
- backend services share the same failure result contract while keeping their existing domain-specific error codes
- retryability is supported by the contract but only populated when a caller has a clear policy decision
- Phase 3 auth and security modules can now use the same envelope without inventing a second auth-specific error shape
