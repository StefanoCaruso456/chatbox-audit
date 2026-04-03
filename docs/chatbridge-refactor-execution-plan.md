# ChatBridge Refactor Execution Plan

## Recommendation

Do not pause the entire roadmap.

Pause only the roadmap work that depends on shared contracts, runtime boundaries, or platform trust assumptions until the Phase 0 foundation is locked.

Continue in parallel only the work that does not create new shared runtime coupling.

## Hold / Continue Rule

### Hold for now

- third-party app implementation work
- iframe runtime feature work beyond static prototypes
- tool routing and dynamic tool injection changes for ChatBridge
- OAuth implementation for authenticated apps
- multi-app switching behavior
- broad UI feature work that depends on final app lifecycle contracts

### Safe to continue in parallel

- architecture notes
- manifest examples
- message protocol examples
- app UX wireframes
- cost analysis
- threat model notes
- test planning
- provider and platform research
- content and submission documentation

## Do Now Backlog

These are the refactors and foundation tasks that should happen now because they directly support the roadmap gates in `docs/program-dependency-map.md`.

### P0.1 Build and deployment plumbing

Objective:
- make the current clone buildable and predictable before deeper platform work

Immediate targets:
- fix the PostCSS config path mismatch in `electron.vite.config.ts`
- resolve or remove missing `release-*.sh` script references in `package.json`
- verify the web build path and document the current deployment constraints

Why now:
- unblocks local verification
- reduces noise while we build contracts and platform seams

Supports roadmap tickets:
- 22 persistent chat shell UI
- 24 embedded iframe host
- 44 setup guide and architecture docs

### P0.2 Finalize the shared contract home

Objective:
- establish `src/shared/contracts/` as the single source of truth for shared platform contracts

Must define:
- `AppManifest`
- `ToolSchema`
- `EmbeddedAppMessage`
- `CompletionSignal`
- `ConversationAppContext`
- `AppSessionState`

Why now:
- this is the contract-first backbone for the whole TutorMeAI program

Supports roadmap tickets:
- 02 contract package structure
- 03 AppManifest schema
- 04 ToolSchema contract
- 05 embedded app host-message protocol
- 06 CompletionSignal contract

### P0.3 Lock the source-of-truth state model

Objective:
- define ownership boundaries for chat state, app state, UI state, and persisted state

Immediate deliverables:
- update `docs/state-model.md`
- define what belongs in React Query, Zustand, Jotai, local component state, and backend persistence
- define the authority boundary between client state and Railway backend state

Why now:
- the roadmap explicitly blocks persistence and orchestration work on this decision

Supports roadmap tickets:
- 07 source-of-truth state model
- 09 database schema
- 13 app session persistence
- 19 active app context assembler

### P0.4 Refactor the remote service boundary

Objective:
- split the current renderer remote client into typed domain clients

Suggested split:
- `remote/auth.ts`
- `remote/license.ts`
- `remote/uploads.ts`
- `remote/config.ts`
- `remote/manifests.ts`
- `remote/copilots.ts`

Why now:
- this file is the clearest current boundary between local shell behavior and hosted behavior
- ChatBridge will add more backend-owned responsibilities here

Supports roadmap tickets:
- 10 app registry service
- 11 app registry API
- 29 platform user authentication
- 30 external app OAuth framework

### P0.5 Create a typed IPC and bridge foundation

Objective:
- replace loose `any`-based invocation patterns with typed channel contracts

Immediate targets:
- `src/shared/electron-types.ts`
- `src/renderer/platform/interfaces.ts`
- knowledge-base IPC request and response typing
- a typed message envelope pattern reusable for iframe bridge work

Why now:
- the same discipline will be needed for app runtime messaging and tool invocation tracing

Supports roadmap tickets:
- 05 embedded app host-message protocol
- 14 invocation logging
- 24 embedded iframe host
- 25 postMessage bridge
- 28 app completion bridge

### P0.6 Split main-process knowledge-base IPC

Objective:
- break `src/main/knowledge-base/ipc-handlers.ts` into focused modules

Suggested split:
- `ipc-kb-crud.ts`
- `ipc-kb-files.ts`
- `ipc-kb-search.ts`
- `ipc-kb-parsers.ts`

Why now:
- this is already a large orchestration seam
- it is a good template for future app-runtime and tool-routing boundaries

Supports roadmap tickets:
- 09 database schema
- 12 conversation persistence
- 13 app session persistence
- 14 invocation logging

### P0.7 Add platform capability gating

Objective:
- move unsupported web behaviors from runtime throws to explicit capability checks

Immediate targets:
- define platform capability flags
- gate desktop-only features in the UI
- document desktop vs web behavior clearly

Why now:
- TutorMeAI expects a live deployed client while building
- web behavior needs predictable limits

Supports roadmap tickets:
- 22 persistent chat shell UI
- 23 streaming response handling
- 24 embedded iframe host
- 44 setup guide and architecture docs

### P0.8 Tighten TypeScript around provider and config boundaries

Objective:
- reduce `any` usage in the highest-value shared boundaries

Immediate targets:
- replace `providerSettings: any` in provider settings UI
- split provider base info from provider runtime settings
- replace `catch (error: any)` with `unknown` plus typed normalization in high-value code paths

Why now:
- the execution spec explicitly requires strong typing for shared interfaces

Supports roadmap tickets:
- 03 AppManifest schema
- 04 ToolSchema contract
- 07 source-of-truth state model
- 15 normalized error model

### P0.9 Trust-boundary hardening pass

Objective:
- review and document security-sensitive runtime assumptions before third-party app embedding work

Immediate targets:
- Electron `webSecurity` setting
- iframe sandbox and origin rules
- remote parsing and hosted upload behavior
- link opening behavior

Why now:
- the third-party app roadmap depends on clear trust and sandbox boundaries

Supports roadmap tickets:
- 26 origin validation and sandbox checks
- 32 app approval and safety review model
- 33 CSP and embed security config

## Do Next After P0

These should start only after the items above are stable.

### P1 Platform Buildout

- app registry service and API
- conversation persistence
- app session persistence
- invocation logging
- normalized error model

### P2 Runtime Buildout

- tool discovery
- dynamic tool injection
- tool routing
- active app context assembly
- embedded iframe host
- postMessage bridge
- completion bridge

### P3 App and Auth Buildout

- platform auth
- per-app OAuth
- secure token storage
- chess app
- public app
- authenticated app

## Existing Refactors to Keep

Do not reopen these unless feature work exposes a real defect:

- session module split under `src/renderer/stores/session/`
- provider registry refactor under `src/shared/providers/`

These already align with the current architecture direction.

## Practical Answer to "Should I Hold Off?"

Yes, hold off on the other roadmap work if it depends on:

- shared contracts
- app/runtime messaging
- backend orchestration ownership
- auth boundaries
- sandbox rules

No, you do not need to hold off on:

- research
- docs
- wireframes
- manifest examples
- cost analysis
- test design

## Suggested Working Sequence

1. Finish P0.1 through P0.3 first.
2. Then do P0.4 through P0.6.
3. Then lock P0.7 through P0.9.
4. Only after that should the main runtime and app roadmap resume.
