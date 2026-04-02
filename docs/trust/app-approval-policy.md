# TutorMeAI App Approval Policy

## Purpose

This document defines the approval rubric, rejection reasons, and remediation path for third-party apps.

It is the source of truth for Trust Governance Roadmap Ticket `T2`.

## Approval Levels

TutorMeAI uses two approval levels:

### Approved For Staging

The app may be loaded in a controlled review or internal test environment.

This does not mean the app is safe for production users.

### Approved For Production

The app may be launched for end users in TutorMeAI production environments, subject to runtime enforcement.

## Minimum Production Approval Criteria

An app version must satisfy all of the following before production approval:

1. submission package is complete
2. manifest and tool contracts validate successfully
3. declared origins are exact, HTTPS, and approved
4. permission requests are justified
5. OAuth scopes, if any, are justified
6. iframe embedding behavior is compatible with the platform security model
7. visible content is appropriate for the intended student audience
8. observed behavior matches declared behavior closely enough for trust
9. a reviewer signs off on the specific app version

## Required Review Inputs

Production approval should use the following evidence:

* app submission package
* manifest and tool validation output
* origin and permission review output
* sandbox/review harness artifacts
* browser-assisted review report
* reviewer notes

## Rejection Categories

An app version should be rejected if it fails in any of these categories:

### Contract Failure

Examples:

* invalid manifest
* invalid tool schema
* missing required metadata

### Origin Or Hosting Failure

Examples:

* wildcard production origins
* undeclared hostnames
* non-HTTPS entry points

### Permission Or Scope Overreach

Examples:

* asks for broader permissions than the feature needs
* requests OAuth scopes unrelated to declared functionality

### Sandbox Incompatibility

Examples:

* requires unsafe iframe capabilities without justification
* uses navigation or popup behavior incompatible with the host policy

### Safety Or Age-Appropriateness Failure

Examples:

* harmful content
* manipulative or ad-like behavior
* links or instructions inappropriate for children

### Behavior Mismatch

Examples:

* undeclared login flow
* undeclared origin usage
* hidden secondary workflows
* behavior that materially differs from the manifest

## Remediation Policy

Rejected apps may be resubmitted if the submitter receives actionable remediation notes.

Remediation notes must:

* identify the failing category
* explain the reason clearly
* point to the relevant contract, policy, or runtime expectation
* distinguish blocking issues from non-blocking feedback

## Approval Authority

Approval is platform-owned.

An app manifest may include safety metadata for compatibility with current contracts, but that field must not be treated as self-authorizing production approval.

The authoritative approval record belongs to the platform review system.

## Distribution-Specific Expectations

### Internal Apps

Expectations:

* still reviewed for age appropriateness and platform safety
* may rely on platform session trust
* must still obey sandbox and scoped-data rules if embedded

### Public External Apps

Expectations:

* no user-specific app auth
* no hidden account-linking requirements
* clear educational value and low-friction launch behavior

### Authenticated External Apps

Expectations:

* user-level OAuth scopes must be justified
* backend-brokered auth is required
* raw long-lived app credentials must not be exposed to the iframe

## MVP Policy Summary

For MVP:

* production apps are curated and approved manually
* approval applies to a version, not just an app slug
* remediation is allowed
* open self-serve production onboarding is out of scope

## Decision Summary

TutorMeAI should approve apps conservatively, reject them clearly, and make remediation understandable. The goal is not to approve the most apps quickly; it is to approve safe, explainable, operationally manageable apps for a K-12 product.
