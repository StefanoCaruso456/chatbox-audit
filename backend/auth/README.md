# Backend Auth

This module owns the TutorMeAI Phase 3 authentication slice:

- platform authentication session issuance, validation, refresh, and revocation
- per-app OAuth connection start, callback completion, refresh, and revocation
- adapter-based provider exchange hooks owned by the Railway backend
- token hashing for platform sessions and ciphertext storage for per-app OAuth tokens

The module is intentionally framework-agnostic. It exposes repository, service, and fetch-style API helpers that the Railway backend can mount without forcing Express-specific route code.

Primary concepts:

- `PlatformAuthService` issues TutorMeAI platform sessions and keeps raw session secrets out of storage by hashing them
- `OAuthAuthService` brokers user-level OAuth connections for authenticated third-party apps and stores token material through an injectable cipher
- `createAuthApi()` exposes request handlers for platform session and OAuth lifecycle routes
- `AuthRepository` isolates persistence so the backend can start with in-memory tests and later swap in PostgreSQL-backed adapters

Security posture:

- platform sessions store token hashes, never raw session secrets
- per-app OAuth tokens are sealed with a backend-owned cipher before persistence
- PKCE is supported by default for OAuth start/callback flows
- provider adapters stay on the Railway backend, so iframe apps never receive long-lived secrets directly
