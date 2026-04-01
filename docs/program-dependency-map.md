# TutorMeAI Program Dependency Map

## Objective

This document defines the build order, blocking dependencies, and unblock rules for the TutorMeAI delivery program.

## Phase Order

1. Phase 0: Architecture and contracts
2. Phase 1: Core backend persistence and registry
3. Phase 2: Orchestration and runtime
4. Phase 3: Auth and security
5. Phase 4: Required apps
6. Phase 5: Reliability and multi-app behavior
7. Phase 6: QA, docs, and submission

## Blocking Rules

### No app work before contracts

The Chess, Public External App, and Authenticated App agents are blocked until all of these exist:

- AppManifest contract home
- ToolSchema contract home
- EmbeddedAppMessage contract home
- CompletionSignal contract home
- source-of-truth state model

### No orchestration work before registry and persistence

Tool discovery, routing, and active app context assembly are blocked until:

- app registry service exists
- conversation persistence exists
- app session persistence exists
- invocation logging exists

### No authenticated app work before backend auth base

Authenticated app work is blocked until:

- platform authentication exists
- OAuth start/callback flow exists
- secure token storage strategy exists

## Ticket Dependency Map

| Ticket | Depends On | Unblocks |
| --- | --- | --- |
| 01 Architecture spec | none | 02, 07 |
| 02 Contract package structure | 01 | 03, 04, 05 |
| 03 AppManifest schema | 02 | 10, 24, 30, 32, 34 |
| 04 ToolSchema contract | 02 | 17, 34 |
| 05 Embedded app host-message protocol | 02 | 06, 25 |
| 06 CompletionSignal contract | 05 | 28, 36 |
| 07 Source-of-truth state model | 01 | 09, 13 |
| 08 Program dependency map | 01-07 | full program sequencing |
| 09 Database schema | 07 | 10, 12, 13, 14 |
| 10 App registry service | 03, 09 | 11, 32, 34 |
| 11 App registry API | 10 | 16 |
| 12 Conversation persistence | 09 | 19, 22 |
| 13 App session persistence | 07, 09 | 19, 28 |
| 14 Invocation logging | 09 | 18, 46 |
| 15 Normalized error model | 11 | 39 |
| 16 Tool discovery | 11 | 17, 18 |
| 17 Dynamic tool injection | 04, 16 | 18 |
| 18 Tool routing | 14, 16, 17 | 20, 21, 36, 46 |
| 19 Active app context assembler | 12, 13, 14 | 36, 40 |
| 20 Refusal logic | 18 | 43 |
| 21 Ambiguous-intent handling | 18 | 43 |
| 22 Persistent chat shell UI | 12 | 23, 24, 29, 40 |
| 23 Streaming response handling | 22 | downstream UX |
| 24 Embedded iframe host | 03, 22 | 25, 35, 37, 38 |
| 25 postMessage bridge | 05, 24 | 26, 27, 28, 35, 37, 38 |
| 26 Origin validation and sandbox checks | 03, 25 | 33 |
| 27 App heartbeat / timeout detection | 25 | 39 |
| 28 App completion bridge | 06, 13, 25 | 36, 37, 38, 39, 40 |
| 29 Platform user authentication | 22 | 30 |
| 30 External app OAuth framework | 03, 29 | 31, 38 |
| 31 Secure token storage and refresh | 30 | 38 |
| 32 App approval and safety review model | 03, 10 | production readiness |
| 33 CSP and embed security config | 26 | production readiness |
| 34 Chess app manifest and registration | 03, 04, 10 | 35 |
| 35 Chess board UI and game engine integration | 24, 25, 34 | 36 |
| 36 Chess tool handlers | 18, 19, 28, 35 | 42, 46 |
| 37 Public external app integration | 24, 25, 28 | 40, 42, 46 |
| 38 Authenticated app integration | 30, 31, 24, 25, 28 | 40, 42, 46 |
| 39 Failure-state UX | 15, 27, 28 | 42 |
| 40 Multi-app switching | 19, 22, 28, 37, 38 | 42 |
| 41 Contract tests | 03-06 | regression protection |
| 42 End-to-end lifecycle tests | 36-40 | submission readiness |
| 43 Routing and refusal tests | 20, 21 | submission readiness |
| 44 Setup guide and architecture docs | 01-40 | submission readiness |
| 45 Third-party integration guide | 03-06, 24-28 | submission readiness |
| 46 AI cost analysis | 14, 18, 36-38 | submission readiness |
| 47 Demo script and checklist | 42, 44, 46 | final submission |

## Immediate Execution Order

### Now

- Ticket 01
- Ticket 02
- Ticket 07
- Ticket 08

### Next

- Ticket 03
- Ticket 04
- Ticket 05
- Ticket 06

### Then

- Ticket 09
- Ticket 10
- Ticket 11
- Ticket 12
- Ticket 13
- Ticket 14
- Ticket 15

## Completion Gate Between Phases

### Gate to Phase 1

Required:

- architecture spec exists
- shared contract home exists
- state ownership model exists
- dependency map exists

### Gate to Phase 2

Required:

- registry API exists
- conversation persistence exists
- app session persistence exists
- invocation logging exists

### Gate to Phase 3

Required:

- routing works
- active app context assembler exists
- iframe host works
- postMessage bridge works
- completion bridge exists

### Gate to Phase 4

Required:

- platform auth exists
- OAuth framework exists
- secure token storage exists
- sandbox validation exists

### Gate to Phase 5

Required:

- chess works end to end
- public app works end to end
- authenticated app works end to end

### Gate to Phase 6

Required:

- failure UX exists
- multi-app switching works

## Downstream Update Rule

If any ticket changes a shared contract, lifecycle event, or state boundary:

1. Update `docs/architecture.md`
2. Update `src/shared/contracts/README.md`
3. Record the downstream tickets affected before continuing
