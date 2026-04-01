# TutorMeAI Third-Party App Chat Platform

## Agent Execution Roadmap

This document is the roadmap and task board for the multi-agent delivery program. It is intended to keep all agents aligned on execution order, ticket scope, dependencies, and definition of done.

## Program Board

### Initiative

TutorMeAI Third-Party App Chat Platform

### Objective

Build a production-quality AI chat platform on top of Chatbox that supports:

- third-party app registration
- tool schema discovery
- structured tool invocation
- embedded app UI
- bidirectional app/chat communication
- completion signaling
- persistent app-aware conversation context
- 3 working apps minimum, including chess and 1 authenticated app

## EPIC 0 - Architecture, Contracts, and Program Setup

### Ticket 01 - Create system architecture spec

- **Agent Owner:** Lead Architect Agent
- **Priority:** P0

#### Objective

Create the canonical architecture spec for the platform.

#### Scope

- define system components
- define lifecycle from user request -> tool routing -> app render -> interaction -> completion -> follow-up
- define chat state vs app state ownership
- define trust boundary between platform and third-party app

#### Inputs

- case study
- Chatbox base system
- required app lifecycle behaviors

#### Deliverables

- `docs/architecture.md`
- system diagram
- sequence diagram for plugin lifecycle

#### Acceptance Criteria

- architecture clearly explains all major services
- state boundaries are explicit
- lifecycle includes failure and recovery paths
- document can guide all downstream engineering tickets

#### Dependencies

- none

### Ticket 02 - Define shared contract package structure

- **Agent Owner:** Lead Architect Agent
- **Priority:** P0

#### Objective

Create a shared location for all platform contracts and version them.

#### Scope

- create contracts folder/package
- define naming and ownership conventions
- define versioning rules for manifests, message protocols, and invocation payloads

#### Deliverables

- `src/shared/contracts/`
- contract README
- file structure for schemas

#### Acceptance Criteria

- all shared interfaces have a home
- ownership is clear
- no downstream team needs to guess where contracts live

#### Dependencies

- Ticket 01

### Ticket 03 - Define AppManifest schema

- **Agent Owner:** Plugin SDK / Contract Agent
- **Priority:** P0

#### Objective

Create the typed schema and validator for third-party app registration.

#### Scope

- app metadata
- auth type
- permissions
- embed configuration
- allowed origins
- tool declarations
- safety metadata

#### Deliverables

- typed schema
- validator
- example manifests

#### Acceptance Criteria

- valid manifest passes
- invalid manifest returns readable errors
- schema supports internal, public external, and authenticated external apps

#### Dependencies

- Ticket 02

### Ticket 04 - Define ToolSchema contract

- **Agent Owner:** Plugin SDK / Contract Agent
- **Priority:** P0

#### Objective

Define how apps describe their callable tools.

#### Scope

- tool name
- description
- input schema
- output schema
- auth requirement
- timeout
- idempotency
- invocation mode

#### Deliverables

- tool schema type
- validation utilities
- examples

#### Acceptance Criteria

- schema supports dynamic tool discovery
- tool inputs and outputs are strongly typed
- routing layer can consume the contract directly

#### Dependencies

- Ticket 02

### Ticket 05 - Define embedded app host-message protocol

- **Agent Owner:** Embedded Runtime Agent
- **Priority:** P0

#### Objective

Define the message contract between host platform and embedded app.

#### Scope

- bootstrap message
- invocation message
- app state update
- heartbeat
- completion signal
- error signal
- origin validation metadata

#### Deliverables

- `EmbeddedAppMessage` contract
- protocol docs
- message examples

#### Acceptance Criteria

- every message type has defined payload structure
- both host and app can implement against it without ambiguity
- completion signaling is explicit and machine-readable

#### Dependencies

- Ticket 02

### Ticket 06 - Define CompletionSignal contract

- **Agent Owner:** Plugin SDK / Contract Agent
- **Priority:** P0

#### Objective

Create the canonical completion payload used by all apps.

#### Scope

- session identifiers
- completion status
- result summary
- structured result payload
- timestamps
- follow-up context format

#### Deliverables

- type definition
- validator
- docs

#### Acceptance Criteria

- chatbot can consume completion summary after any app finishes
- compatible with chess, weather, and authenticated app flows

#### Dependencies

- Ticket 05

### Ticket 07 - Define source-of-truth state model

