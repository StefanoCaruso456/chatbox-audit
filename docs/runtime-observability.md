# TutorMeAI Runtime Observability

## Goal

This document explains:

- how ChatBridge records runtime traces
- what the trace tree contains
- what metadata and metrics are exported
- how those spans reach Braintrust
- what product and debugging insights we can gain from a live trace

## Live Example

- Example Braintrust trace:
  [Chess Tutor sidebar trace](https://www.braintrust.dev/app/Gauntlet_AI/p/ChatBridge%20Runtime/trace?object_type=project_logs&object_id=fa561659-dca5-4b46-a350-dd6d2dedd3f3&r=span.trace-root.trace.a21dc6b3-1134-4dbb-baf1-7e6024714da3.app-session.sidebar.chess-tutor&s=span.trace-root.trace.a21dc6b3-1134-4dbb-baf1-7e6024714da3.app-session.sidebar.chess-tutor)

This example is a Chess Tutor sidebar session trace. It is the clearest reference for understanding how a single app session becomes a full runtime trace tree.

## End-To-End Flow

### 1. Spans are created in the renderer

The renderer creates and buffers runtime spans locally before export.

Primary files:

- `src/renderer/stores/runtimeTraceStore.ts`
- `src/renderer/components/apps/AppIframePanel.tsx`
- `src/renderer/components/apps/ApprovedAppCoachController.tsx`
- `src/renderer/packages/tutormeai-apps/orchestrator.ts`
- `src/renderer/stores/runtimeTraceGeneration.ts`

### 2. The renderer batches spans for export

The export controller waits for pending spans, bootstraps telemetry if needed, and POSTs the batch to the TutorMeAI backend.

Primary files:

- `src/renderer/components/apps/RuntimeTraceExportController.tsx`
- `src/renderer/packages/tutormeai-telemetry/client.ts`

### 3. The Railway backend exports spans to Braintrust

The backend accepts runtime trace batches, converts them into Braintrust spans, and flushes them into the `ChatBridge Runtime` project.

Primary files:

- `backend/server/railway-web-app.ts`
- `backend/observability/braintrust.ts`

## Trace Identity Model

Runtime traces are grouped by `traceId`.

- `traceId` groups one runtime trace tree
- `spanId` identifies a single span
- `parentSpanId` links a span to its parent
- `trace-root` is auto-created for every trace

The current `traceId` format is:

```text
trace.{conversationId}.{appSessionId|runtimeAppId|host}
```

The root span id format is:

```text
span.trace-root.{traceId}
```

This means one conversation can contain multiple runtime traces, usually one per app session.

## What We Observe

At a high level, runtime observability covers five things:

1. App lifecycle
   - when a sidebar runtime opens
   - when it sends state
   - when it completes or errors

2. State freshness and state selection
   - which board or app state the host saw
   - which state the orchestrator chose as the freshest source of truth

3. Runtime commands
   - what command was sent into the app
   - what state was expected before that command
   - whether the command completed, timed out, or failed

4. Coach and orchestration behavior
   - when ChatBridge injected a kickoff or observed-state coach message
   - what the orchestrator returned to the session

5. Model and tool telemetry
   - provider and model id
   - token counts
   - first-token latency
   - total latency
   - cost when available
   - retries
   - tool-call activity inside the model response

## Runtime Trace Span Kinds

These are the important span kinds currently used in practice.

| Span kind | Primary emitter | What it means | Typical insight |
| --- | --- | --- | --- |
| `trace-root` | `runtimeTraceStore` | A new trace tree was opened | Establishes the app session boundary |
| `runtime-open` | `AppIframePanel` | A TutorMeAI runtime was opened in the sidebar | Confirms lifecycle start and initial state |
| `runtime-snapshot` | `AppIframePanel` | A runtime state update was synced into the host snapshot | Shows the latest app-visible state |
| `app-event` | `AppIframePanel` | A meaningful host-level app event was published | Useful for observing board changes and state observations |
| `state-selection` | `orchestrator` | The agent selected the freshest runtime state to reason over | Explains why one state source won over another |
| `runtime-command` | `orchestrator` | The host attempted a runtime command, such as a move | Helps debug command execution and timeouts |
| `coach-message` | `ApprovedAppCoachController` | The host inserted a coach or observed-state message | Shows when runtime state was translated into chat guidance |
| `agent-return` | `orchestrator` | The orchestration layer decided to invoke a tool, clarify, or pass through | Explains the agent-side decision |
| `model-call` | `runtimeTraceGeneration` | A model generated a response in the active trace context | Core performance and cost span |
| `model-retry` | `runtimeTraceGeneration` | The model call retried | Useful for reliability debugging |
| `tool-call` | `runtimeTraceGeneration` | A tool call/result/error appeared inside the model response | Shows tool activity from the model layer |

The schema also reserves `runtime-message` and `model-step`, but this codebase does not currently emit those as primary spans.

## Trace Tree Shape

A typical Chess Tutor trace tree looks like this:

```text
trace-root
|- runtime-open
|- runtime-snapshot
|- app-event
|- state-selection
|- runtime-command
|- coach-message
|- agent-return
\- model-call
   |- model-retry
   \- tool-call
```

Not every trace has every span. The tree depends on what actually happened in that app session.

## What Each Span Carries

Every span can carry shared runtime context:

- `conversationId`
- `sessionId`
- `appSessionId`
- `approvedAppId`
- `runtimeAppId`
- `actor.layer`
- `actor.source`
- `status`
- `startedAt`
- `endedAt`
- `latencyMs`
- `tags`

Additional structured payloads make the traces useful.

### State snapshot payload

Used heavily by runtime and chess-family traces.

- `source`
- `status`
- `summary`
- `stateDigest`
- `fen`
- `moveCount`
- `lastMove`
- `requestedMove`
- `selectedMove`
- `expectedFen`

This is what makes chess traces especially readable.

### Agent return payload

Used when the orchestration layer returns a concrete action.

- `kind`
  - `invoke-tool`
  - `clarify`
  - `pass-through`
- `toolName`
- `toolCallId`
- `messageId`

### Model usage payload

Used on `model-call` spans.

- `provider`
- `modelId`
- `tokenCountInput`
- `tokenCountOutput`
- `totalTokens`
- `reasoningTokens`
- `cachedInputTokens`
- `cacheWriteTokens`
- `textOutputTokens`
- `costUsd`
- `latencyMs`
- `firstTokenLatencyMs`

### Error payload

Used on any failed span.

- `code`
- `message`
- `recoverable`
- `details`

## Metadata And Metrics Exported To Braintrust

`backend/observability/braintrust.ts` maps each runtime span into Braintrust event fields.

### Braintrust row fields

- `input`
- `output`
- `expected`
- `tags`
- `error`

### Braintrust metrics

- `latencyMs`
- `recordedAtMs`
- `firstTokenLatencyMs`
- `tokenCountInput`
- `tokenCountOutput`
- `totalTokens`
- `reasoningTokens`
- `cachedInputTokens`
- `cacheWriteTokens`
- `textOutputTokens`
- `costUsd`
- `retryCount`
- `stepCount`
- `toolCallCount`
- `toolEventCount`
- `toolResultCount`
- `toolErrorCount`
- `toolPendingCount`

### Braintrust metadata

- `runtimeTraceVersion`
- `runtimeTraceKind`
- `runtimeTraceStatus`
- `recordedAt`
- `conversationId`
- `sessionId`
- `appSessionId`
- `approvedAppId`
- `runtimeAppId`
- `actor`
- `state`
- `agentReturn`
- `model`
- `modelProvider`
- `modelId`
- `finishReason`
- `retryCount`
- `stepCount`
- `toolCallCount`
- `toolResultCount`
- `toolErrorCount`
- `toolPendingCount`
- raw `metadata`
- `error`

This is the core reason the traces are valuable: a Braintrust trace is not just timing data, it is operational context, app state, agent decisions, and model economics in one tree.

## How To Read The Example Chess Tutor Trace

Use the live example above as a walkthrough.

### Start at the root

The `trace-root` tells you:

- which conversation and app session the trace belongs to
- which approved app and runtime app were active
- when the runtime trace began

### Look at runtime-open and runtime-snapshot next

These spans tell you:

- that the sidebar runtime actually opened
- what state the host observed from the app
- the latest chess state, including `fen`, `moveCount`, and `lastMove`

If the visible board and the agent response disagree, this is where you first check.

### Look at state-selection

This span explains:

- which state source the orchestrator trusted
- why it picked that state
- what move or board state it expected

This is how you debug "the agent looked at stale state" problems.

### Look at runtime-command

This span is the best place to debug:

- move dispatch
- expected board state before the command
- timeout versus completion
- requested move versus applied move

### Look at coach-message

This shows when the host translated runtime state into chat-visible coaching or observed-state prompts. It helps explain why a coaching message showed up in chat when no user typed anything new.

### Look at model-call and child tool-call spans

These spans tell you:

- model provider and model id
- latency
- token and cost profile
- retry behavior
- tool activity inside the generation

This is where you debug "the runtime was fine, but the model response was slow, expensive, or wrong."

## Practical Questions This Trace Can Answer

This trace system is meant to answer concrete product questions, not just engineering curiosity.

### Runtime health

- Did the app open?
- Did it emit state?
- Did it complete cleanly or fail?
- Did a command time out?

### State correctness

- What board state did ChatBridge actually observe?
- Was the selected state fresh?
- Did the orchestrator use the right board?

### Agent behavior

- Did the orchestrator invoke a tool, ask for clarification, or pass through?
- Why did the agent choose that path?

### Coaching behavior

- Why was a kickoff or board-observed coach message inserted?
- Which app event triggered it?

### Model economics and performance

- Which model answered?
- How many tokens did it use?
- Was there retry churn?
- Did tool calls happen inside the generation?
- What did the run cost?

### Product insight

- Which app sessions are healthy versus fragile?
- Which app surfaces require the most retries?
- Which states most often cause stale-state or timeout problems?
- Where are we spending tokens and time?

## Current Limits

- Traces are strongest today for TutorMeAI runtime apps, especially chess-family apps.
- The schema supports more span kinds than the current emitters use.
- Braintrust export is optional in local and dev environments and depends on backend configuration.

## Primary Code References

- `src/shared/contracts/v1/runtime-trace/index.ts`
- `src/renderer/stores/runtimeTraceStore.ts`
- `src/renderer/stores/runtimeTraceGeneration.ts`
- `src/renderer/components/apps/AppIframePanel.tsx`
- `src/renderer/components/apps/ApprovedAppCoachController.tsx`
- `src/renderer/components/apps/RuntimeTraceExportController.tsx`
- `src/renderer/packages/tutormeai-telemetry/client.ts`
- `backend/server/railway-web-app.ts`
- `backend/observability/braintrust.ts`
