# TutorMeAI Trust Docs

These documents implement Phase 1 of the TutorMeAI trust governance roadmap in [tasks/roadmap-tutormeai-trust-governance.md](../../tasks/roadmap-tutormeai-trust-governance.md).

They are the source-of-truth policy layer for:

* the third-party app trust stance
* approval and rejection criteria
* the target review state machine
* permission and auth review taxonomy

This folder is intentionally policy-first. It does not claim that all trust-governance runtime features are already implemented. Instead, it defines the rules that later backend, runtime, and reviewer-workflow tickets must follow.

Phase 1 documents:

* [app-trust-model.md](./app-trust-model.md)
* [app-approval-policy.md](./app-approval-policy.md)
* [app-review-state-machine.md](./app-review-state-machine.md)
* [permission-auth-taxonomy.md](./permission-auth-taxonomy.md)

Implementation note:

The current platform already has baseline review status handling, origin policy helpers, iframe sandboxing, and launchability checks. These docs refine that baseline into a fuller trust-governance model rather than replacing it.
