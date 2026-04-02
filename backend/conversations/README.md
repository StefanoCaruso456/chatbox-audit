# TutorMeAI Conversation Persistence Service

This directory holds the Ticket 12 backend service layer for durable conversation history.

Implemented here:

- repository abstraction for conversation and message persistence
- in-memory repository for service tests and local development
- conversation service for create, read, append, archive, metadata update, and active app reference updates

## Schema Mapping

This service is shaped by the PostgreSQL tables created in `backend/db/schema.sql`:

- `conversations`
- `messages`

The service keeps the same durable identifiers supplied by callers instead of generating hidden IDs. It also keeps the active app session reference on the conversation record so the backend can later resolve app-aware chat context.

## Service Behaviors

- conversation creation is idempotent by caller-supplied `conversationId` only in the sense that duplicate IDs are rejected
- message appends require caller-supplied `messageId` and `sequenceNo`
- duplicate message IDs with identical payloads are treated as safe replays
- sequence collisions are rejected to preserve message ordering
- list queries return recent non-deleted conversations for a user
- app context references are stored on the conversation and updated independently from message history
