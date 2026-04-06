# Repository Organization

## Goal

This document explains the current repository layout, what should remain at the root, and what has already been moved into `docs/` or `scripts/` to reduce clutter.

## Root-Level Philosophy

The repository root should only hold files that are one of these:

- required by common tool conventions
- required by deployment platforms
- the main project entry points
- top-level source folders

That means the root should not also become the default home for process notes, deep implementation writeups, or one-off shell wrappers.

## What Stays At The Root

These files are intentionally root-level because the tooling expects them there or because they are part of the standard project contract:

- `README.md`
- `LICENSE`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.json`
- `biome.json`
- `electron.vite.config.ts`
- `electron-builder.yml`
- `tailwind.config.js`
- `postcss.config.js`
- `Dockerfile`
- `railway.json`
- `vercel.json`
- `.gitignore`, `.npmrc`, `.node-version`, and related root config files

These are load-bearing, even if they make the root look busy.

## What Was Cleaned Up

To reduce root noise, this cleanup pass moved:

- release shell wrappers into `scripts/release/`
- workflow/process notes into `docs/process/`
- engineering error-handling notes into `docs/engineering/`

This keeps the root focused on the actual project entry points while still preserving the documentation.

## Main Top-Level Folders

- `src/`: application code
- `backend/`: platform backend domains
- `docs/`: long-form product, platform, trust, and engineering documentation
- `scripts/`: helper scripts and automation
- `test/`: integration and supporting test code
- `assets/`, `icons/`, `resources/`: static assets and packaging resources
- `tasks/`: planning and roadmap documents
- `doc/`: legacy public docs and README assets carried from upstream Chatbox

## Areas That Still Deserve Future Cleanup

These areas are still candidates for a later reorganization pass:

- `doc/` versus `docs/`
  - `doc/` is still the upstream public-docs and image-assets folder
  - `docs/` now holds the deeper product and engineering narrative
- `script/` versus `scripts/`
  - these should likely be unified in a future cleanup pass after tracing all usages
- `tasks/`
  - this is useful for planning, but it may eventually want subfolders by roadmap, PRD, or archive state

## Recommended Rule Going Forward

When adding a new non-code file:

- put process and engineering docs under `docs/`
- put executable helpers under `scripts/`
- only add a new root file if the toolchain or platform genuinely expects it there
