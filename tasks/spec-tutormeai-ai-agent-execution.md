# TutorMeAI Case Study

## AI Agent Execution Spec Sheet for Codex

## 1. Program Objective

Build a production-quality AI chat platform on top of Chatbox that allows third-party applications to:

- register themselves and their capabilities
- expose tool schemas discoverable by the chatbot
- render custom UI inside the chat experience
- receive structured tool invocations
- communicate state back to the platform
- signal completion cleanly
- preserve context across multi-turn chat interactions
- support at least 3 apps, including chess and at least 1 authenticated app

## 2. Delivery Objective

The agent system must produce:

- working core chat platform
- plugin/app contract
- app registry and discovery layer
- tool invocation orchestration
- embedded app rendering framework
- app-to-chat state bridge
- auth support for authenticated third-party apps
- safety and sandboxing controls
- three integrated demo apps
- tests, docs, deployment, and cost analysis

## 3. Execution Rules for All Agents

### Global Rules

- Do not invent architecture outside the case scope.
- Prefer vertical completion over broad partial scaffolding.
- Follow contract-first design.
- Every task must produce code plus docs plus test notes.
- Every API or interface must define request, response, errors, and state transitions.
- Preserve backward compatibility once a shared contract is introduced.
- Log assumptions explicitly.
- If blocked, create a blocker note with recommended next action rather than silently skipping.

### Engineering Rules

- Strong typing required for shared interfaces.
- Shared contracts go in a central schema package/folder.
- Avoid hidden coupling between chat state and app state.
- Separate platform auth from per-app auth.
- Sandbox third-party UI by default.
- Every tool invocation must be traceable by `conversationId`, `appId`, `toolCallId`, `sessionId`, and `userId`.
- Every agent must update the architecture notes when changing a shared contract.

## 4. Recommended Agent Topology

Use the following agent swarm:

- Lead Architect Agent
- Platform Backend Agent
- Chat Orchestration Agent
- Plugin SDK / Contract Agent
- Frontend Chat Shell Agent
- Embedded App Runtime Agent
- Auth & Security Agent
- Chess App Agent
- Public External App Agent (example: Flashcards)
- Authenticated App Agent (example: Spotify)
- QA / Test Agent
- Docs / DevEx / Cost Analysis Agent

This mirrors the case-study needs across chat, platform interface, app rendering, auth, state, safety, testing, and submission assets.

## 5. Shared System Design Assumptions

These assumptions should be locked first by the Lead Architect Agent.

### Suggested Baseline Stack

- Frontend / client: Next.js on Vercel
- Backend / API / orchestration: Node.js service on Railway
- Realtime streaming: Server-Sent Events (SSE)
- Database: PostgreSQL
- LLM: OpenAI or Anthropic with function calling
- App embedding: iframe + postMessage
- Auth: platform authentication plus per-app OAuth handled by the Railway backend

### Required System Domains

- chat domain
- plugin registry domain
- tool invocation domain
- embedded app runtime domain
- auth domain
- app session state domain
- safety / trust domain
- observability / analytics domain

## 6. Shared Contracts That Must Exist Before Most Build Work

These are P0 artifacts.

### Required Shared Contracts

- `AppManifest`
- `ToolSchema`
- `ToolInvocationRequest`
- `ToolInvocationResult`
- `EmbeddedAppMessage`
- `AppSessionState`
- `CompletionSignal`
- `AppAuthConfig`
- `SafetyReviewRecord`
- `ConversationAppContext`

### Minimum Contract Fields

#### `AppManifest`

- `appId`
- `name`
- `version`
- `description`
- `category`
- `authType`
- `uiEmbedConfig`
- `toolDefinitions`
- `permissions`
- `allowedOrigins`
- `safetyMetadata`
- `developerMetadata`

#### `ToolSchema`

- `toolName`
- `description`
- `inputSchema`
- `outputSchema`
- `invocationMode`
- `timeoutMs`
- `requiresAuth`
- `idempotent`

#### `CompletionSignal`

- `appId`
- `sessionId`
- `conversationId`
- `status`
- `resultSummary`
- `resultPayload`
- `timestamp`

#### `EmbeddedAppMessage`

- `messageType`
- `appId`
- `sessionId`
- `conversationId`
- `correlationId`
- `payload`
- `sourceOrigin`