- **Agent Owner:** Lead Architect Agent
- **Priority:** P0

#### Objective

Define where conversation state, app session state, and tool execution state live.

#### Scope

- conversation state model
- app session state model
- active app context model
- persistence rules
- recovery rules after refresh or reconnect

#### Deliverables

- state model spec
- entity relationship diagram

#### Acceptance Criteria

- no confusion between LLM context and durable app state
- supports multi-turn and multi-app scenarios from the case tests

#### Dependencies

- Ticket 01

### Ticket 08 - Create program dependency map

- **Agent Owner:** Lead Architect Agent
- **Priority:** P0

#### Objective

Document build order and blocking dependencies across all tickets.

#### Deliverables

- dependency map
- implementation order
- blocked/unblocked rules

#### Acceptance Criteria

- app teams cannot start before required contracts are ready
- orchestration and runtime dependencies are explicit

#### Dependencies

- Tickets 01-07

## EPIC 1 - Core Data and Backend Platform

### Ticket 09 - Design database schema

- **Agent Owner:** Platform Backend Agent
- **Priority:** P0

#### Objective

Design database tables for conversations, app registrations, app sessions, tool invocations, and auth tokens.

#### Deliverables

- schema file
- migrations
- index plan

#### Acceptance Criteria

- schema supports persistence across sessions
- supports multiple concurrent app sessions
- stores invocation history and app context references

#### Dependencies

- Ticket 07

### Ticket 10 - Build app registry service

- **Agent Owner:** Platform Backend Agent
- **Priority:** P0

#### Objective

Create service layer for app registration, validation, and retrieval.

#### Scope

- register app
- list available apps
- fetch app by id
- validate manifest
- app approval status

#### Deliverables

- service implementation
- tests

#### Acceptance Criteria

- apps can be registered and queried
- invalid manifests are rejected
- approved-only mode can be enforced

#### Dependencies

- Tickets 03, 09

### Ticket 11 - Build app registry API

- **Agent Owner:** Platform Backend Agent
- **Priority:** P0

#### Objective

Expose backend endpoints for registry operations.

#### Deliverables

- API routes
- request/response docs
- error shapes

#### Acceptance Criteria

- API supports app registration and app discovery
- routes return normalized errors
- API reflects approval and safety status

#### Dependencies

- Ticket 10

### Ticket 12 - Build conversation persistence service

- **Agent Owner:** Platform Backend Agent
- **Priority:** P0

#### Objective

Persist chat history and conversation metadata across sessions.

#### Deliverables

- service layer
- storage schema usage
- CRUD operations

#### Acceptance Criteria

- chat history survives refresh/session restart
- conversations can reference active app contexts
- retrieval is performant

#### Dependencies

- Ticket 09

### Ticket 13 - Build app session persistence service

- **Agent Owner:** Platform Backend Agent
- **Priority:** P0

#### Objective

Store and retrieve app session state independently from chat text.

#### Deliverables

- session state service
- create/update/read logic

#### Acceptance Criteria

- app state persists independently
- sessions can be resumed or referenced later
- multiple app sessions can exist within one conversation

#### Dependencies

- Tickets 07, 09

### Ticket 14 - Build tool invocation logging service

- **Agent Owner:** Platform Backend Agent
- **Priority:** P0

#### Objective

Track every tool call for debugging, context recovery, and cost analysis.

#### Deliverables

- tool invocation table/service
- logging hooks

#### Acceptance Criteria

- every invocation stores `appId`, `toolName`, `toolCallId`, `sessionId`, `conversationId`, `status`, `latency`, and payload reference
- logs are queryable for QA and cost reporting

#### Dependencies

- Ticket 09

### Ticket 15 - Build normalized error model

- **Agent Owner:** Platform Backend Agent
- **Priority:** P0

#### Objective

Standardize errors across platform, runtime, and app integration layers.

#### Deliverables

- error types
- mapping utilities
- API error shape docs

#### Acceptance Criteria

- all services return predictable error objects
- frontend can display meaningful messages
- app crashes and timeouts map cleanly into chat flows

#### Dependencies

- Ticket 11

## EPIC 2 - Chat Orchestration and Tool Routing

### Ticket 16 - Build available-tool discovery service

- **Agent Owner:** Chat Orchestration Agent
- **Priority:** P0

#### Objective

Allow the chatbot runtime to discover currently available tools from registered apps.

#### Deliverables

