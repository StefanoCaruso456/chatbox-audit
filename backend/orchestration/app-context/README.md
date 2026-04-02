# Conversation App Context Assembler

Ticket 19 assembles a typed `ConversationAppContext` object for orchestration and follow-up turns.

The assembler combines:

- the conversation record
- all app sessions for that conversation
- recent completion payloads
- current invocation notes when an active tool call exists

The output is bounded and validated against the shared conversation-context contract.
