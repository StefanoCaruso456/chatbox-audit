# Deployment Readiness Notes

## Current Build Entry Points

- Web bundle: `pnpm run build:web`
- Web preview server: `pnpm run serve:web`
- Desktop package for current platform: `pnpm run package`
- Desktop publish wrappers:
  - `pnpm run release:web`
  - `pnpm run release:mac`
  - `pnpm run release:linux`
  - `pnpm run release:win`

## What Was Fixed

- `electron.vite.config.ts` now points to the existing PostCSS config file.
- The missing `release-*.sh` wrapper scripts now exist and map to the corresponding package workflows.

## Current Deployment Constraints

- This repository is still desktop-first. The web build exists, but not every feature has parity with Electron.
- Some web platform methods are still intentionally unimplemented, especially around local desktop capabilities and knowledge-base behavior.
- Hosted Chatbox services are still part of several premium or hybrid flows, including auth, license checks, remote config, hosted parsing, and manifest/model helpers.
- The supported runtime in `package.json` is Node `^20.19.0 || >=22.12.0 <23.0.0`. Running outside that range may break install or build behavior.

## Recommended Use Right Now

- Treat the web bundle as a live preview surface while the platform contracts and capability gating are being finalized.
- Do not assume full feature parity across web, desktop, and mobile until the capability matrix and gating work is complete.

## Verification Status

- Verified on March 31, 2026 that `npm_config_engine_strict=false pnpm run build:web` completes successfully in this clone.

## Known Build Warnings Still Open

- The renderer build reports circular chunk warnings around `src/renderer/stores/sessionActions.ts` re-exports and `src/renderer/packages/context-management/index.ts` re-exports.
- The renderer build reports very large chunks, especially the main renderer bundle and vendor bundles.
- Third-party dependencies still trigger `eval` warnings during bundling in a few packages.

These are not blocking the web build anymore, but they should be treated as follow-up work for bundle health and runtime safety.
