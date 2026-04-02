# TutorMeAI Cost Analysis

## Purpose

This document provides a submission-ready cost model for the TutorMeAI third-party app platform.

Important honesty note:

- the repo now has schema and service support for invocation logging
- a live production telemetry pipeline is not yet connected in this clone
- because of that, the development-spend section below is a modeled estimate, not a captured billing export

## Major Cost Drivers

1. LLM chat and routing turns
2. Third-party app API calls
3. Vercel client hosting
4. Railway backend compute
5. PostgreSQL storage and backups
6. Logging and monitoring

## Modeling Assumptions

### Product usage

- 60 total chat turns per monthly active user
- 30% of turns are app-aware
- one active embedded app session per conversation at a time

### Turn mix

| Turn type | Share | Assumed average cost |
| --- | --- | --- |
| Plain chat turn | 70% | `$0.0015` |
| Routed public/internal app turn | 20% | `$0.0080` |
| Authenticated or richer app turn | 10% | `$0.0150` |

Weighted average LLM cost per turn:

- `0.70 * 0.0015 + 0.20 * 0.0080 + 0.10 * 0.0150 = $0.00415`

Weighted average LLM cost per monthly active user:

- `60 turns * $0.00415 = $0.249`

### Infrastructure assumptions

- Vercel client cost starts low and scales mostly with bandwidth and edge usage
- Railway backend cost grows with orchestration traffic, auth callbacks, and SSE concurrency
- PostgreSQL grows with messages, sessions, invocation logs, and retained analytics
- External public/authenticated app providers may add API-specific cost later, but the MVP demo apps are modeled with a modest buffer instead of provider-specific billing

## Estimated Development Spend

This is a modeled sprint estimate for architecture, implementation, and QA validation of the case-study build:

| Category | Assumption | Estimated cost |
| --- | --- | --- |
| Plain dev chat turns | `1,200 turns * $0.0015` | `$1.80` |
| Routed/tool dev turns | `1,800 turns * $0.0080` | `$14.40` |
| Auth-heavy or retry flows | `400 turns * $0.0150` | `$6.00` |
| Re-run / debugging buffer | `40%` of subtotal | `$8.88` |
| Estimated AI development spend | total | `$31.08` |

Interpretation:

- low-end development cost is plausible because most work is local code editing and test execution
- live deployment soak testing would increase this number
- production telemetry should replace this estimate once invocation-cost logging is wired to real model/provider billing data

## Monthly Production Projection

| Monthly active users | Monthly turns | LLM cost | Infra baseline | External API / auth buffer | Estimated total |
| --- | --- | --- | --- | --- | --- |
| `100` | `6,000` | `$24.90` | `$70` | `$15` | `$109.90` |
| `1,000` | `60,000` | `$249.00` | `$140` | `$35` | `$424.00` |
| `10,000` | `600,000` | `$2,490.00` | `$550` | `$350` | `$3,390.00` |
| `100,000` | `6,000,000` | `$24,900.00` | `$3,000` | `$2,500` | `$30,400.00` |

## Cost Interpretation

- At small scale, infrastructure overhead matters almost as much as model usage.
- At medium and large scale, LLM cost becomes the dominant driver.
- Authenticated apps add both token-management overhead and extra external API uncertainty.
- The deterministic orchestration strategy helps because it reduces unnecessary tool exposure and avoids expensive multi-step agent loops.

## Cost Control Recommendations

1. Keep tool injection bounded to eligible tools only.
2. Reuse compact app summaries instead of replaying raw app state into every turn.
3. Prefer deterministic routing and clarification over repeated speculative app calls.
4. Rate-limit per-user tool invocation spikes, especially for authenticated apps.
5. Add per-app launch success and latency dashboards before wider rollout.

## What Should Be Instrumented Next

To replace the modeled estimates with real numbers, wire the following into production reporting:

- tokens per request and per provider
- tool invocation count by app and tool
- average cost per routed turn
- OAuth start/callback success rate
- SSE session counts and duration
- app failure / timeout rate

The backend schema already supports the core invocation and session logging needed for this next step.