## 7. Agent-by-Agent Spec Sheets

### Agent 1: Lead Architect Agent

#### Objective

Define the system architecture, shared contracts, sequencing plan, and integration boundaries before implementation begins.

#### Responsibilities

- choose the core architecture
- define source of truth for chat state vs app state
- define plugin lifecycle
- define message protocol between chat shell and embedded apps
- define contract folder/package
- define dependency order for all other agents

#### Inputs

- case study
- Chatbox base app
- required feature list
- app requirements including chess and authenticated app

#### Outputs

- `architecture.md`
- system diagram
- lifecycle diagram
- shared contracts v1
- folder ownership map
- implementation order

#### Acceptance Criteria

- architecture explains invocation -> render -> interaction -> completion -> follow-up
- boundaries are clear between platform, app, auth, and chat
- contracts are typed and versioned
- no unresolved ambiguity around app messaging or completion signaling

#### Dependencies

None

#### Blocks

All other engineering agents if missing

### Agent 2: Platform Backend Agent

#### Objective

Build backend services for chat persistence, app registry, tool execution orchestration, session storage, and state retrieval.

#### Responsibilities

- app registration API
- app discovery API
- tool invocation endpoint
- app session persistence
- conversation persistence
- tool call logging
- error handling and retries
- state retrieval for follow-up chat turns

#### Inputs

- architecture contracts
- DB choice
- auth requirements
- app lifecycle definitions

#### Outputs

- backend routes
- service layer
- database schema and migrations
- tool execution records
- app session records

#### Acceptance Criteria

- apps can register and be queried
- tools can be invoked via structured request
- state persists across reload/session resumption
- invocation history is queryable
- failures return normalized error objects

#### Dependencies

Lead Architect Agent

### Agent 3: Chat Orchestration Agent

#### Objective

Make the chatbot aware of available tools, current app sessions, and app results so it can route correctly and maintain context.

#### Responsibilities

- dynamic tool discovery at runtime
- tool routing logic
- model prompt/tool injection strategy
- context assembly for active app state
- refusal behavior for unrelated queries
- follow-up reasoning after app completion

#### Inputs

- app registry API
- tool schema contract
- conversation state
- app context records
- test scenarios from case study

#### Outputs

- orchestration service
- tool-selection layer
- context builder
- prompt assembly rules
- routing tests

#### Acceptance Criteria

- ambiguous queries can route or ask follow-up cleanly
- unrelated queries do not trigger apps
- chatbot can reason over current chess board or app result summary
- multi-app conversations do not lose state

#### Dependencies

Lead Architect Agent, Platform Backend Agent

### Agent 4: Plugin SDK / Contract Agent

#### Objective

Create the developer-facing app integration contract so third-party apps can register tools, define UI, and communicate with the host.

#### Responsibilities

- define manifest schema
- define tool schema contract
- define host-app messaging SDK
- define completion signaling contract
- define local mock harness for app developers
- create sample app templates

#### Inputs

- architecture decisions
- embedded runtime constraints
- auth model
- safety model

#### Outputs

- shared types
- app SDK package or folder
- sample manifest
- sample message handlers
- integration guide

#### Acceptance Criteria

- a third-party developer can integrate without editing platform core
- SDK supports UI render, state update, and completion signaling
- example manifests validate correctly
- contracts are strongly typed

#### Dependencies

Lead Architect Agent

### Agent 5: Frontend Chat Shell Agent

#### Objective

Build the user-facing chat experience that can display chat, streaming responses, embedded apps, status indicators, and context-aware transitions.

#### Responsibilities

- real-time chat UI
- conversation history UI
- app launch cards / embedded containers
- streaming response handling
- app loading / error states
- multi-app navigation in same conversation
- visual recovery flows for timeouts and failures

#### Inputs

- orchestration endpoints
- registry data
- runtime UI contract
- session data model

#### Outputs

- chat UI components
- conversation persistence integration
- embedded app slots
- state banners, spinners, status text

#### Acceptance Criteria

- app renders inside chat window
- history persists
- user can move from chat to app and back
- status indicators exist throughout async flows
- error states are human-readable

#### Dependencies

Platform Backend Agent, Chat Orchestration Agent, Embedded App Runtime Agent

