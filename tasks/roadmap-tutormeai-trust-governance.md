# TutorMeAI

# Trusted App Governance Hardening Roadmap

## 1. Purpose

This roadmap is the **second TutorMeAI roadmap**, focused on trust, approval, and runtime governance for third-party apps.

It is intentionally **not** a replacement for the core platform roadmap in [tasks/roadmap-tutormeai-agent-program.md](./roadmap-tutormeai-agent-program.md).

The core platform roadmap delivered:

* app registration
* tool schema discovery
* AI orchestration
* iframe embedding
* postMessage communication
* app-aware conversation state
* platform auth and per-app OAuth framework
* three app patterns

This roadmap adds the **missing governance layer** needed to safely operate that platform in a K-12 context.

---

## 2. What This Roadmap Is And Is Not

### This roadmap is for:

* third-party app trust policy
* app approval workflow
* origin and permission review
* review harness and evidence collection
* human approval decisioning
* approved-version runtime enforcement
* runtime policy-violation logging
* app suspension / kill switch controls

### This roadmap is not for:

* rebuilding app manifests or tool schemas from scratch
* rebuilding the iframe runtime from scratch
* rebuilding platform auth or per-app OAuth from scratch
* rebuilding the TutorMeAI chat orchestration layer

If a task only repeats work already implemented in the core platform, it should be removed or rewritten as a hardening task.

---

## 3. Baseline Already Built

This roadmap assumes the following are already present in the repo:

* shared contracts for `AppManifest`, `ToolSchema`, runtime messages, and completion signals
* backend app registry and registry API
* conversation persistence, app session persistence, and tool invocation logging
* deterministic tool discovery, tool injection, routing, refusal logic, and ambiguity handling
* iframe + `postMessage` embedded app runtime
* origin validation helpers and sandbox policy builders
* platform auth and per-app OAuth backend framework
* initial review status storage and launchability evaluation
* three working app patterns: internal, public external, and authenticated external

Primary reference files:

* [docs/architecture.md](../docs/architecture.md)
* [backend/registry/service.ts](../backend/registry/service.ts)
* [backend/security/service.ts](../backend/security/service.ts)
* [backend/security/policy.ts](../backend/security/policy.ts)
* [backend/auth/service.ts](../backend/auth/service.ts)
* [src/shared/contracts/v1/app-manifest/index.ts](../src/shared/contracts/v1/app-manifest/index.ts)
* [src/shared/contracts/v1/runtime-messages/index.ts](../src/shared/contracts/v1/runtime-messages/index.ts)
* [src/renderer/components/message-parts/EmbeddedAppHost.tsx](../src/renderer/components/message-parts/EmbeddedAppHost.tsx)

---

## 4. Program Goal

Create a production-credible trust layer for TutorMeAI so that:

1. apps cannot reach production without review
2. approval is platform-owned, not app-declared
3. origins, permissions, and auth scopes are reviewed
4. approved versions are enforced at runtime
5. runtime violations are observable
6. unsafe apps can be suspended quickly

---

## 5. Execution Model

This roadmap should be executed with a mix of **solo** and **swarm** work.

### Use solo execution when:

* the task defines policy
* the task changes approval semantics
* the task changes critical registry or runtime enforcement behavior
* multiple workers would likely create conflicting patterns

### Use swarm execution when:

* the task has a clearly isolated write surface
* the task consumes a stable upstream contract
* the work is additive, such as validators, scanners, logging, or UI

### Hard rule

Do not let swarm workers start on later phases until the blocking solo tasks in the current phase are complete.

---

## 6. Phase Breakdown

### Phase 1 — Policy, Trust Rules, And Approval Model

Goal: define the governance rules before adding more automation.

Execution mode: **solo only**

#### Ticket T1 — Define third-party app trust model

* Owner: Lead Architect / Security Product Agent
* Mode: `solo`
* Objective: define the trust stance for embedded apps in TutorMeAI
* Enhancement over existing system: formalizes curated-only onboarding and versioned trust instead of relying on scattered assumptions
* Dependencies: none
* Acceptance criteria:
  * explains untrusted-by-default stance
  * explains curated onboarding for MVP
  * explains versioned approval and runtime enforcement

#### Ticket T2 — Define approval rubric and rejection reasons

* Owner: Security Product Agent
* Mode: `solo`
* Objective: define staging vs production approval criteria and rejection reasons
* Enhancement over existing system: converts informal review fields into a consistent approval rubric
* Dependencies: `T1`
* Acceptance criteria:
  * approval criteria are explicit
  * rejection reasons are categorized
  * remediation path is defined

