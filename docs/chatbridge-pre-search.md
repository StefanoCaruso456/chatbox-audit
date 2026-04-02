# Case Study Analysis

TutorMeAI's challenge is not really "how do we put apps inside chat?" The harder problem is how to let a chatbot orchestrate third-party software without giving away trust, safety, or the feeling of a continuous conversation. In a school product, that boundary matters more than the feature demo. Students and teachers need the experience to feel seamless, but the platform still has to stay in control of what data leaves the system, what kinds of tools are allowed, and how the chatbot reasons about what just happened inside an app. If that contract is vague, the product may look flexible in a demo but become unsafe and brittle in production.

The first major problem is trust. Third-party apps are, by definition, not written by TutorMeAI. That means the platform cannot assume they are well-behaved, age-appropriate, or technically reliable. In a K-12 setting, a "move fast and let anyone embed anything" approach would be irresponsible. Teachers need a way to approve apps, administrators need a way to restrict them, and the platform needs a way to review, audit, disable, and monitor them. A malicious app should not be able to read all student conversations, scrape data from the parent page, or silently send information elsewhere. Even a non-malicious app can still create harm if it confuses a student, exposes adult content, or crashes mid-lesson. So the app contract has to be restrictive by default, not permissive by default.

The second major problem is continuity. The case study makes it clear that the chatbot cannot simply launch an app and forget about it. It needs to know what app is active, what state that app is in, whether it succeeded or failed, and when it is appropriate to talk about the app's outcome later in the conversation. A chess game is a great example because the chatbot has to understand the current board, not just that "a chess app exists." The key design decision is that the chatbot should not ingest raw app internals all the time. Instead, each app should send structured, scoped state updates and completion summaries that the platform can log, reason over, and turn into conversation context.

The third problem is product strategy. There is a tradeoff between maximum flexibility and a platform that a small team can actually ship in a week. Fully general plugin execution, dynamic UI composition, rich real-time collaboration, and arbitrary third-party auth flows are all possible, but trying to solve them all at once would create an unstable system. The better decision is to define a narrow, defendable contract: approved apps register metadata and tool schemas, render inside a sandboxed iframe, communicate only through a typed bridge, and receive only scoped data from the platform. That gives TutorMeAI a believable path to scale without pretending every third-party app deserves full trust on day one.

The most important ethical decision is data minimization. Children should not need to surrender full chat history to every app they touch. Apps should receive the smallest possible payload needed for the current task, and teachers should be able to decide which apps are available in their environment. The chatbot should also know when not to invoke an app at all. A platform that launches tools unnecessarily is not helpful; it is confusing and invasive.

The direction I landed on is a platform-first design: TutorMeAI remains the system of record, the chatbot remains the orchestrator, and third-party apps operate as sandboxed guests. That choice sacrifices some short-term openness, but it produces something much more defensible for education: safer by default, easier to reason about, and more likely to survive real usage.

## Assumptions

- This sprint is effectively solo-developer or very small team work.
- The deliverable is a fork of Chatbox used primarily as a web-first product, even if the upstream repo supports desktop/mobile.
- The goal is a strong MVP in one week, not a fully open marketplace.
- Teachers and admins must be able to restrict which apps are available to students.
- One authenticated third-party app is required, but broad enterprise SSO is not required this week.

## Repo Audit Summary

### Audit basis

- Repository origin for this fork: `StefanoCaruso456/chatbox-audit`
- Source files under `src/`: 585
- Source LoC under `src/`: 74,429
- Built-in provider definitions: 17
- Locales: 14
- Integration test files under `test/integration/`: 8
- Existing repo audit docs already present under `docs/codebase-audit/`

### Current software stack

