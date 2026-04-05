# TutorMeAI Trust Docs

These documents implement the policy and reviewer-workflow layers of the TutorMeAI trust governance roadmap in [tasks/roadmap-tutormeai-trust-governance.md](../../tasks/roadmap-tutormeai-trust-governance.md).

They are the source-of-truth documentation for:

* the third-party app trust stance
* approval and rejection criteria
* the target review state machine
* permission and auth review taxonomy
* the human-in-the-loop reviewer workflow

This folder is intentionally enhancement-oriented. It does not redefine the platform features that are already built, such as shared app contracts, app registration, iframe embedding, or baseline launchability checks. Instead, it documents the trust and review rules that later governance features must enforce.

Documents:

* [app-trust-model.md](./app-trust-model.md)
* [app-approval-policy.md](./app-approval-policy.md)
* [app-review-state-machine.md](./app-review-state-machine.md)
* [permission-auth-taxonomy.md](./permission-auth-taxonomy.md)
* [reviewer-workflow.md](./reviewer-workflow.md)

Implementation note:

The current platform already has baseline review status handling, origin policy helpers, iframe sandboxing, and launchability checks. These docs refine that baseline into a fuller trust-governance model rather than replacing it.