### Agent 6: Embedded App Runtime Agent

#### Objective

Build the host runtime that safely renders third-party apps and manages bidirectional communication between the app and the chat platform.

#### Responsibilities

- iframe host framework
- postMessage protocol
- origin validation
- session bootstrap payloads
- parent-child message routing
- completion event handling
- app crash/time-out detection
- sandbox policy defaults

#### Inputs

- shared messaging protocol
- sandboxing rules
- frontend shell needs

#### Outputs

- embedded runtime layer
- message broker
- validation utilities
- timeout and heartbeat logic

#### Acceptance Criteria

- embedded apps can receive invocation payloads
- apps can send state updates and completion events
- invalid origins are rejected
- crashed apps fail gracefully without taking down chat
- runtime works for chess and other app types

#### Dependencies

Lead Architect Agent, Plugin SDK Agent, Frontend Chat Shell Agent

### Agent 7: Auth & Security Agent

#### Objective

Design and implement platform auth, app auth, token handling, app isolation, and safety controls appropriate for a K-12 platform.

#### Responsibilities

- platform user auth
- OAuth flow for at least one external app
- token storage and refresh
- permission scoping
- app approval model
- CSP and iframe sandbox rules
- origin allowlists
- safety review metadata
- least-privilege app access patterns

#### Inputs

- auth requirements from case
- platform architecture
- embedded runtime design
- app categories: internal, external public, external authenticated

#### Outputs

- auth flow implementation
- secure token storage design
- security checklist
- CSP config
- app review / approval policy notes

#### Acceptance Criteria

- platform login works
- authenticated app authorization flow works
- tokens refresh safely
- app iframe cannot access parent DOM directly
- unsafe or unapproved app paths are blocked by design

#### Dependencies

Lead Architect Agent, Platform Backend Agent, Embedded Runtime Agent

### Agent 8: Chess App Agent

#### Objective

Implement the required chess app as the flagship high-complexity integration.

#### Responsibilities

- chess app manifest
- legal move validation
- board UI
- start game flow
- move piece flow
- invalid move error messaging
- export current board state for chatbot analysis
- completion signaling on game end

#### Inputs

- plugin SDK
- runtime contract
- chat shell rendering rules

#### Outputs

- chess app implementation
- board state serializer
- app message handlers
- manifest registration

#### Acceptance Criteria

- user can say "let's play chess"
- board appears in chat
- user can make legal moves
- invalid moves are rejected with app feedback
- user can ask mid-game "what should I do here?"
- chatbot receives board state and responds appropriately
- game end transitions back to chat cleanly

#### Dependencies

Plugin SDK Agent, Embedded Runtime Agent, Chat Orchestration Agent

### Agent 9: Public External App Agent

#### Objective

Implement a non-auth public app to prove low-friction external integration.

#### Recommended App

Flashcards Coach

#### Responsibilities

- public external content integration
- manifest and tools
- UI rendering
- structured result summary for chatbot follow-up
- error handling for app/runtime failures

#### Outputs

- working flashcards app
- manifest
- app result summaries
- test cases

#### Acceptance Criteria

- user can invoke flashcards app from chat
- UI renders correctly
- result can be discussed after completion
- app works without user-specific auth

#### Dependencies

Plugin SDK Agent, Embedded Runtime Agent, Chat Orchestration Agent

### Agent 10: Authenticated App Agent

#### Objective

Implement one authenticated app to prove OAuth-capable plugin architecture.

#### Recommended App

Spotify Playlist Creator

#### Responsibilities

- OAuth integration
- token exchange + refresh
- protected tool invocation
- embedded UI or action panel
- summary returned to chatbot after success

#### Outputs

- authenticated app implementation
- OAuth config
- secure token persistence
- manifest

#### Acceptance Criteria

- user can connect account
- token is stored securely
- app can invoke authorized actions
- app result can be surfaced in chat afterward
- auth failure states are clear and recoverable

#### Dependencies

Auth & Security Agent, Plugin SDK Agent, Embedded Runtime Agent, Chat Orchestration Agent

### Agent 11: QA / Test Agent

#### Objective

Validate the full lifecycle and prevent regression across plugin registration, tool invocation, rendering, completion, context retention, auth, and multi-app switching.

#### Responsibilities