- discovery layer
- app/tool filtering logic

#### Acceptance Criteria

- returns tools based on approved apps and user permissions
- supports multiple apps at runtime
- excludes unavailable tools cleanly

#### Dependencies

- Ticket 11

### Ticket 17 - Build dynamic tool injection layer

- **Agent Owner:** Chat Orchestration Agent
- **Priority:** P0

#### Objective

Inject current tool schemas into the LLM runtime safely and predictably.

#### Deliverables

- prompt/tool assembly logic
- schema formatting rules

#### Acceptance Criteria

- tool schemas are available to the model at runtime
- injection strategy is bounded and deterministic
- works for app-specific and multi-app conversations

#### Dependencies

- Tickets 04, 16

### Ticket 18 - Build tool routing service

- **Agent Owner:** Chat Orchestration Agent
- **Priority:** P0

#### Objective

Select the correct app/tool for a user request and invoke it.

#### Deliverables

- routing engine
- invocation adapter

#### Acceptance Criteria

- related requests map to appropriate apps
- unrelated queries do not trigger apps
- ambiguous requests are handled safely
- tool invocations are logged

#### Dependencies

- Tickets 14, 16, 17

### Ticket 19 - Build active app context assembler

- **Agent Owner:** Chat Orchestration Agent
- **Priority:** P0

#### Objective

Provide the chatbot with the active app state and relevant completion summaries for follow-up turns.

#### Deliverables

- context assembly service
- context truncation/selection rules

#### Acceptance Criteria

- chatbot can answer mid-app and post-app questions accurately
- chess board state can be surfaced for analysis
- multi-app contexts do not overwrite one another

#### Dependencies

- Tickets 12, 13, 14

### Ticket 20 - Build refusal logic for unrelated queries

- **Agent Owner:** Chat Orchestration Agent
- **Priority:** P1

#### Objective

Ensure the chatbot refuses to invoke apps when the query is unrelated.

#### Deliverables

- refusal rules
- tests

#### Acceptance Criteria

- app tools are not called on irrelevant prompts
- refusal behavior is explainable and testable
- satisfies case study scenario 7

#### Dependencies

- Ticket 18

### Ticket 21 - Build ambiguous-intent handling

- **Agent Owner:** Chat Orchestration Agent
- **Priority:** P1

#### Objective

Handle cases where a query could map to multiple apps.

#### Deliverables

- disambiguation logic
- fallback response path

#### Acceptance Criteria

- chatbot can ask a clarifying question or choose using deterministic rules
- satisfies case study ambiguous routing scenario

#### Dependencies

- Ticket 18

## EPIC 3 - Frontend Chat Shell and Embedded Runtime

### Ticket 22 - Build persistent chat shell UI

- **Agent Owner:** Frontend Chat Shell Agent
- **Priority:** P0

#### Objective

Implement the main chat interface with persistent history and app-aware layout.

#### Deliverables

- chat UI
- history rendering
- app container slots

#### Acceptance Criteria

- persistent conversations load correctly
- app render area is visible within chat experience
- streaming text and app blocks coexist cleanly

#### Dependencies

- Ticket 12

### Ticket 23 - Build streaming response handling

- **Agent Owner:** Frontend Chat Shell Agent
- **Priority:** P0

#### Objective

Support real-time streamed AI responses.

#### Deliverables

- frontend stream handler
- incremental rendering

#### Acceptance Criteria

- model responses stream smoothly
- app tool usage states can be shown while waiting
- meets expected real-time chat experience

#### Dependencies

- Ticket 22

### Ticket 24 - Build embedded iframe host

- **Agent Owner:** Embedded Runtime Agent
- **Priority:** P0

#### Objective

Create the host container for rendering third-party app UI inside chat.

#### Deliverables

- iframe host component
- load states
- error states

#### Acceptance Criteria

- apps render inside the chat window
- iframe can be configured per app manifest
- failure to load is surfaced cleanly

#### Dependencies

- Tickets 03, 22

### Ticket 25 - Build postMessage bridge

- **Agent Owner:** Embedded Runtime Agent
- **Priority:** P0

#### Objective

Implement bidirectional communication between platform and embedded app.

#### Deliverables

- parent-child message bridge
- validation utilities

#### Acceptance Criteria

- host can send bootstrap and invocation messages
- app can send state updates and completion messages
- message handling follows the shared protocol

#### Dependencies