#### Ticket T3 — Define app review state machine

* Owner: Backend Architecture Agent
* Mode: `solo`
* Objective: formalize app version review states and allowed transitions
* Enhancement over existing system: upgrades basic review status into a full lifecycle
* Dependencies: `T1`, `T2`
* Acceptance criteria:
  * includes draft, submitted, review_pending, approved, rejected, suspended, retired
  * transition rules are explicit

#### Ticket T4 — Define permission and auth review taxonomy

* Owner: Auth + Security Agent
* Mode: `solo`
* Objective: define how requested permissions and OAuth scopes should be reviewed
* Enhancement over existing system: turns least-privilege expectations into concrete review rules
* Dependencies: `T1`, `T2`
* Acceptance criteria:
  * permission categories are explicit
  * app auth vs platform auth remains separate
  * excessive-scope examples are documented

### Phase 2 — Submission And Validation Hardening

Goal: turn raw registration into reviewable app submission.

Execution mode: `solo` for schema/registry changes, then `swarm` for additive validators.

#### Ticket T5 — Design app submission package schema

* Owner: Contract Agent
* Mode: `solo`
* Objective: define the full review intake package for a submitted app version
* Enhancement over existing system: extends beyond the manifest to include owner, support, staging URL, privacy statement, and release notes
* Dependencies: `T1`, `T2`, `T3`, `T4`
* Acceptance criteria:
  * schema includes app metadata, domains, auth type, permissions, support info, and review artifacts
  * examples exist for internal, public external, and authenticated external apps

#### Ticket T6 — Extend app registry for review-owned approval metadata

* Owner: Backend Agent
* Mode: `solo`
* Objective: add submission and reviewer-owned approval fields to the registry
* Enhancement over existing system: moves approval authority out of app-supplied manifest status
* Dependencies: `T3`, `T5`
* Acceptance criteria:
  * review state, reviewer notes, decision timestamp, and approved version metadata are stored server-side
  * registry schema supports version-scoped approval

#### Ticket T7 — Build domain and origin verification

* Owner: Security Engineering Agent
* Mode: `swarm`
* Objective: verify declared origins are exact, HTTPS, and acceptable for production
* Enhancement over existing system: hardens existing origin normalization into actual review checks
* Dependencies: `T5`, `T6`
* Acceptance criteria:
  * wildcard production origins are blocked
  * origin verification errors are readable

#### Ticket T8 — Build permission sanity checker

* Owner: Security Engineering Agent
* Mode: `swarm`
* Objective: flag excessive or mismatched permission requests
* Enhancement over existing system: adds review logic on top of contract validation
* Dependencies: `T4`, `T5`, `T6`
* Acceptance criteria:
  * checker flags permission/functionality mismatches
  * output is structured for reviewers

#### Ticket T9 — Build OAuth scope sanity checker

* Owner: Auth Security Agent
* Mode: `swarm`
* Objective: flag OAuth scopes that exceed declared app functionality
* Enhancement over existing system: hardens existing OAuth framework with review-time scope analysis
* Dependencies: `T4`, `T5`, `T6`
* Acceptance criteria:
  * excessive scopes are flagged
  * reviewer-facing output explains why

#### Ticket T10 — Update registration flow so review status is platform-owned

* Owner: Backend Agent
* Mode: `solo`
* Objective: ensure submitted apps enter platform-controlled review states regardless of manifest-declared values
* Enhancement over existing system: removes any ambiguity that app-supplied review metadata can self-approve
* Dependencies: `T6`, `T7`, `T8`, `T9`
* Acceptance criteria:
  * manifest review status no longer acts as source of truth
  * submitted versions default into a platform-owned review state

### Phase 3 — Review Harness And Automated Evidence Collection

Goal: gather real behavioral evidence before approval.

Execution mode: one foundational solo task, then a controlled swarm.

#### Ticket T11 — Build staging review harness iframe host

* Owner: Runtime Agent
* Mode: `solo`
* Objective: create a dedicated harness for reviewing candidate apps in controlled conditions
* Enhancement over existing system: separates reviewer sandbox from end-user runtime
* Dependencies: `T10`
* Acceptance criteria:
  * candidate apps can be loaded in a review harness
  * harness uses restricted review configuration

#### Ticket T12 — Build review-session logging