- test matrix
- contract tests
- integration tests
- e2e lifecycle tests
- routing accuracy tests
- timeout and failure tests
- auth flow tests
- multi-app context tests

#### Must Cover Case Test Scenarios

- user asks to use third-party app
- app UI renders
- user interacts and returns to chatbot
- chatbot answers about results after completion
- user switches across multiple apps
- ambiguous query routing
- refusal on unrelated queries

#### Outputs

- test plan
- automated tests
- manual QA checklist
- bug triage board

#### Acceptance Criteria

- P0 scenarios pass consistently
- regressions are documented
- failure paths are verified, not ignored

#### Dependencies

All engineering agents

### Agent 12: Docs / DevEx / Cost Analysis Agent

#### Objective

Produce submission-ready documentation for developers, graders, and deployment.

#### Responsibilities

- setup guide
- architecture overview
- API docs
- plugin lifecycle docs
- third-party developer guide
- AI cost tracking and projections
- demo script outline
- deployment notes

#### Inputs

- final implementation
- actual dev usage metrics
- estimated prod assumptions
- submission requirements

#### Outputs

- `README`
- `docs/` folder
- API reference
- integration guide
- cost analysis doc
- deployment guide
- demo checklist

#### Acceptance Criteria

- a developer can run the project from docs only
- graders can understand architecture quickly
- AI spend is reported with assumptions and user-scale projections

#### Dependencies

All other agents

## 8. Program Phases for the Agent Swarm

### Phase 0: Architecture Lock

#### Agents Active

- Lead Architect
- Plugin SDK / Contract
- Auth & Security

#### Deliverables

- architecture
- contracts
- app lifecycle
- sandboxing decision
- auth approach

#### Exit Criteria

- all shared contracts approved
- message protocol approved
- folder ownership locked

### Phase 1: Core Platform

#### Agents Active

- Platform Backend
- Frontend Chat Shell
- Chat Orchestration
- Embedded Runtime

#### Deliverables

- working chat
- persistent history
- app registry
- tool routing
- embedded runtime
- completion signaling base

#### Exit Criteria

- one internal mock app works end to end

### Phase 2: Full Vertical App Integration

#### Agents Active

- Chess App
- QA
- Docs

#### Deliverables

- chess fully integrated
- board state to chatbot
- game completion flow
- lifecycle tests

#### Exit Criteria

- chess demo fully passes

### Phase 3: Platform Flexibility Proof

#### Agents Active

- Public External App
- Authenticated App
- Auth & Security
- QA

#### Deliverables

- one public external app
- one authenticated app
- OAuth flow
- multi-app switching
- routing tests

#### Exit Criteria

- 3 apps live and stable

### Phase 4: Production Readiness

#### Agents Active

- QA
- Docs / DevEx / Cost Analysis
- Frontend polish
- Backend hardening

#### Deliverables

- docs
- deployment
- cost analysis
- final cleanup
- demo readiness

#### Exit Criteria

- submission-ready

## 9. Task Breakdown by Deliverable

### Deliverable A: Plugin Contract

#### Subtasks

- define manifest schema
- define tool schema
- define host-app message types
- define completion payload
- define validation rules
- create example manifests
- create manifest validator

### Deliverable B: Chat + Orchestration

#### Subtasks

- conversation persistence
- active app context store
- dynamic tool injection
- tool routing service
- follow-up context builder
- unrelated-query refusal logic

### Deliverable C: Embedded Runtime

#### Subtasks

- iframe host
- origin allowlist
- bootstrap handshake
- state update message flow
- completion event bridge
- timeout / crash fallback

### Deliverable D: App Integrations

#### Subtasks

- chess
- public external app
- authenticated app
- registration
- follow-up summaries

### Deliverable E: Safety / Auth

#### Subtasks

- platform auth
- OAuth flow
- token storage
- sandbox policy
- app review rules
- CSP config

### Deliverable F: Submission Readiness

#### Subtasks

- docs
- cost analysis
- setup guide
- architecture guide
- deployed demo
- video outline

## 10. Shared Acceptance Criteria for the Entire System

The system is only done when all of the following are true:

- chat works with streaming and persistent history
- apps can register and expose tool schemas
- chatbot can discover tools dynamically
- chatbot can invoke tools with structured parameters
- app UI renders inside chat
- app communicates state back to platform
- app signals completion cleanly
- chatbot retains context after app completion
- at least 3 apps work, including chess
- at least 1 app requires auth and completes auth flow successfully
- multi-app switching works in the same conversation
- unrelated queries are refused correctly
- errors and timeouts are handled gracefully
- docs and deployment are complete
- cost analysis is complete

## 11. Definition of Done Per Task

Every task ticket created for a coding agent must include:

### Required Fields

- Task ID
- Title
- Objective
- Why it matters
- Inputs
- Files allowed to modify
- Files explicitly not to modify
- Dependencies
- Implementation notes
- Acceptance criteria
- Test plan
- Risks
- Output summary

### Mandatory Completion Evidence

- code committed
- types compile
- tests added or updated
- docs updated if shared behavior changed
- blockers documented if incomplete

## 12. Example Codex Task Ticket Format

Use this exact format for each implementation task.

### Task Title

Build app manifest schema and validator

### Objective

Create the typed schema for third-party app registration so the platform can validate app manifests before registration.

### Inputs

- `architecture.md`
- required app capabilities list
- tool schema requirements

### Files Allowed

- `src/shared/contracts/*`
- `/backend/registry/*`
- `/docs/plugin-contract.md`

### Files Not Allowed

- `/frontend/chat/*`
- `/apps/chess/*`

### Deliverables

- manifest type definition
- runtime validator
- sample manifest
- registration test

### Acceptance Criteria

- invalid manifests fail with readable errors
- valid manifests register successfully
- manifest supports `authType`, `toolDefinitions`, `uiEmbedConfig`, `safetyMetadata`
- tests cover success and failure cases

### Test Plan

- unit test valid manifest
- unit test invalid `authType`
- unit test missing `toolDefinitions`
- integration test registry endpoint with sample manifest

### Done When

- schema merged
- validator passes tests
- docs updated

## 13. Best-Practice Prompt You Can Give Codex

Use this as your master prompt:

```text
You are a senior product-minded software engineer working inside a multi-agent implementation program for the TutorMeAI third-party app platform.

Your job is to complete only the assigned task while respecting shared contracts, system boundaries, and production-grade engineering standards.

Core product goal:
Build a secure AI chat platform that supports third-party app registration, tool discovery, structured invocation, embedded UI, bidirectional communication, completion signaling, app state isolation, context retention, and at least 3 working apps including chess and one authenticated app.

Execution rules:
- Follow contract-first development.
- Do not invent new shared interfaces without updating the shared contract docs.
- Do not couple chat state and app state improperly.
- Preserve security boundaries and sandboxing assumptions.
- Prefer small, testable, production-credible code.
- If blocked by a missing dependency, stop and write a blocker note with the exact interface or artifact needed.

For this task, return:
1. what you changed
2. files modified
3. any new interfaces introduced
4. tests added
5. risks or follow-up work
6. short verification summary

Task:
[PASTE TASK TICKET HERE]
```

## 14. Best-Practice PM Control Layer

You should manage the swarm with these rules:

### Order of Execution

- Architect
- Contracts
- Backend + orchestration
- Runtime + frontend shell
- Chess vertical slice
- Other apps
- Auth hardening
- QA
- Docs and cost analysis

### PM Rule

Do not let app agents start until:

- manifest schema exists
- runtime messaging contract exists
- completion signal exists
- active app session model exists

That is the biggest place these agent builds usually fail.

## 15. Recommended First 10 Tasks to Create

1. Define shared app manifest schema
2. Define tool schema contract
3. Define embedded app message protocol
4. Design database schema for conversations, app sessions, tool invocations
5. Build app registry API
6. Build tool invocation orchestration service
7. Build embedded iframe host runtime
8. Build active app context store for chat
9. Implement chess app end to end
10. Add completion signaling and context follow-up tests

## 16. Strong Recommendation

For this case, do not let Codex freely "build the whole platform."

Instead, run it like a real AI engineering org:

- one architect spec
- one shared contracts layer
- one vertical slice first
- strict task tickets
- explicit acceptance criteria
- QA after each integration

That matches the case study's own guidance to define the API contract early, build vertically, solve completion signaling cleanly, and think like a platform designer rather than just a developer.