- App shell: Electron for desktop packaging, React for UI, Vite/Electron-Vite for build and dev flow.
- Routing: TanStack Router.
- UI libraries: Mantine plus MUI.
- State: React Query, Zustand, Jotai, and local component state.
- Persistence: IndexedDB/localforage on web, hybrid file + IndexedDB on desktop.
- AI layer: Vercel AI SDK-style model abstraction with multiple provider definitions.
- Tooling layers already present: file tools, knowledge base tools, web search tools, MCP tool injection.
- Knowledge base storage: SQLite/libSQL vector storage from the Electron main process.
- Testing: Vitest plus targeted integration tests.

### What Chatbox already gives us

- A mature React renderer with TanStack Router, Mantine, MUI, and strong chat UX primitives.
- A session/message engine with streaming message updates, thread/fork support, drafts, attachments, and token/context management.
- A provider abstraction layer that normalizes multiple LLM vendors behind shared model interfaces.
- A runtime tool-injection pattern already used for file reading, knowledge base search, web search, and MCP servers.
- A platform abstraction layer that separates renderer logic from desktop/web/mobile concerns.
- A knowledge-base subsystem with local file parsing, SQLite/libSQL vector storage, and background processing.
- A basic auth/token-refresh pattern for Chatbox-hosted services.

### What Chatbox does not yet give us

- A true multi-tenant backend for user accounts, orgs, conversations, or app sessions.
- A third-party app registry with review state, allowlists, manifests, and tool-schema governance.
- A first-class embedded app runtime inside the chat timeline.
- Per-app OAuth token storage and refresh for external providers like Spotify.
- A secure app-to-chat bridge with explicit lifecycle events, event ordering, and scoped permissions.
- A trust model appropriate for K-12 third-party apps.

### Important code-level findings

- Current LLM orchestration is client-side in `src/renderer/stores/session/generation.ts` and `src/renderer/packages/model-calls/stream-text.ts`.
- Current persistence is local-first via IndexedDB plus desktop file storage, not server-backed multi-user storage.
- Current auth is Chatbox-account/license oriented in `src/renderer/packages/remote.ts`, `src/renderer/stores/authInfoStore.ts`, and `src/renderer/routes/settings/chatbox-ai.tsx`.
- The closest existing "tool platform" is MCP in `src/renderer/packages/mcp/controller.ts`, but MCP only solves tool execution, not embedded third-party UI apps.
- The closest existing iframe pattern is artifact preview in `src/renderer/components/Artifact.tsx`; it is not a reusable third-party app sandbox yet.

### Security observations relevant to the case study

- `src/main/main.ts` creates the Electron window with `webSecurity: false`, which is incompatible with a strong untrusted-app story.
- `src/preload/index.ts` exposes a generic `invoke` bridge rather than a narrow capability-by-capability API surface.
- `src/renderer/components/Mermaid.tsx` renders raw SVG with `dangerouslySetInnerHTML`.
- `src/renderer/components/Artifact.tsx` posts messages with `*` target origin to an external iframe.

These are manageable for Chatbox's current product shape, but they are important warnings: we should not bolt a K-12 third-party app runtime directly onto the current trust boundary without hardening it first.

## Keep, Rework, Replace

### Keep

- The chat UI shell, message list, input box patterns, and streaming response UX.
- The idea of dynamic tool injection from the current model-call pipeline.
- The provider abstraction and model capability metadata.
- The existing state-management patterns only where they remain frontend-local.

### Rework

- Message schema to add app-launch, app-state, and app-completion events.
- Session context construction so app summaries are merged into conversation history safely.
- The route structure so chat can render embedded apps inline.
- Testing strategy to include contract and iframe lifecycle tests.

### Replace

- Client-side orchestration for production TutorMeAI app/tool execution.
- Local-only persistence for conversations and app sessions.
- License-style auth as the primary product auth system.
- Any assumption that MCP alone is the plugin platform.

## Recommended Architecture

### Core position

Use Chatbox as the frontend shell and interaction model, but move the orchestration authority to a backend service. That is the single most important decision in this pre-search.