* Owner: Runtime Agent
* Mode: `swarm`
* Objective: capture runtime events during review sessions
* Enhancement over existing system: adds reviewer evidence capture instead of production-only runtime handling
* Dependencies: `T11`
* Acceptance criteria:
  * navigation, error, popup, and message events are recorded

#### Ticket T13 — Build message protocol inspection

* Owner: Runtime Agent
* Mode: `swarm`
* Objective: inspect observed `postMessage` traffic against declared protocol rules
* Enhancement over existing system: compares runtime behavior with expected message shapes during review
* Dependencies: `T11`
* Acceptance criteria:
  * malformed or unexpected message types are flagged

#### Ticket T14 — Build browser automation review runner

* Owner: Automation Agent
* Mode: `swarm`
* Objective: automate core review flows in the harness
* Enhancement over existing system: adds repeatable behavioral exploration for submitted apps
* Dependencies: `T11`
* Acceptance criteria:
  * scanner can load the app, click through declared flows, and save artifacts

#### Ticket T15 — Build manifest-vs-observed behavior checker

* Owner: AI Review Agent
* Mode: `swarm`
* Objective: compare declared functionality with observed behavior
* Enhancement over existing system: catches undeclared login prompts, flows, or message behavior
* Dependencies: `T12`, `T13`, `T14`
* Acceptance criteria:
  * mismatch report is structured
  * undeclared behaviors are clearly flagged

#### Ticket T16 — Build review report generator

* Owner: Reporting Agent
* Mode: `solo`
* Objective: consolidate logs, screenshots, mismatches, and findings into one review artifact
* Enhancement over existing system: creates a single human-review packet instead of scattered raw artifacts
* Dependencies: `T12`, `T13`, `T14`, `T15`
* Acceptance criteria:
  * report includes artifacts, findings, and recommended next action

### Phase 4 — Human Review And Approval Workflow

Goal: let human reviewers approve, reject, or request remediation.

Execution mode: serial API/design work, then a small UI swarm.

#### Ticket T17 — Design reviewer workflow

* Owner: Security Product Agent
* Mode: `solo`
* Objective: define how review artifacts move to final decisions
* Enhancement over existing system: adds a real human decision path on top of automated checks
* Dependencies: `T16`
* Acceptance criteria:
  * workflow includes approve, reject, remediate
  * staging vs production approval is defined

#### Ticket T18 — Build review decision backend endpoints and persistence

* Owner: Backend Agent
* Mode: `solo`
* Objective: persist review decisions, notes, and resulting approval state
* Enhancement over existing system: promotes existing review records into a real review authority layer
* Dependencies: `T17`
* Acceptance criteria:
  * decisions are auditable
  * app version state changes are persisted through the backend

#### Ticket T19 — Build reviewer admin UI

* Owner: Admin UI Agent
* Mode: `swarm`
* Objective: create a reviewer interface for inspecting artifacts and making decisions
* Enhancement over existing system: gives reviewers an operational workflow instead of direct database or API usage
* Dependencies: `T18`
* Acceptance criteria:
  * reviewer can inspect report and set decision state

#### Ticket T20 — Build remediation feedback loop

* Owner: Admin Workflow Agent
* Mode: `swarm`
* Objective: return actionable remediation notes to app submitters
* Enhancement over existing system: closes the loop between review failure and app resubmission
* Dependencies: `T18`
* Acceptance criteria:
  * remediation reasons are structured and understandable

### Phase 5 — Runtime Enforcement, Monitoring, And Kill Switch

Goal: make approval enforceable after launch.

Execution mode: hybrid; sensitive enforcement stays solo, telemetry can swarm.

#### Ticket T21 — Enforce approved-origin-only iframe loading

* Owner: Frontend Runtime Agent
* Mode: `solo`
* Objective: ensure only reviewer-approved origins can render in production runtime
* Enhancement over existing system: upgrades helper-level origin checks into explicit policy enforcement
* Dependencies: `T18`
* Acceptance criteria:
  * runtime blocks unapproved origins
  * blocked events are surfaced clearly

#### Ticket T22 — Enforce approved-version-only app loading

* Owner: Backend + Runtime Agent
* Mode: `solo`
* Objective: ensure the runtime only launches approved versions
* Enhancement over existing system: makes trust version-scoped rather than app-scoped
* Dependencies: `T18`
* Acceptance criteria:
  * unapproved app versions cannot launch
  * version mismatch is logged

#### Ticket T23 — Build runtime policy-violation logging

