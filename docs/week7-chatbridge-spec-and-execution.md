# Week 7 ChatBridge Spec And Execution

Source assignment: `/Users/stefanocaruso/Desktop/G4 Week 7 - ChatBridge (6).pdf`

## Spec Checklist

### Chat Platform

- [ ] Chat streams responses in real time in the actual product flow.
- [x] Chat history persists across turns and sessions.
- [x] Chat retains multi-turn context.
- [ ] App failures recover gracefully without leaving chat and the sidebar out of sync.

### Third-Party App Platform

- [x] Apps register capabilities.
- [x] Apps expose tool schemas.
- [x] Apps render UI inside the product.
- [x] Apps accept structured tool invocations from chat.
- [x] Apps can signal completion and results back to chat.
- [ ] Apps maintain durable authoritative app state independently from the transcript.
- [x] At least 3 apps exist.

### Chess Vertical Slice

- [x] User can type "let's play chess" and open Chess in the app surface.
- [x] Chess renders an interactive board UI.
- [x] Chess validates legal moves.
- [ ] Chess has an explicit reset or new-game flow from chat.
- [x] Chat can ask for board analysis during the game.
- [x] Invalid moves return a real error.
- [x] Chat can request a real move tool invocation.
- [x] The live board updates from real state after a move.
- [x] The next turn reads from a shared chess session state source in the primary chess flow.
- [ ] Recommendations are grounded in live state through the shared session path, not only renderer heuristics.

### Architecture Rules

- [x] A shared chess session state source exists for the primary chess flow.
- [x] Sidebar board renders from shared chess session state in the primary chess flow.
- [x] Chat tools read and write that same shared chess session state in the primary chess flow.
- [x] The model does not visually guess from the UI.
- [x] No fake narrated success is returned when the tool did not confirm success.
- [ ] Sidebar recovery and chat recovery converge on the same session state after reloads and retries.

### Required Verification

- [x] Launch game
- [x] Read board state
- [x] Legal move from chat
- [ ] Illegal move from chat at the orchestrator and product-flow level
- [x] Sidebar board re-render after a tool move
- [x] Context retention across turns
- [ ] Explicit reset or new-game flow
- [ ] End-to-end product verification for launch -> analyze -> move -> analyze again

## Current Gap List

1. Chess now has a shared session store, but iframe snapshot recovery and shared-session recovery still need full consolidation.
2. Reset or new-game from chat is not explicitly implemented.
3. Recovery after iframe reload or timeout is improved, but not yet backed by a durable persisted chess session state source.
4. The analysis path uses real board state, but the recommendation layer is still largely a local heuristic formatter.
5. Verification is strong on the happy path, but not complete for illegal chat moves, reset, and full end-to-end product flow.

## Agent Execution Phases

### Phase 1: Shared Chess Session State

- [x] Add a renderer-side chess session store keyed by `conversationId` and `appSessionId`.
- [x] Make the Chess sidebar render from that store.
- [x] Make chat-side chess reads prefer that store over mirrored sidebar snapshots.
- [x] Make chat-side chess moves update that store directly and re-render the board.

### Phase 2: Reliability And Recovery

- [ ] Keep sidebar runtime messaging only as synchronization and recovery transport, not as the primary chess state source.
- [ ] Preserve the latest valid chess position through retries, reloads, and timeouts.
- [ ] Add explicit stale-state and illegal-move handling around the shared session path.

### Phase 3: Chess Product Completeness

- [ ] Add `reset/new game` chat flow.
- [ ] Tighten move and analysis follow-ups such as "why is d4 good here?" and "what changed after Black played e5?"
- [ ] Ensure recommendations always cite live board state from the shared session.

### Phase 4: Verification

- [ ] Add tests for the shared chess session store.
- [x] Add orchestrator tests for shared-state reads and moves.
- [ ] Add tests for illegal chat moves and reset/new game.
- [ ] Run end-to-end product verification before declaring the assignment complete.

## Execution Status

Current step: Phase 2. Keep the shared chess session store authoritative while tightening recovery, reset/new-game, and remaining end-to-end verification.