- Tickets 05, 24

### Ticket 26 - Build origin validation and sandbox checks

- **Agent Owner:** Embedded Runtime Agent
- **Priority:** P0

#### Objective

Protect the platform from unsafe message origins or overly permissive app embedding.

#### Deliverables

- origin validation logic
- sandbox config defaults

#### Acceptance Criteria

- invalid origins are rejected
- iframe sandbox is least-privilege by default
- unsafe runtime communication is blocked

#### Dependencies

- Tickets 03, 25

### Ticket 27 - Build app heartbeat / timeout detection

- **Agent Owner:** Embedded Runtime Agent
- **Priority:** P1

#### Objective

Detect hung or broken app sessions.

#### Deliverables

- heartbeat handler
- timeout fallback behavior

#### Acceptance Criteria

- stalled app sessions are detected
- user sees a recovery path
- chat remains stable when app fails

#### Dependencies

- Ticket 25

### Ticket 28 - Build app completion bridge to chat

- **Agent Owner:** Embedded Runtime Agent
- **Priority:** P0

#### Objective

When the app finishes, push the completion state back into the chat platform.

#### Deliverables

- completion event handler
- backend/state integration

#### Acceptance Criteria

- completion updates conversation state
- chatbot can discuss result afterward
- satisfies completion signaling requirement

#### Dependencies

- Tickets 06, 13, 25

## EPIC 4 - Authentication, Security, and Safety

### Ticket 29 - Build platform user authentication

- **Agent Owner:** Auth & Security Agent
- **Priority:** P0

#### Objective

Implement authentication for the chat platform itself.

#### Deliverables

- auth flow
- session handling
- protected routes

#### Acceptance Criteria

- users can sign in
- protected chat/app routes enforce auth
- platform-level auth is separate from app auth

#### Dependencies

- Ticket 22

### Ticket 30 - Build external app OAuth framework

- **Agent Owner:** Auth & Security Agent
- **Priority:** P0

#### Objective

Support authenticated third-party apps using OAuth2 or similar.

#### Deliverables

- OAuth start/callback flow
- token exchange
- storage contract

#### Acceptance Criteria

- at least one app can complete OAuth
- redirect and callback flows are stable
- meets authenticated app requirement

#### Dependencies

- Tickets 03, 29

### Ticket 31 - Build secure token storage and refresh

- **Agent Owner:** Auth & Security Agent
- **Priority:** P0

#### Objective

Store and refresh app credentials safely.

#### Deliverables

- secure token persistence
- refresh workflow

#### Acceptance Criteria

- tokens are stored securely
- refresh works automatically when needed
- app invocation can access valid tokens without exposing them to frontend unnecessarily

#### Dependencies

- Ticket 30

### Ticket 32 - Build app approval and safety review model

- **Agent Owner:** Auth & Security Agent
- **Priority:** P1

#### Objective

Introduce a safety gate for approving apps before use.

#### Deliverables

- safety review metadata model
- approval status workflow

#### Acceptance Criteria

- only approved apps can be exposed in production mode
- review metadata exists for age appropriateness and permissions
- aligns with K-12 safety expectations

#### Dependencies

- Tickets 03, 10

### Ticket 33 - Build CSP and embed security configuration

- **Agent Owner:** Auth & Security Agent
- **Priority:** P1

#### Objective

Implement content security rules around embedded app loading.

#### Deliverables

- CSP config
- allowed origins config
- security notes

#### Acceptance Criteria

- embedded runtime obeys CSP
- only approved origins load
- config is documented and testable

#### Dependencies

- Ticket 26

## EPIC 5 - Required Apps

### Ticket 34 - Build chess app manifest and registration

- **Agent Owner:** Chess App Agent
- **Priority:** P0

#### Objective

Create the chess app's registration artifact.

#### Deliverables

- manifest
- tool declarations
- embed config

#### Acceptance Criteria

- chess app is discoverable by registry
- required chess tools are exposed

#### Dependencies

- Tickets 03, 04, 10

### Ticket 35 - Build chess board UI and game engine integration

- **Agent Owner:** Chess App Agent
- **Priority:** P0

#### Objective

Implement the chess board and legal move handling.

#### Deliverables

- interactive board
- move validator
- visual game state

#### Acceptance Criteria

- board renders in chat
- legal moves succeed
- invalid moves return app-level errors
- meets required chess UI behavior

#### Dependencies

