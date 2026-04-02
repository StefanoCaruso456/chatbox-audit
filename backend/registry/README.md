# TutorMeAI App Registry Service

This directory holds the Ticket 10 backend service layer for app registration and discovery.

Implemented here:

- repository abstraction for registry persistence
- in-memory repository for service tests and local development
- app registry service with manifest validation, version-aware registration, and approval-aware lookup/filtering

## Current Boundary

The registry service depends on the shared contracts in `src/shared/contracts/v1/` and is designed to persist into the PostgreSQL schema created in `backend/db/`.

This ticket does **not** add HTTP routes yet. API transport is deferred to Ticket 11.

## Category Handling

The current shared `AppManifest` contract does not yet include a `category` field, while the PostgreSQL registry model does.

To avoid breaking the shared contract early, Ticket 10 treats `category` as registry-owned registration metadata:

- the caller must provide `category` alongside the manifest when registering an app
- the service persists category on the registry record
- a future contract update can collapse this into the manifest once the taxonomy is finalized

## Service Behaviors

- invalid manifests are rejected with readable validation errors
- slug conflicts are blocked across different app IDs
- re-registering the same app version with different manifest contents is rejected
- approved-only filtering can be enforced on list and get operations
- registering a new version updates the app's current version pointer without discarding older versions