### Proposed stack

| Layer | Decision | Why |
| --- | --- | --- |
| Frontend | Next.js client on Vercel | Keeps the web client deployment simple while aligning the product direction around a dedicated web shell |
| Chat orchestration backend | Dedicated Node.js + TypeScript service on Railway | Matches repo language, cleanly separates orchestration from the client, and avoids coupling the backend to the frontend deployment |
| Streaming transport | SSE for AI responses | Simpler than WebSockets for one-way token streams |
| App runtime | Sandboxed iframes rendered inline in chat messages | Best fit for untrusted third-party UI |
| Parent/app bridge | Typed `postMessage` envelope with origin checks and request IDs | Clear lifecycle and bidirectional updates |
| LLM | OpenAI Responses API with `gpt-5-mini` as primary orchestration model | Strong tool calling and lower cost than a heavier model |
| DB | PostgreSQL | Needed for users, conversations, app registry, app sessions, token vault, audit logs |
| Platform auth | Platform authentication handled by the Railway backend | Keeps product auth under the same backend control plane as orchestration and session management |
| Per-app auth | Per-app OAuth handled by the Railway backend, never raw iframe-managed long-lived secrets | Safer and easier to audit |
| Deployment | Vercel client + Railway backend + PostgreSQL | Makes the client/backend/database split explicit and easy to reason about |

### High-level runtime flow

1. User sends a message in chat.
2. Backend loads teacher-approved apps for that org/class/user.
3. A lightweight routing pass narrows candidates.
4. The orchestration model receives only the shortlisted tool schemas plus active app summaries.
5. If an app should open, chat renders an `AppContainer` iframe message.
6. Parent and iframe communicate through a typed bridge.
7. App emits state snapshots and completion events.
8. Backend stores app session state and injects compact summaries back into chat context.

## Planning Checklist

### 1. Scale & Load Profile

- Launch target: pilot for 5,000 to 10,000 monthly active users on the new app feature.
- Six-month target: 50,000 monthly active users if the feature sticks.
- Traffic pattern: highly spiky around school hours and homework hours, not steady.
- Concurrent app sessions per user: assume 1 active app session most of the time, 2 as an upper-bound design target.
- Cold start tolerance: chat shell under 2 seconds, embedded app visible with loading state within 3 seconds, tool result within 5 to 10 seconds.

Why:

- The parent company scale is larger, but the new feature should be sized as an incremental rollout first.
- School usage is bursty, so queueing, retries, and backpressure matter more than average load.

### 2. Budget & Cost Ceiling

- Initial infra + AI target: keep the feature under a small pilot budget ceiling, roughly low-thousands per month.
- Pay-per-use is acceptable, but only with tenant-level caps and visibility.
- Acceptable LLM cost range: low single-digit cents per meaningful orchestrated turn, ideally lower.
- Trade money for time on Vercel deployment, Railway deployment, PostgreSQL operations, and error tracking; do not build unnecessary custom infrastructure this week.

Why:

- The one-week sprint rewards leverage. Managed services reduce risk faster than they increase cost.

### 3. Time to Ship

- MVP timeline: one week, with Tuesday planning gate, Friday early submission, Sunday polish.
- Priority: speed-to-market over perfect extensibility, except for trust boundaries.
- Iteration cadence after launch: daily during sprint, weekly after initial release.

Decision:

- Build one strong app contract and reuse it for all three apps instead of inventing app-specific hacks.

### 4. Security & Sandboxing

- Isolate third-party UIs in sandboxed iframes.
- If a malicious app is registered, it should still have no direct access to parent DOM, parent storage, or full chat transcripts.
- CSP must explicitly limit `frame-src`, `connect-src`, `script-src`, and `img-src`.
- App payloads must be minimized: apps get scoped inputs, not arbitrary conversation history.

Decision:

- Apps are guests. The platform stays the source of truth.

### 5. Team & Skill Constraints