- Tickets 24, 25, 34

### Ticket 36 - Build chess tool handlers

- **Agent Owner:** Chess App Agent
- **Priority:** P0

#### Objective

Implement chess actions such as start game, move piece, get help state, and completion.

#### Deliverables

- start game tool
- move tool
- help-state export
- completion emitter

#### Acceptance Criteria

- user can say "let's play chess"
- chatbot can reason about current board state
- game completion returns cleanly to chat

#### Dependencies

- Tickets 18, 19, 28, 35

### Ticket 37 - Build public external app manifest and integration

- **Agent Owner:** Public External App Agent
- **Priority:** P1

#### Objective

Implement a public external app such as weather.

#### Deliverables

- public app manifest
- external API integration
- UI and result summary

#### Acceptance Criteria

- app does not require user auth
- app renders in chat
- chatbot can discuss result after completion
- proves public external integration pattern

#### Dependencies

- Tickets 24, 25, 28

### Ticket 38 - Build authenticated app manifest and integration

- **Agent Owner:** Authenticated App Agent
- **Priority:** P1

#### Objective

Implement an authenticated app such as Spotify playlist creator.

#### Deliverables

- authenticated app manifest
- OAuth-connected flow
- protected tool execution
- result summary flow

#### Acceptance Criteria

- user can connect account
- authorized action succeeds
- completion state comes back into chat
- proves authenticated external integration pattern

#### Dependencies

- Tickets 30, 31, 24, 25, 28

## EPIC 6 - Reliability, UX Recovery, and Multi-App Support

### Ticket 39 - Build failure-state UX for app crashes/timeouts

- **Agent Owner:** Frontend Chat Shell Agent
- **Priority:** P1

#### Objective

Give users clear UI when an app fails, crashes, or times out.

#### Deliverables

- retry state
- abandon state
- resume conversation fallback

#### Acceptance Criteria

- broken app does not strand user
- recovery path is understandable
- graceful handling aligns with case requirements

#### Dependencies

- Tickets 15, 27, 28

### Ticket 40 - Build multi-app switching support in a single conversation

- **Agent Owner:** Frontend Chat Shell Agent + Chat Orchestration Agent
- **Priority:** P1

#### Objective

Support switching between multiple apps in the same thread without losing context.

#### Deliverables

- multi-app state handling
- UI indicators for active app
- context selection logic

#### Acceptance Criteria

- user can use more than one app in same conversation
- chatbot retains correct app context
- satisfies case test scenario 5

#### Dependencies

- Tickets 19, 22, 28, 37, 38

## EPIC 7 - QA, Docs, Deployment, Cost Analysis

### Ticket 41 - Build contract tests for manifest, tool schema, and message protocol

- **Agent Owner:** QA / Test Agent
- **Priority:** P0

#### Objective

Validate that core contracts are stable and enforced.

#### Deliverables

- contract tests
- failure case tests

#### Acceptance Criteria

- invalid contracts fail loudly
- valid examples pass
- protects shared interfaces from regression

#### Dependencies

- Tickets 03-06

### Ticket 42 - Build end-to-end lifecycle tests

- **Agent Owner:** QA / Test Agent
- **Priority:** P0

#### Objective

Test full flow from request -> app invocation -> UI render -> interaction -> completion -> follow-up.

#### Deliverables

- E2E tests for chess
- E2E tests for public app
- E2E tests for authenticated app

#### Acceptance Criteria

- required lifecycle passes for all target app types
- completion signaling and context retention are verified

#### Dependencies

- Tickets 36-40

### Ticket 43 - Build routing and refusal scenario tests

- **Agent Owner:** QA / Test Agent
- **Priority:** P1

#### Objective

Test ambiguous routing and unrelated-query refusal.

#### Deliverables

- scenario tests

#### Acceptance Criteria

- ambiguous query handled safely
- unrelated query does not invoke apps
- aligns to grader test scenarios

#### Dependencies

- Tickets 20, 21

### Ticket 44 - Build setup guide and architecture docs

- **Agent Owner:** Docs / DevEx Agent
- **Priority:** P0

#### Objective

Create setup and architecture docs for graders and developers.

#### Deliverables

- `README`
- local setup instructions
- architecture summary
- API docs

#### Acceptance Criteria

- project can be understood and run from docs
- plugin system is clearly documented
- submission requirements are covered

#### Dependencies

