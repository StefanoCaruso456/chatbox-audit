# Audit Findings and Recommendations

## Main Findings

### 1. The product is feature-rich, but complexity is concentrated in a few oversized modules

Biggest functional hotspots from the scan:

- `src/renderer/components/InputBox/InputBox.tsx` - 1,316 lines
- `src/renderer/components/knowledge-base/KnowledgeBaseDocuments.tsx` - 1,001 lines
- `src/main/knowledge-base/ipc-handlers.ts` - 816 lines
- `src/renderer/routes/settings/provider/$providerId.tsx` - 813 lines
- `src/renderer/packages/remote.ts` - 809 lines
- `src/renderer/stores/migration.ts` - 805 lines
- `src/main/main.ts` - 756 lines

Recommendation:

- continue the repo's existing pattern of module splitting, especially in input, settings, KB docs, and main-process IPC

### 2. State management is powerful but expensive

The app combines:

- React Query
- Zustand
- Jotai
- local component state
- platform storage state

That can work, but it raises onboarding and debugging cost.

Recommendation:

- define a state ownership guide:
  what lives in React Query, what lives in Zustand, what lives in Jotai, and what should never be duplicated

### 3. The local-first story is real, but the hosted-service boundary is under-documented

Many advanced flows depend on Chatbox services:

- license and auth
- remote config
- model manifest
- hosted search
- advanced link parsing
- upload URL generation

Recommendation:

- create a short architecture decision record that classifies every major feature as local, hybrid, or hosted

### 4. The repo has solid internal docs, but they are subsystem-specific rather than repo-orientation-first

Existing docs are good for:

- adding providers
- storage migration
- token estimation
- testing
- session splitting
- RAG

What is missing is a concise "how the whole product fits together" orientation.

Recommendation:

- keep this audit folder and evolve it into permanent onboarding docs

### 5. Security-sensitive areas deserve explicit review

Notable review targets:

- `webSecurity: false` in Electron `BrowserWindow`
- Mermaid rendering that injects SVG with `dangerouslySetInnerHTML`
- remote parsing and hosted file/link workflows
- proxy configuration and open-link behavior

Recommendation:

- do a dedicated Electron security review rather than folding this into normal feature work

### 6. Web and mobile capability differences are real

Examples:

- some KB and local parsing behavior are desktop-first
- web platform intentionally leaves some methods unimplemented
- mobile behavior exists in build branches and UI conditions, but parity is not universal

Recommendation:

- publish a feature-parity matrix per platform

## TODO / FIXME Markers Found

- `docs/rag.md`: rerank marked TODO
- `src/renderer/pages/SettingDialog/AdvancedSettingTab.tsx`: missing validation FIXME
- `src/main/knowledge-base/file-loaders.ts`: user-friendly error message TODO
- `src/renderer/utils/mobile-request.ts`: native plugin response support TODO
- `src/renderer/components/InputBox/InputBox.tsx`: quoted image/file support TODO
- `src/renderer/stores/session/generation.ts`: image placeholder FIXME
- `src/renderer/packages/web-search/bing.ts`: TODO
- `src/renderer/packages/web-search/duckduckgo.ts`: TODO
- `src/renderer/storage/BaseStorage.ts`: import/export support TODO
- `src/shared/providers/definitions/models/openai.test.ts`: test migration TODO
- `src/shared/types/settings.ts`: provider info/settings split TODO

## What Else We Should Do During This Audit

### Product and UX

- create a platform capability matrix
- map each premium feature to a clear user-facing explanation of local vs hosted behavior
- decide whether Chatbox is positioning primarily as an AI client or an AI workspace, then adjust top-level messaging accordingly

### Architecture

- create ownership boundaries for session engine, KB, provider registry, remote services, and settings
- split the largest files into smaller modules with explicit public APIs
- write one ADR for storage, one for state management, and one for hosted-service boundaries

### Quality

- expand tests into KB, MCP, InputBox, session lifecycle, and Electron main-process behavior
- add a small set of happy-path cross-platform smoke tests
- validate image creator, KB, and provider settings flows as business-critical journeys

### Security / Trust

- run an Electron hardening review
- review URL handling and SVG rendering assumptions
- document what user content may leave the device in hybrid and premium flows

### Documentation

- keep an evergreen architecture overview
- add a glossary for session, thread, fork, copilot, provider, and KB concepts
- add a user-facing feature matrix by plan and platform

## Recommended Priorities

### Priority 1

- split `InputBox`, KB document management, and main-process IPC handlers
- define state ownership rules
- document local vs hosted feature boundaries

### Priority 2

- add deeper tests for KB, MCP, and session workflows
- publish feature parity by platform
- reduce ambiguity around product positioning and premium value

### Priority 3

- formalize module ownership
- turn subsystem docs into maintained onboarding docs
- create a repeatable quarterly architecture audit checklist
