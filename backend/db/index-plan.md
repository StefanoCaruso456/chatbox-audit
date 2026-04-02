# TutorMeAI PostgreSQL Index Plan

This document explains the initial indexes created by `backend/db/migrations/0001_tutormeai_platform.sql`.
Phase 3 auth/security adds `backend/db/migrations/0002_tutormeai_auth_security.sql` for platform-session persistence.

## Query Patterns

### 1. Conversation list by user

Expected query:

- fetch a user's recent conversations ordered by latest activity

Primary indexes:

- `idx_conversations_user_updated`
- `idx_conversations_status_updated`

### 2. Message history by conversation

Expected query:

- load a conversation's messages in stable sequence order
- page recent messages for resume/reconnect flows

Primary indexes:

- unique constraint on `(conversation_id, sequence_no)`
- `idx_messages_conversation_created`

### 3. Current approved app registry

Expected query:

- list approved apps and join each app to its current version
- filter apps by distribution, auth model, and approval status

Primary indexes:

- unique constraint on `apps.slug`
- `idx_apps_review_distribution`
- unique constraint on `(app_id, version)`
- `idx_app_versions_app_created`

### 4. Active and resumable app sessions

Expected query:

- load app sessions for a conversation ordered by recency
- find active or waiting sessions for a user
- resume sessions that are still within their TTL window

Primary indexes:

- `idx_app_sessions_conversation_updated`
- `idx_app_sessions_conversation_status`
- `idx_app_sessions_user_status`
- `idx_app_sessions_active`
- `idx_app_sessions_resumable_until`

Implementation note:

- The schema intentionally allows multiple sessions in one conversation history. Service logic should still enforce the MVP rule of one active app at a time per conversation.

### 5. Tool invocation audit trails

Expected query:

- fetch invocation history by conversation
- fetch invocation history by app session
- report failures, latency, and recent activity by app/tool

Primary indexes:

- `idx_tool_invocations_conversation_started`
- `idx_tool_invocations_session_started`
- `idx_tool_invocations_status_started`
- `idx_tool_invocations_app_tool_started`

### 6. OAuth connection lookup, callback, and refresh

Expected query:

- load a user's app connection before invoking an authenticated tool
- resolve a pending callback state during OAuth completion
- refresh expiring or expired tokens
- inspect active/failed connections by app

Primary indexes:

- unique constraint on `(user_id, app_id, provider)`
- unique constraint on `authorization_state_hash`
- `idx_oauth_connections_status_expiry`
- `idx_oauth_connections_app_status`
- `idx_oauth_connections_state_expiry`

### 7. Platform auth session lookup and refresh

Expected query:

- authenticate a bearer token to a single active platform session
- refresh a user's session with token rotation
- revoke all or one active session for a user

Primary indexes:

- unique constraint on `session_token_hash`
- unique constraint on `refresh_token_hash`
- `idx_platform_sessions_user_status`
- `idx_platform_sessions_refresh_expiry`

### 8. App review and approval history

Expected query:

- fetch the latest review history for an app
- inspect pending or blocked reviews

Primary indexes:

- `idx_app_review_records_app_created`
- `idx_app_review_records_status_created`

## Out Of Scope For Ticket 09

These indexes are intentionally deferred until real query traces exist:

- GIN indexes over `manifest_json`, `tool_definitions_json`, or `latest_snapshot_json`
- partitioning for messages or invocation logs
- materialized views for reporting

The initial index set is optimized for correctness, operational clarity, and the Phase 1 service/query patterns already defined in the roadmap.
