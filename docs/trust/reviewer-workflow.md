# TutorMeAI Reviewer Workflow

## Purpose

This document defines the human-in-the-loop reviewer workflow for third-party app approval.

It is the source of truth for Trust Governance Roadmap Ticket `T17`.

## Scope

This workflow begins after:

* the app submission package has been accepted
* deterministic validation has completed
* review harness artifacts are available

This workflow does **not** replace the earlier validation and harness phases. It consumes their output and turns it into a platform-owned decision.

## Reviewer Goals

The reviewer workflow must let a human reviewer:

1. inspect the submitted app version and its declared metadata
2. inspect automated findings and review-harness artifacts
3. move the app into active review
4. approve for staging
5. approve for production
6. reject
7. request remediation with actionable feedback
8. suspend a previously approved version when needed

## Workflow Stages

### 1. Queue Intake

Reviewer sees app versions in a review queue.

Typical queue candidates:

* `submitted`
* `review-pending`
* `approved-staging`
* `suspended`

The queue should show:

* app name
* app version
* distribution and auth type
* current review state
* submitted date
* latest reviewer notes, if any

### 2. Review Context

When the reviewer opens a candidate, the platform should show one detail surface that combines:

* app metadata
* submission package details
* validation findings
* review-harness timeline
* runtime findings
* prior review history

The existing `/review-harness` route is the right primary detail seam for this because it already renders candidate metadata, runtime findings, and the live sandbox preview.

### 3. Start Review

Opening a candidate for active review is a platform action, not just a passive page view.

When a reviewer starts review:

* `submitted -> review-pending`
* `suspended -> review-pending`

This is the point where the candidate becomes actively under human review instead of merely sitting in the intake queue.

### 4. Decision Actions

The reviewer can take these decisions:

#### `approve-staging`

Use when:

* the app is safe enough for controlled staging or partner review
* production approval is not yet appropriate

State result:

* review state: `approved-staging`
* runtime status: `pending`

#### `approve-production`

Use when:

* production criteria are satisfied
* the reviewer is comfortable granting production launchability for this exact version

State result:

* review state: `approved-production`
* runtime status: `approved`

#### `request-remediation`

Use when:

* the app is close but still has fixable issues
* the reviewer wants to preserve a clear fix list for the submitter

State result:

* review state: `rejected`
* runtime status: `blocked`

Required output:

* structured remediation items
* reviewer summary
* optional detailed notes

#### `reject`

Use when:

* the version fails review materially
* the current submission should not move forward as-is

State result:

* review state: `rejected`
* runtime status: `blocked`

#### `suspend`

Use when:

* a previously approved version must be disabled after new evidence, policy violation, or incident

State result:

* review state: `suspended`
* runtime status: `blocked`

## Decision Rules

### Production approval must be explicit

`approved-staging` must never be treated as equivalent to `approved-production`.

### Reviewer authority is platform-owned

The app manifest may still contain safety metadata for compatibility, but that metadata is not authoritative.

The authoritative approval record is the reviewer decision plus the resulting stored app version state.

### Rejection and remediation are not the same user experience

Both lead to a blocked runtime outcome, but `request-remediation` must preserve a clearer feedback payload for submitters than a plain rejection.

### Suspension is operational, not just editorial

Suspension must be treated as a hard launch block until the app is re-reviewed.

## Required Decision Inputs

Before a reviewer makes a final decision, the reviewer should have access to:

* submission package
* validation findings
* harness timeline and runtime findings
* origin and auth review context
* prior review history for the same app version

## Required Decision Outputs

Every final decision should persist:

* reviewer identity
* decision action
* resulting review state
* resulting runtime review status
* decision summary
* optional detailed reviewer notes
* remediation items, when applicable
* decision timestamp

## UI Guidance

The recommended UI pattern is:

1. queue list
2. review-harness detail view
3. decision panel attached to that detail view

For the detail screen, extend the existing `/review-harness` route rather than creating a second disconnected reviewer detail page.

## Decision Summary

TutorMeAI’s reviewer workflow should turn automated evidence into clear, auditable, human-owned approval decisions. The system should make it easy to review responsibly, reject clearly, remediate precisely, and suspend quickly.