- Assumed team: solo or 2 engineers.
- Primary comfort zone: TypeScript, React, Node.
- iframe/postMessage: moderate experience is enough if the protocol is kept simple and typed.
- OAuth2: use one provider for MVP and keep the platform in charge of tokens.

Decision:

- Avoid exotic sandbox/container tech. Use browser primitives plus a narrow protocol.

### 6. Plugin Architecture

- Choose iframe-based apps, not web components and not server-side-rendered third-party UI.
- Apps register via a manifest stored by the platform: metadata, allowed origins, UI URL, tool schemas, auth type, version.
- Use `postMessage` for parent/app communication.
- The chatbot discovers tools by loading approved app manifests from the backend at runtime.

Why this fits Chatbox:

- Chatbox already has tool schema composition. It does not have a UI plugin runtime, so iframe isolation is the cleanest new layer.

### 7. LLM & Function Calling

- Primary provider: OpenAI Responses API.
- Dynamic tool schemas are injected server-side per turn from the approved app shortlist, not from every app in the registry.
- Context management rule: include only app summaries and shortlisted schemas, never the full raw event log.
- Stream text to the UI while waiting when possible; show explicit waiting states when a tool or app is running.

Decision:

- Use a two-step orchestration path:
- Step 1: lightweight app routing/classification.
- Step 2: main response generation with shortlisted tools.

This reduces context size and improves routing accuracy.

### 8. Real-Time Communication

- Chat streaming: SSE from backend to frontend.
- App-to-platform communication: `postMessage` between iframe and parent.
- Bidirectional state updates: parent owns ordering and forwards approved events to backend.
- Reconnection guarantee: backend stores message/app event sequence numbers; frontend rehydrates from persisted state.

Why:

- SSE is simpler than WebSockets for the chat stream.
- `postMessage` is the right primitive for iframe isolation.

### 9. State Management

- Chat state lives server-side in Postgres with client cache in React Query.
- App state lives primarily inside the app, with periodic snapshot summaries persisted by the platform.
- Conversation history stores compact app events and completion summaries, not every noisy UI interaction.
- If the user closes the chat, the app session becomes paused; on reopen, the platform either restores the last snapshot or marks the app session expired.

Why:

- This keeps the conversation intelligible and keeps storage costs sane.

### 10. Authentication Architecture

- Platform auth and per-app auth must be separate concerns.
- Tokens belong on the server, encrypted at rest.
- OAuth redirect handling should happen at the platform level in a popup or top-level flow, not inside the sandboxed iframe.
- Auth requirements should surface naturally in chat: "Connect Spotify to continue" with a clear action button.

Decision:

- Do not let third-party apps own OAuth directly in the MVP. The platform brokers it.

### 11. Database & Persistence

- Core tables:
- `users`
- `organizations`
- `conversations`
- `messages`
- `app_definitions`
- `organization_app_permissions`
- `app_sessions`
- `tool_invocations`
- `oauth_connections`
- `app_review_records`
- Read/write pattern: append-heavy for messages/events, lookup-heavy for active sessions and approved apps.
- Key indexes:
- conversations by org/user/updated_at
- messages by conversation_id/created_at
- app_sessions by conversation_id/status
- tool_invocations by app_session_id/created_at
- Backup: PostgreSQL daily backups plus registry export.

### 12. Security & Sandboxing Deep Dive

- iframe sandbox baseline: `allow-scripts allow-forms allow-popups`, and avoid `allow-same-origin` for third-party apps unless there is a specific reviewed need.
- CSP: only approved app origins may be framed.
- Prevent parent DOM access by design through iframe isolation.
- Rate limit per app, per user, and per org; add a global kill switch for any app.

Extra K-12 safeguards:

- Manual approval workflow for MVP.
- Age-appropriateness review before an app can be enabled.
- Audit log for every app launch and tool invocation.

### 13. Error Handling & Resilience

