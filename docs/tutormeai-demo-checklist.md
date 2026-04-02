# TutorMeAI Demo Checklist

## Goal

Deliver a clear 3-5 minute demo that proves TutorMeAI is not just a chatbot with iframes, but a chat platform that can discover, launch, coordinate, and follow up on third-party apps.

## Recommended Demo Order

### 1. Open with the platform value

Show or say:

- this is an existing chat shell extended into an app-aware AI platform
- the platform can discover approved app tools, launch embedded apps, preserve app context, and continue the conversation after completion

### 2. Demo the internal app pattern with Chess Tutor

Suggested prompt:

- `Let's play chess`

Show:

- assistant launches Chess Tutor inline
- iframe runtime appears inside chat
- user makes a legal move
- app sends board state back to the host
- user asks a follow-up question about the position

What this proves:

- internal app registration
- embedded runtime
- app state updates
- follow-up reasoning on live app state

### 3. Demo the authenticated app pattern with Planner Connect

Suggested prompt:

- `Open planner for overdue work`

Show:

- assistant launches Planner Connect
- platform reports auth is required
- user connects through the host-managed flow
- app becomes usable after connection
- app shares completion summary back to chat

What this proves:

- auth-aware routing
- platform auth separated from app auth
- host-managed OAuth instead of iframe-owned tokens
- completion signaling for authenticated apps

### 4. Demo multi-app follow-up behavior

Suggested prompt:

- `What did the weather app say about jackets?`

or

- `Can we go back to chess and talk through the board again?`

Show:

- system keeps the current app and recent completions distinct
- follow-up context remains app-aware
- older app results are still available without losing the active app

What this proves:

- multi-app context retention
- context selection rules
- structured follow-up summaries

### 5. Demo graceful failure recovery

Show one of:

- iframe failure state
- timeout recovery state
- continue-in-chat fallback

What this proves:

- the conversation does not get stranded when an app fails
- the user can retry or keep going without leaving chat

## Demo Script

### Suggested narration

1. `TutorMeAI can now treat approved third-party apps as first-class tools inside chat.`
2. `The orchestration layer decides whether to stay in normal chat, ask a clarifying question, or launch an app.`
3. `Apps render inside sandboxed iframes and communicate through typed postMessage events.`
4. `When an app finishes, the assistant keeps the result in structured context for the next turn.`

## Pre-Demo Checklist

- Confirm the branch or deployment includes all merged Phase 0-6 work.
- Confirm the three demo apps are present:
  - Chess Tutor
  - Weather Lookup or replacement public learning app
  - Planner Connect
- Confirm the latest TutorMeAI integration tests pass.
- Confirm the architecture doc, setup guide, developer guide, and cost analysis docs are available.
- Confirm the app runtime can show retry and continue-in-chat actions for failures.

## Submission Checklist

- Architecture doc exists and matches the final stack decision.
- Shared contracts exist for manifest, tool schema, runtime messages, and completion signals.
- Backend covers registry, persistence, orchestration, auth, and security.
- Embedded runtime uses iframe + postMessage.
- At least three app patterns are demonstrated.
- One app requires auth.
- Multi-app context retention is shown.
- Ambiguous and unrelated routing behavior is tested.
- Cost analysis is documented.
- Setup guide and developer guide are documented.

## Optional Final Polish

- Replace Weather Lookup with a more education-native public app before the final submission if the grading emphasis is strongly product-story driven.
- Record the demo immediately after a clean focused test run so the implementation and narration stay aligned.