- Tickets 01-40

### Ticket 45 - Build third-party developer integration guide

- **Agent Owner:** Docs / DevEx Agent
- **Priority:** P1

#### Objective

Document how a third-party developer builds an app for the platform.

#### Deliverables

- manifest guide
- tool schema guide
- embed/runtime guide
- completion signaling guide
- local testing guide

#### Acceptance Criteria

- external developers can build against the contract without reading platform internals
- guide includes sample app

#### Dependencies

- Tickets 03-06, 24-28

### Ticket 46 - Produce AI cost analysis

- **Agent Owner:** Docs / DevEx Agent
- **Priority:** P0

#### Objective

Track actual development spend and estimate production cost by user volume.

#### Deliverables

- dev spend report
- assumptions
- 100 / 1K / 10K / 100K user cost projections

#### Acceptance Criteria

- includes tokens, API calls, assumptions, and monthly estimates
- aligns with case study submission requirement

#### Dependencies

- Tickets 14, 18, 36-38

### Ticket 47 - Prepare demo script and submission checklist

- **Agent Owner:** Docs / DevEx Agent
- **Priority:** P1

#### Objective

Create a grader-ready demo path and final checklist.

#### Deliverables

- demo outline
- scenario order
- submission checklist

#### Acceptance Criteria

- 3-5 minute demo can clearly show platform value
- showcases plugin lifecycle, auth flow, and follow-up context
- covers required deliverables

#### Dependencies

- Tickets 42, 44, 46

## Recommended Execution Order

### Phase 0

- Tickets 01-08

### Phase 1

- Tickets 09-15

### Phase 2

- Tickets 16-21
- Tickets 22-28

### Phase 3

- Tickets 29-33

### Phase 4

- Tickets 34-38

### Phase 5

- Tickets 39-40

### Phase 6

- Tickets 41-47

## Task Ticket Template for Each Child Agent

You are a specialized implementation agent inside the TutorMeAI multi-agent delivery program.

Complete only the assigned ticket.

### Rules

- Respect shared contracts and architecture.
- Do not invent new shared interfaces unless absolutely required.
- If you must change a contract, document it and flag downstream impact.
- Stay within allowed files.
- Add tests or test notes.
- Return blockers explicitly if dependencies are missing.

### Return This Exact Format

1. Ticket Title
2. Objective
3. Files Modified
4. Files Added
5. Interfaces Introduced or Changed
6. Implementation Summary
7. Acceptance Criteria Check
8. Tests Added or Run
9. Risks / Follow-up Work
10. Blockers

### Assigned Ticket

`[PASTE TICKET HERE]`

## Strong Recommendation

Run this as:

1. 1 orchestrator
2. 1 architect pass first
3. contracts locked second
4. 1 vertical slice with chess before broader expansion
5. then external public app
6. then authenticated app
7. then QA/docs/cost analysis

That is the cleanest way to avoid the biggest failure mode in this case: agents building disconnected app demos before the shared plugin lifecycle is actually stable.

## Master Orchestrator Spec

You are the Master Orchestrator for a multi-agent software delivery program.

Your mission is to deliver a production-quality AI chat platform for TutorMeAI that supports third-party educational apps inside chat.

### The Platform Must

- support real-time AI chat with streaming responses
- persist chat history across sessions
- maintain context about active third-party apps and their state
- support multi-turn conversations spanning app interactions
- recover gracefully when apps fail, timeout, or return errors
- support user auth for the platform
- allow third-party apps to register themselves and their capabilities
- allow apps to define tool schemas discoverable by the chatbot
- render app UI inside the chat experience
- receive structured tool invocations from the chatbot
- signal completion back to the chatbot
- maintain app state independently from chat
- support at least 3 apps, including chess and one authenticated app

### Hard Product Requirements

1. Chess is required.
2. At least 2 more apps are required.
3. At least 1 third-party app must require auth.
4. The system must support app invocation, UI rendering, completion signaling, context retention, multiple apps, ambiguous query handling, and refusal for unrelated queries.
5. Safety, security, and K-12 appropriateness must be built into the contract from the start.

### Operating Rules

- Use contract-first development.
- Build vertically, not just horizontally.
- Do not let app teams start until shared contracts are complete.
- Prefer stable interfaces over fast but brittle shortcuts.
- Every agent must define what changed, files touched, tests added, blockers, and follow-up risks.
- If blocked, stop and produce a blocker note with exact missing dependency.
- Keep state boundaries strict: chat state, app state, auth state, and invocation history must not be loosely mixed.
- Enforce least privilege for app embedding and auth.
- Do not produce vague plans. Produce implementation-ready output.

