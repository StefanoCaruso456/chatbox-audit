# Backend Security

This module owns the TutorMeAI Phase 3 backend security slice:

- app review records
- app approval synchronization
- app submission package schema
- domain and origin validation
- permission sanity checking
- OAuth scope sanity checking
- launchability checks
- allowlist-based iframe embedding policy
- deterministic CSP and security header generation

The module is intentionally framework-agnostic. It exposes repository, service, and policy helpers that the Railway backend can mount without forcing a specific HTTP framework.

Primary concepts:

- `AppSecurityReviewRecord` models the append-only review history that aligns with `app_review_records`
- `AppSecurityService` records reviews, syncs registry state, and decides whether an app can launch
- `AppSubmissionPackageSchema` defines the structured review intake package for partner-submitted app versions
- `validateDomainOriginSubmission()` checks exact HTTPS origin usage, entry/target alignment, and declared origin/domain consistency
- `buildPermissionSanityReport()` flags suspicious permission and auth-permission combinations before review
- `reviewOAuthScopeSanity()` compares manifest scopes against provider/requested scopes and flags missing, excessive, wildcard, or mismatched scope sets
- `buildAppIframeEmbeddingPolicy()` builds a strict iframe policy from an approved manifest or registry record
- `buildAppSecurityHeaders()` generates deterministic CSP and related security headers for the platform

The module is designed for least privilege:

- no wildcard origins
- no empty allowlists
- sandbox defaults are conservative
- app launchability is gated by review status and allowlisted origins
- submission-time validation can block malformed or unsafe onboarding payloads before human review
