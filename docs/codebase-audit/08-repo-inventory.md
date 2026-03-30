# Repo Inventory

## Audit Snapshot

- Total tracked files observed: 698
- `src/` files: 585
- TS/TSX lines in `src/`: 74,429
- Route files under `src/renderer/routes`: 42
- Built-in provider definition files: 17
- Locale directories: 14
- Test files under `src/`: 28
- Integration test TypeScript files under `test/integration/`: 8

## Top-Level File Counts

| Area | File count |
| --- | ---: |
| `src` | 585 |
| `.erb` | 29 |
| `assets` | 26 |
| `doc` | 21 |
| `test` | 14 |
| `docs` | 9 |
| `.github` | 8 |
| `icons` | 7 |
| `team-sharing` | 7 |
| `resources` | 5 |
| `tasks` | 4 |

## Extension Counts

| Extension | Count |
| --- | ---: |
| `.ts` | 337 |
| `.tsx` | 181 |
| `.png` | 103 |
| `.md` | 27 |
| `.json` | 20 |
| no extension | 12 |
| `.js` | 11 |
| `.webp` | 9 |
| `.cjs` | 6 |

## Major Source Areas

### `src/main`

Main-process responsibilities:

- app lifecycle and window
- shortcuts, tray, updater, proxy, deep links
- file parsing
- knowledge base DB and workers
- MCP stdio transport

### `src/preload`

- Electron-to-renderer bridge

### `src/renderer`

Largest and most product-critical area.

Notable subareas:

- `components`
- `routes`
- `stores`
- `packages`
- `platform`
- `hooks`
- `i18n`

### `src/shared`

- types and schemas
- defaults
- providers
- model abstractions
- shared request helpers

## Route Surface

Primary route families:

- root
- session
- settings
- image creator
- copilots
- about
- developer utility routes

This suggests a product that is more application-like than chat-widget-like.

## Provider Inventory

Built-in provider definitions in the repo:

- `azure.ts`
- `chatboxai.ts`
- `chatglm.ts`
- `claude.ts`
- `deepseek.ts`
- `gemini.ts`
- `groq.ts`
- `lmstudio.ts`
- `mistral-ai.ts`
- `ollama.ts`
- `openai-responses.ts`
- `openai.ts`
- `openrouter.ts`
- `perplexity.ts`
- `siliconflow.ts`
- `volcengine.ts`
- `xai.ts`

## Locale Inventory

Locale folders present:

- `ar`
- `de`
- `en`
- `es`
- `fr`
- `it-IT`
- `ja`
- `ko`
- `nb-NO`
- `pt-PT`
- `ru`
- `sv`
- `zh-Hans`
- `zh-Hant`

## Test Inventory

Unit and package tests are strongest in:

- provider/model code
- context management
- token estimation
- migration/storage
- provider config parsing
- message utilities

Integration coverage exists for:

- context management
- file conversation
- model provider flows

## Existing Internal Docs

The repo already contains focused docs for:

- adding providers
- dependency reorg
- new session mechanism
- RAG
- session module split plan
- storage architecture
- testing strategy
- token estimation

This is a sign of active internal engineering documentation, even though a top-level architecture overview was missing before this audit.

## Hotspot Files

Largest executable modules observed:

- `src/renderer/components/InputBox/InputBox.tsx`
- `src/renderer/components/knowledge-base/KnowledgeBaseDocuments.tsx`
- `src/main/knowledge-base/ipc-handlers.ts`
- `src/renderer/routes/settings/provider/$providerId.tsx`
- `src/renderer/packages/remote.ts`
- `src/renderer/stores/migration.ts`
- `src/main/main.ts`
- `src/renderer/components/chat/Message.tsx`
- `src/renderer/stores/sessionHelpers.ts`
- `src/renderer/modals/SessionSettings.tsx`

## Inventory Takeaway

This is not a small or narrowly scoped codebase anymore.
It is a medium-sized application platform with:

- a desktop shell
- a shared renderer for multiple targets
- a provider registry
- a retrieval subsystem
- a tool-use subsystem
- a sizable settings/admin surface
- meaningful product-specific workflow depth