### Team Topology

1. Lead Architect Agent
2. Plugin SDK / Contract Agent
3. Platform Backend Agent
4. Chat Orchestration Agent
5. Frontend Chat Shell Agent
6. Embedded Runtime Agent
7. Auth & Security Agent
8. Chess App Agent
9. Public External App Agent
10. Authenticated App Agent
11. QA / Test Agent
12. Docs / DevEx / Cost Analysis Agent

### Required Execution Order

#### Phase 0 - Architecture and Contracts

- Ticket 01: Create system architecture spec
- Ticket 02: Define shared contract package structure
- Ticket 03: Define AppManifest schema
- Ticket 04: Define ToolSchema contract
- Ticket 05: Define embedded app host-message protocol
- Ticket 06: Define CompletionSignal contract
- Ticket 07: Define source-of-truth state model
- Ticket 08: Create program dependency map

#### Phase 1 - Core Platform Backend

- Ticket 09: Design database schema
- Ticket 10: Build app registry service
- Ticket 11: Build app registry API
- Ticket 12: Build conversation persistence service
- Ticket 13: Build app session persistence service
- Ticket 14: Build tool invocation logging service
- Ticket 15: Build normalized error model

#### Phase 2 - Orchestration and Runtime

- Ticket 16: Build available-tool discovery service
- Ticket 17: Build dynamic tool injection layer
- Ticket 18: Build tool routing service
- Ticket 19: Build active app context assembler
- Ticket 20: Build refusal logic for unrelated queries
- Ticket 21: Build ambiguous-intent handling
- Ticket 22: Build persistent chat shell UI
- Ticket 23: Build streaming response handling
- Ticket 24: Build embedded iframe host
- Ticket 25: Build postMessage bridge
- Ticket 26: Build origin validation and sandbox checks
- Ticket 27: Build app heartbeat / timeout detection
- Ticket 28: Build app completion bridge to chat

#### Phase 3 - Auth and Security

- Ticket 29: Build platform user authentication
- Ticket 30: Build external app OAuth framework
- Ticket 31: Build secure token storage and refresh
- Ticket 32: Build app approval and safety review model
- Ticket 33: Build CSP and embed security configuration

#### Phase 4 - Required Apps

- Ticket 34: Build chess app manifest and registration
- Ticket 35: Build chess board UI and game engine integration
- Ticket 36: Build chess tool handlers
- Ticket 37: Build public external app manifest and integration
- Ticket 38: Build authenticated app manifest and integration

#### Phase 5 - Reliability and Multi-App Behavior

- Ticket 39: Build failure-state UX for app crashes/timeouts
- Ticket 40: Build multi-app switching support in a single conversation

#### Phase 6 - QA, Docs, and Submission

- Ticket 41: Build contract tests for manifest, tool schema, and message protocol
- Ticket 42: Build end-to-end lifecycle tests
- Ticket 43: Build routing and refusal scenario tests
- Ticket 44: Build setup guide and architecture docs
- Ticket 45: Build third-party developer integration guide
- Ticket 46: Produce AI cost analysis
- Ticket 47: Prepare demo script and submission checklist

### For Each Ticket, Generate and Return

1. Ticket title
2. Assigned agent
3. Objective
4. Inputs
5. Files allowed to modify
6. Files not allowed to modify
7. Dependencies
8. Implementation notes
9. Acceptance criteria
10. Test plan
11. Output summary
12. Blockers, if any

### Execution Requirements

- Do not skip acceptance criteria.
- Do not collapse multiple tickets into vague combined work unless explicitly safe to do so.
- Before moving to the next phase, confirm all prior blocking tickets are complete.
- When a shared contract changes, update architecture and docs.
- When a task is complete, summarize the exact files and interfaces changed.
- Treat this like a real staff-level engineering program, not a hackathon brainstorm.

### Definition of Done for the Whole Program

- 3 working apps including chess and one authenticated app
- app invocation works
- app UI renders in chat
- completion signaling works
- chatbot retains app context after completion
- multi-app switching works
- ambiguous requests are handled safely
- unrelated app invocations are refused
- docs, deployment guidance, and cost analysis are complete
