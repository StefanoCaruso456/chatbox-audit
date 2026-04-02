# Chatbox Cleanup Roadmap

This roadmap locks the cleanup work into phases so we can ship fixes in small, reviewable PRs instead of one risky sweep.

## Phase 1: Restore Broken UI Refactors

Goal: remove obvious runtime and compile breakages introduced by incomplete UI changes.

Scope:

- restore the missing InputBox state types module
- remove stale imports left behind by the InputBox refactor
- fix the Tavily settings panel imports
- clear low-risk nullability issues in touched UI helpers

Exit criteria:

- touched files are type-safe
- no missing-module errors remain in the InputBox path
- the Tavily settings screen can render without missing component references

## Phase 2: Fix Async Storage and Atom Boundaries

Goal: stop Promise-shaped storage results from leaking into synchronous Jotai atoms.

Scope:

- replace the current `remoteConfigAtom` path with a hydrated sync-after-bootstrap store or service
- move `remoteConfig` readers and writers off the async `atomWithStorage` path first
- retire legacy Jotai settings atoms once the Zustand-backed settings flow is the only live path

Exit criteria:

- settings/config atoms no longer produce Promise union types
- dependent store and session helpers stop carrying workaround casts
- remote config merges no longer risk dropping persisted keys during app bootstrap

## Phase 3: Make Type Checking Reproducible

Goal: make `pnpm check` meaningful on a clean clone.

Scope:

- ensure generated router artifacts exist before `tsc --noEmit`
- wire route generation into the check path instead of relying on a previously generated local file
- verify the generated-file policy matches `.gitignore`

Exit criteria:

- a clean checkout can run the repo's TypeScript check path without manual generation steps

## Phase 4: Remove Dead or Stranded UI Pieces

Goal: trim wrapper components and barrels left behind after rewrites.

Scope:

- remove unreferenced InputBox wrapper components
- validate dead-code candidates manually before deletion
- avoid trusting bulk dead-code tooling without route/build config

Exit criteria:

- deleted files have no runtime imports
- barrel exports only expose live surfaces

## Phase 5: Sweep Lint and CSS Debt

Goal: clean low-risk correctness issues once the structural work is stable.

Scope:

- duplicate JSX keys
- static DOM ids that should use `useId`
- missing React keys in mapped children
- invalid pseudo-selectors and duplicate CSS properties

Exit criteria:

- targeted lint pass is clean for the touched files
- no behavior changes beyond correctness cleanup
