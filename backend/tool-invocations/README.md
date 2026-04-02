# TutorMeAI Tool Invocation Logging Service

This directory holds the Ticket 14 logging service for tool invocations.

Implemented here:

- repository abstraction for append-friendly invocation persistence
- in-memory repository for tests
- logging service with queue/start/complete/fail/cancel/timeout transitions
- query helpers for conversation, session, status, and app/tool lookups

## Design Notes

- The service mirrors the PostgreSQL `tool_invocations` table in `backend/db/schema.sql`.
- Payloads are stored in the `requestPayloadJson`, `responsePayloadJson`, and `errorPayloadJson` columns, which act as the persisted payload references for audit and recovery flows.
- A lightweight transition log is appended into `metadata.transitionLog` so the service remains audit-oriented without requiring a second event table.
- The service is framework-agnostic and does not expose HTTP routes in this ticket.

## Supported Transitions

- queue
- start
- complete
- fail
- cancel
- timeout

## Query Helpers

- list by conversation
- list by session
- list by status
- list by app and tool name

Later orchestration tickets can consume this service directly for debugging, context recovery, and cost analysis.
