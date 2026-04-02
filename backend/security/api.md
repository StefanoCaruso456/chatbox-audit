# TutorMeAI Security Review API

This document describes the Phase 4 backend review-workflow API exposed by [api.ts](./api.ts).

These routes are meant for reviewer-facing tooling. They do not replace the registry API and they do not allow app submitters to self-approve anything.

## Routes

### `GET /api/security/reviews`

List the reviewer queue.

Optional query params:

* `reviewState`

Response:

* `200` with `{ queue }`

### `GET /api/security/reviews/apps/:appId`

Get the full review context for a submitted app, including prior review history.

Optional query params:

* `appVersionId`

Response:

* `200` with `{ app, reviews }`
* `404` if the app or app version is missing

### `POST /api/security/reviews/start`

Move a candidate into active human review.

Request body:

* `appId`
* optional `appVersionId`
* optional `reviewedByUserId`
* optional `notes`

Response:

* `200` with `{ app, review }`
* `409` if the current review state cannot move into `review-pending`

### `POST /api/security/reviews/decisions`

Record a reviewer decision for an app version.

Request body:

* `appId`
* optional `appVersionId`
* `reviewedByUserId`
* `action`
* `decisionSummary`
* optional `notes`
* `ageRating`
* `dataAccessLevel`
* `permissionsSnapshot`
* optional `remediationItems`
* optional `metadata`

Valid `action` values:

* `approve-staging`
* `approve-production`
* `request-remediation`
* `reject`
* `suspend`

Response:

* `200` with `{ app, review }`
* `409` if the requested action is invalid for the current review state

## Notes

This API is intentionally platform-owned:

* app manifests are not authoritative for approval
* decisions are persisted as review records plus app/app-version state
* approval is version-specific, not app-slug-wide