- If an iframe fails to load, show a recoverable app error message in chat and let the assistant continue.
- Tool call timeout target: 10 seconds default, 20 seconds max for slower apps.
- Failed app interaction should create a structured event the assistant can explain.
- Circuit breaker: temporarily disable an app after repeated failures and stop routing new requests to it.

### 14. Testing Strategy

- Unit test the manifest parser and message bridge schema.
- Contract-test the iframe protocol with mock apps.
- End-to-end test full lifecycle: invoke -> render -> interact -> complete -> follow-up question.
- Load test with multiple active app sessions and streaming responses.

How this maps to the repo:

- Keep Vitest for unit/integration tests.
- Add Playwright for iframe lifecycle and OAuth happy paths.

### 15. Developer Experience

- Third-party developers should implement a simple manifest plus a typed bridge SDK.
- Required docs:
- manifest format
- event lifecycle
- auth modes
- tool schema examples
- local testing instructions
- debugging guide for invocation failures
- Local dev workflow: run platform locally, point manifest to localhost app URL, inspect bridge events in a developer panel.

Decision:

- Good DX matters, but only after the contract is stable. Avoid over-designing a marketplace SDK in week one.

### 16. Deployment & Operations

- Third-party apps are hosted separately by the app developer or by TutorMeAI for internal apps.
- Platform frontend and backend deploy independently.
- Monitor app load failure rate, tool success rate, auth failure rate, model latency, and moderation events.
- App updates must be versioned; existing sessions should pin to a compatible app version or gracefully refresh between turns.

## Requirement Mapping

### Core chat requirements

- Messaging with streaming responses: backend SSE stream into existing Chatbox-style message UI.
- History across sessions: Postgres persistence, not only local storage.
- Context retention: store active app summary per conversation and merge it into future turns.
- Multi-turn across app interactions: app session snapshots plus completion summaries.
- Error recovery: structured app/tool errors represented as chat-visible events.
- User auth: platform auth added outside the current Chatbox license flow.

### Third-party app contract

- Register apps and capabilities: backend manifest registry.
- Define tool schemas: JSON schema persisted server-side and injected at runtime.
- Render UI within chat: `AppContainer` iframe message component.
- Receive tool invocations: typed `postMessage` envelope with correlation IDs.
- Signal completion: `app.complete` event from iframe to parent.
- Maintain independent state: app-local state plus platform snapshots.

### Recommended three-app set

- Chess
  - Internal, no auth, rich bidirectional state.
- Flashcards Coach
  - External public learning app, lightweight UI, no per-user auth.
- Spotify Playlist Builder
  - External OAuth app, demonstrates token brokerage and scoped credentials.

This combination satisfies the required auth patterns and showcases different interaction styles.

## Recommended Implementation Order

### Tuesday checkpoint

- Finish this pre-search.
- Define manifest schema and iframe bridge event schema.
- Decide backend service shape and DB schema.
- Create the `AppContainer` UI contract on paper before building anything else.

### Friday target

- Basic chat with backend orchestration.
- App registry plus routing.
- One full app end-to-end, ideally chess.
- Inline iframe rendering and completion signaling.

### Sunday target

- Add second and third apps.
- Add authenticated app flow.
- Harden error handling and audit logs.
- Finish setup guide, API docs, demo video, deployment notes, and cost-tracking instrumentation.

## Bottom Line

The best use of this Chatbox fork is not to keep all of Chatbox's current runtime assumptions. It is to reuse its chat UX, tool-composition ideas, and frontend shell while deliberately replacing the parts that are unsafe or insufficient for a K-12 third-party app platform. The pre-search recommendation is therefore:

- keep the UI shell
- move orchestration to the backend
- use sandboxed iframes for app UI
- use server-owned manifests and OAuth
- store only compact app summaries in chat context
- optimize for one solid plugin contract, not maximum flexibility in week one
