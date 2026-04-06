# Chatbox Codebase Audit

Audit date: 2026-03-30

This folder captures a structured audit of the `chatboxai/chatbox` repository with an emphasis on product shape, feature coverage, system architecture, user personas, customer journey, and follow-on audit work.

## Scope

- Repository cloned from `https://github.com/chatboxai/chatbox`
- Approximate tracked file count at audit time: 698
- Source files under `src/`: 585
- TypeScript/TSX line count under `src/`: 74,429
- Built-in provider definitions: 17
- Locales: 14
- Unit/component/package tests in `src/`: 28
- Integration test TypeScript files in `test/integration/`: 8

## Deliverables

- `01-products.md`
  Product portfolio, packaging, deployment targets, and commercial boundary.
- `02-features.md`
  Feature catalog grouped by user job and subsystem.
- `03-system-architecture.md`
  Runtime architecture, data flow, storage model, and code ownership map.
- `04-personas-and-customer-journey.md`
  Likely personas, jobs to be done, and end-to-end usage journey.
- `05-purpose-why-how-outcomes.md`
  Product rationale: why it exists, why it matters now, how it is delivered, and what outcomes it creates.
- `06-audit-findings-and-recommendations.md`
  Risks, hotspots, next actions, and the additional work that should happen during a deeper audit.
- `07-mermaid-diagrams.md`
  Product, architecture, and workflow diagrams in Mermaid format.
- `08-repo-inventory.md`
  Inventory of major modules, routes, tests, locales, providers, and code hotspots.

## Audit Method

This audit combined:

- full repository inventory and file counting
- targeted reading of entrypoints, storage, provider, routing, session, MCP, knowledge-base, image-generation, and remote-service code
- review of existing internal documentation in `docs/`, `README.md`, `team-sharing/README.md`, `doc/FAQ.md`, and `docs/engineering/error-handling.md`
- scan of TODO/FIXME markers, largest modules, route surfaces, tests, locales, and provider definitions

## Important Note

I scanned the full repo inventory and read the text/code/configuration files that define product behavior and architecture. Binary assets, screenshots, icons, and static images were cataloged as part of the audit but not treated as semantic source in the same way as executable code and prose documentation.

## Top Themes

- Chatbox is no longer just a "desktop wrapper for ChatGPT"; it is a multi-surface AI workspace spanning desktop, web, mobile sync/build targets, image generation, web search, MCP tools, copilots, and knowledge-base retrieval.
- The renderer owns most product complexity. The most important architectural seams are `src/main`, `src/preload`, `src/renderer`, and `src/shared`.
- The product is intentionally local-first, but several premium or advanced capabilities depend on Chatbox-hosted services.
- The main engineering risk is not lack of features. It is complexity concentration in a handful of large modules plus a mixed state-management stack.
