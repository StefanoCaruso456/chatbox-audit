# Backend Security

This module owns the TutorMeAI Phase 3 backend security slice:

- app review records
- app approval synchronization
- OAuth scope sanity checking
- launchability checks
- allowlist-based iframe embedding policy
- deterministic CSP and security header generation

The module is intentionally framework-agnostic. It exposes repository, service, and policy helpers that the Railway backend can mount without forcing a specific HTTP framework.

Primary concepts:

- `AppSecurityReviewRecord` models the append-only review history that aligns with `app_review_records`
- `AppSecurityService` records reviews, syncs registry state, and decides whether an app can launch
- `reviewOAuthScopeSanity()` compares manifest scopes against provider/requested scopes and flags missing, excessive, wildcard, or mismatched scope sets
- `buildAppIframeEmbeddingPolicy()` builds a strict iframe policy from an approved manifest or registry record
- `buildAppSecurityHeaders()` generates deterministic CSP and related security headers for the platform

The module is designed for least privilege:

- no wildcard origins
- no empty allowlists
- sandbox defaults are conservative
- app launchability is gated by review status and allowlisted origins
