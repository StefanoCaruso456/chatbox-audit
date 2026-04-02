# TutorMeAI App Review State Machine

## Purpose

This document defines the target app review lifecycle and allowed transitions.

It is the source of truth for Trust Governance Roadmap Ticket `T3`.

## Important Scope Note

The current implementation baseline already uses simple review statuses such as `pending`, `approved`, and `blocked`.

This document defines the **target state model** that later registry and reviewer-workflow tickets should implement. It is a hardening spec, not a claim that the full state machine already exists in code.

## Review States

### `draft`

The app submission exists locally or internally but has not been formally submitted for review.

### `submitted`

The platform has received the submission package and queued it for initial validation.

### `validation_failed`

The app failed manifest, origin, permission, or submission-package validation and cannot proceed until fixed.

### `review_pending`

The app passed intake validation and is waiting for reviewer or automated evidence collection.

### `approved_staging`

The app may run in controlled staging/review environments only.

### `approved_production`

The app version is approved for production launch.

### `rejected`

The app version failed review and is not approved for use.

### `suspended`

The app version was previously approved or available but has been disabled due to risk, incident, or policy violation.

### `retired`

The app version is intentionally no longer active and should not be launched.

## Allowed Transitions

### Initial Intake

* `draft -> submitted`
* `submitted -> validation_failed`
* `submitted -> review_pending`

### Review Outcomes

* `validation_failed -> submitted`
* `review_pending -> approved_staging`
* `review_pending -> approved_production`
* `review_pending -> rejected`

### Promotion And Lifecycle Management

* `approved_staging -> approved_production`
* `approved_staging -> rejected`
* `approved_staging -> suspended`
* `approved_production -> suspended`
* `approved_production -> retired`

### Recovery And Resubmission

* `rejected -> submitted`
* `suspended -> review_pending`
* `suspended -> retired`

## Explicitly Disallowed Transitions

These transitions should not happen directly:

* `draft -> approved_production`
* `submitted -> approved_production` without review
* `rejected -> approved_production` without resubmission or review
* `retired -> approved_production` without a new review path

## State Semantics

### Staging Approval Is Not Production Approval

`approved_staging` is for controlled testing and partner review. It must not be treated as equivalent to production approval.

### Suspension Overrides Prior Approval

`suspended` means the app must not launch, regardless of previous approval state.

### Approval Is Version-Scoped

State applies to an app version and approved origin set, not just to an app family or slug.

## Runtime Expectations

Runtime launch enforcement should eventually map to the target state model as follows:

* only `approved_production` launches in production
* `approved_staging` launches only in approved non-production review environments
* `submitted`, `validation_failed`, `review_pending`, `rejected`, `suspended`, and `retired` do not launch in production

## Migration Guidance

Because the current implementation uses simpler review states, later tickets should migrate carefully:

1. add new state fields without breaking current launch checks
2. keep `approved` equivalent to `approved_production` during transition
3. keep `blocked` equivalent to either `rejected` or `suspended` depending on context
4. migrate runtime gating only after reviewer workflow and registry fields are ready

## Decision Summary

TutorMeAI needs a fuller review lifecycle than `pending/approved/blocked` so approval becomes auditable, version-aware, and operationally enforceable.