* Owner: Observability Agent
* Mode: `swarm`
* Objective: log blocked origins, invalid messages, crashes, and other policy violations
* Enhancement over existing system: upgrades local runtime handling into an operational monitoring surface
* Dependencies: `T21`, `T22`
* Acceptance criteria:
  * violation events are queryable by app and version

#### Ticket T24 — Build app health monitoring

* Owner: Observability Agent
* Mode: `swarm`
* Objective: track launch success, timeouts, crashes, and repeated failures
* Enhancement over existing system: adds app health visibility beyond individual runtime errors
* Dependencies: `T21`, `T22`
* Acceptance criteria:
  * health metrics exist by app and version

#### Ticket T25 — Build app suspend / kill switch controls

* Owner: Backend Agent
* Mode: `solo`
* Objective: let operators disable one app or one version quickly
* Enhancement over existing system: adds operational response for bad apps after approval
* Dependencies: `T23`, `T24`
* Acceptance criteria:
  * app or version can be suspended quickly
  * suspended app cannot be launched

### Phase 6 — Re-Review And Scale

Goal: reduce manual effort safely after MVP.

Execution mode: mostly post-MVP, with selective swarm.

#### Ticket T26 — Build re-review trigger rules

* Owner: Security Product Agent
* Mode: `solo`
* Objective: define when a new version requires re-review
* Enhancement over existing system: prevents stale approval from silently carrying forward
* Dependencies: `T25`
* Acceptance criteria:
  * material changes trigger re-review

#### Ticket T27 — Build version diff risk analyzer

* Owner: AI Review Agent
* Mode: `swarm`
* Objective: estimate whether a new version materially changed risk
* Enhancement over existing system: prioritizes manual review where it matters most
* Dependencies: `T26`
* Acceptance criteria:
  * analyzer flags meaningful risk deltas

#### Ticket T28 — Build nightly regression scan pipeline

* Owner: Automation Agent
* Mode: `swarm`
* Objective: re-scan approved apps on a recurring basis
* Enhancement over existing system: adds ongoing monitoring instead of one-time approval only
* Dependencies: `T25`, `T26`
* Acceptance criteria:
  * approved apps can be scanned automatically on a schedule

#### Ticket T29 — Build trust/risk scoring

* Owner: Risk Scoring Agent
* Mode: `solo`
* Objective: score apps by operational and trust risk
* Enhancement over existing system: helps reviewers and operators prioritize attention
* Dependencies: `T27`, `T28`
* Acceptance criteria:
  * score inputs and meaning are documented

#### Ticket T30 — Build non-binding approval recommendation engine

* Owner: AI Review Agent
* Mode: `solo`
* Objective: generate reviewer-facing recommendations, not final decisions
* Enhancement over existing system: adds assistive prioritization while keeping humans in control
* Dependencies: `T29`
* Acceptance criteria:
  * recommendations are explainable
  * human approval remains required

---

## 7. Recommended Execution Order

### MVP path

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5

### Post-MVP path

6. Phase 6

If time is limited, the MVP cut line is the end of Phase 5.

---

## 8. Swarm Guidance

### Good swarm candidates

* `T7` domain and origin verification
* `T8` permission sanity checker
* `T9` OAuth scope sanity checker
* `T12` review-session logging
* `T13` message protocol inspection
* `T14` browser automation review runner
* `T15` manifest-vs-observed behavior checker
* `T19` reviewer admin UI
* `T20` remediation feedback loop
* `T23` runtime policy-violation logging
* `T24` app health monitoring

### Keep solo

* `T1-T6`
* `T10-T11`
* `T16-T18`
* `T21-T22`
* `T25-T30`

Reason: these define policy, registry semantics, approval authority, or runtime enforcement behavior and are more likely to conflict if split across multiple workers.

---

## 9. Definition Of Done

This roadmap is complete for MVP when:

1. apps cannot reach production without platform-owned review approval
2. manifests are no longer treated as self-authorizing approval records
3. submission packages include the extra metadata needed for real review
4. origins, permissions, and OAuth scopes are reviewed before approval
5. a review harness can generate usable evidence
6. a human reviewer can approve, reject, or request remediation
7. runtime enforces approved origins and approved versions
8. runtime policy violations are logged
9. unsafe or broken apps can be suspended quickly

---

## 10. Strong Recommendation

When assigning agents, frame this as:

> This is the TutorMeAI trust, app approval, and runtime protection roadmap.
> It is a hardening and governance roadmap built on top of the already-delivered core app platform.
> Agents must treat tasks as enhancements to the existing implementation, not greenfield replacements.
