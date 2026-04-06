# Analytics Platform

This repository now includes the foundation for a role-aware analytics product, not just a chat interface.

The analytics work supports two goals at once:

- better visibility for end users such as teachers and parents
- a stronger B2B product story for schools, districts, and platform buyers

## What It Is

The analytics platform is the reporting layer that sits beside the core workspace and app platform.

It helps answer questions like:

- how often is a learner using the platform
- what kinds of tasks are they completing
- where are they getting stuck
- which approved tools are helping
- what outcomes can a teacher, parent, or school leader actually see

This matters because the product is no longer only a chat shell. It is becoming a measurable workflow and learning platform with role-based visibility.

## What Is Implemented Today

The codebase already includes a dedicated analytics surface and supporting platform foundations.

Implemented now:

- an analytics route in the renderer application
- explicit audience views for `teacher` and `parent`
- metrics and summaries around activity, prompt usage, time-in-app, assignments, and engagement
- general-use-case framing for school reporting, adoption, and intervention planning
- runtime observability and Braintrust export for platform monitoring
- role-aware auth and onboarding for `student`, `teacher`, `school_admin`, and `district_Director`

In practical terms, the current repo already supports a real analytics story for classroom and family visibility, while laying the groundwork for broader administrative reporting.

## Audience Views

### Teacher Analytics

The teacher view is the clearest currently shipped analytics audience.

It is oriented around classroom and learner support:

- engagement over time
- assignment and task completion patterns
- prompt activity and time spent in the platform
- indicators that can support MTSS or intervention planning
- app usage context that helps explain how work was completed

This makes the platform easier to position as a teacher workflow product, not just a student-facing assistant.

### Parent Analytics

The parent view is also explicitly represented in the analytics experience.

It is oriented around visibility and trust:

- how frequently the learner is using the system
- whether assignments and guided tasks are being completed
- what kinds of learning activity are happening
- clearer family-facing transparency around progress and participation

This helps the product support end-user transactions and family adoption, not only institutional sales.

### Admin And School Leadership Analytics

`school_admin` is already part of the platform's role model and approval/governance foundation.

That means the system is already pointed toward school-level reporting such as:

- app adoption and approved-tool usage
- engagement trends across groups
- review and approval workflow oversight
- implementation health for schools using the platform

The important distinction is that this is best described today as a platform-ready extension on top of the current analytics/data model, rather than a fully separate dedicated admin dashboard route.

### District Analytics

`district_Director` is also present in the role model, which gives the product a credible district-facing reporting story.

That creates room for district-level packaging such as:

- rollout and adoption reporting
- usage and engagement comparisons across schools
- trust, review, and compliance visibility
- outcome reporting tied to licensing and expansion conversations

As with school admin analytics, this should be positioned as a role-based reporting layer enabled by the existing platform foundation, with some surfaces more mature than others.

## Signals The Platform Can Report On

Across the current implementation, the analytics story centers on signals such as:

- activity volume
- prompt usage
- time-in-app
- assignment-related events
- engagement trends
- app usage context
- review and access-control events
- runtime and observability data

Together, these signals support both user-facing insight and operational reporting.

## Implementation Areas

The analytics platform is not isolated to one file. It is spread across several layers of the system:

- renderer analytics experience in [`src/renderer/routes/analytics.tsx`](../src/renderer/routes/analytics.tsx)
- role-aware auth and profile flows in [`src/renderer/components/auth/TutorMeAIAuthGate.tsx`](../src/renderer/components/auth/TutorMeAIAuthGate.tsx) and related settings screens
- shared role definitions in [`src/shared/types/settings.ts`](../src/shared/types/settings.ts)
- backend role and approval enforcement in [`backend/app-access/service.ts`](../backend/app-access/service.ts) and [`backend/auth/assignments.ts`](../backend/auth/assignments.ts)
- persistence and role constraints in [`backend/db/schema.sql`](../backend/db/schema.sql)
- observability and export guidance in [Runtime Observability](./runtime-observability.md)

## Why This Matters Commercially

This analytics work improves the product story in two directions.

For B2B buyers:

- it creates a reporting and accountability layer that schools and districts can understand
- it supports adoption, intervention, approval, and implementation conversations
- it makes the app platform more sellable because usage and outcomes can be measured

For end users and families:

- it creates transparency
- it helps differentiate the product from generic chat tools
- it supports premium and trust-sensitive workflows where visibility matters

## Current Boundary

The cleanest way to describe the current state is:

- teacher and parent analytics are explicit product surfaces in the current implementation
- admin and district analytics are strongly supported by the role model, governance layer, and data direction
- the broader analytics platform exists as a real product foundation, even if not every audience has a fully separate polished dashboard yet

## Recommended Positioning

When describing this repo externally, the best framing is:

- Chatbox provides the multi-provider AI workspace foundation
- TutorMeAI / ChatBridge adds approved apps, trust, orchestration, and role-aware analytics
- the analytics platform supports classroom visibility now and scales into school and district reporting for B2B packaging
