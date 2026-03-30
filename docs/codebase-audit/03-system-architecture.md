# System Architecture

## High-Level Shape

Chatbox uses a layered architecture:

- native shell and privileged operations in Electron main
- controlled browser bridge in preload
- most product logic in the React renderer
- cross-cutting types, models, and provider registry in `src/shared`
- optional remote services for licensing, parsing, model manifests, and hosted workflows

## Runtime Layers

### 1. Electron main process

Primary responsibilities:

- app/window lifecycle
- tray, deep links, updater, proxy, shortcuts
- file parsing and local privileged operations
- knowledge-base database and worker loop
- IPC handler registration

Key files:

- `src/main/main.ts`
- `src/main/menu.ts`
- `src/main/proxy.ts`
- `src/main/file-parser.ts`
- `src/main/knowledge-base/*`

### 2. Preload bridge

Primary responsibilities:

- expose a limited `electronAPI` surface to renderer
- relay window, theme, update, navigation, and MCP transport events

Key file:

- `src/preload/index.ts`

### 3. Renderer application

Primary responsibilities:

- routes and screens
- settings and product workflows
- session/message orchestration
- model execution and tool routing
- UI composition

Key files:

- `src/renderer/index.tsx`
- `src/renderer/router.tsx`
- `src/renderer/routes/*`
- `src/renderer/components/*`
- `src/renderer/stores/*`
- `src/renderer/packages/*`

### 4. Shared domain layer

Primary responsibilities:

- domain types and schemas
- defaults
- provider registry
- model abstractions
- request helpers

Key files:

- `src/shared/types.ts`
- `src/shared/types/session.ts`
- `src/shared/types/settings.ts`
- `src/shared/providers/*`
- `src/shared/models/*`

## Platform Abstraction

The renderer is designed to run in multiple environments through a platform adapter.

- `src/renderer/platform/index.ts` chooses test, desktop, or web implementation
- desktop uses Electron IPC plus IndexedDB/file split storage
- web uses IndexedDB and browser-native integrations
- mobile build conditions are present throughout the renderer, even though the platform chooser currently resolves desktop vs web/test

This is a strength because it keeps most product code in one place, but it also means feature parity must be managed carefully.

## State Architecture

The renderer uses several state systems at once:

- React Query for session and list caching
- Zustand for settings and UI stores
- Jotai for atomized UI/input/session helpers
- component-local React state for route-level and widget state
- platform storage and browser storage underneath

This is flexible, but it increases cognitive load. It is one of the biggest architecture costs in the repo.

## Session and Message Engine

The session engine is the core product subsystem.

Key behaviors:

- create and persist sessions
- merge default settings into session settings
- insert/update/remove messages
- generate assistant replies
- manage threads and branch/fork structures
- name sessions and threads
- export session history

Key files:

- `src/renderer/stores/chatStore.ts`
- `src/renderer/stores/session/crud.ts`
- `src/renderer/stores/session/messages.ts`
- `src/renderer/stores/session/generation.ts`
- `src/renderer/stores/session/threads.ts`
- `src/renderer/stores/session/forks.ts`
- `src/renderer/stores/session/naming.ts`

## Model Execution Pipeline

The chat pipeline works roughly like this:

1. InputBox gathers text, links, files, pictures, MCP/KB/web settings.
2. A user message is constructed and inserted into session state.
3. Session generation resolves provider/model configuration.
4. Context is built, possibly compacted, token-estimated, and enriched.
5. Tool sets are assembled from MCP, knowledge base, web search, and file readers.
6. Model streaming updates incrementally patch the assistant message in cache and persistent storage.

Important files:

- `src/renderer/components/InputBox/InputBox.tsx`
- `src/renderer/stores/session/messages.ts`
- `src/renderer/stores/session/generation.ts`
- `src/renderer/packages/model-calls/stream-text.ts`

## Provider Architecture

The provider layer is one of the cleaner parts of the design.

- each provider is registered via side-effect imports
- registry returns base info, default settings, and model factory behavior
- custom providers are supported through a separate path
- model capabilities drive UI and tool behavior

Important files:

- `src/shared/providers/index.ts`
- `src/shared/providers/registry.ts`
- `src/shared/providers/definitions/*`

## Storage Architecture

Storage is platform-aware.

| Platform | Settings/configs | Session data | Notes |
| --- | --- | --- | --- |
| Desktop | file storage via IPC | IndexedDB/localforage | Hybrid model for backupability and volume |
| Web | IndexedDB | IndexedDB | Browser-native async storage |
| Mobile | documented as SQLite-centric | platform-specific | Migration docs show multiple historical transitions |

Important files:

- `src/renderer/storage/*`
- `src/renderer/stores/migration.ts`
- `docs/storage.md`

## Knowledge Base Architecture

Knowledge base logic spans main and renderer.

- main owns DB, vector store, parsing, and worker loop
- renderer owns KB management UI and session attachment
- model calls get KB tools injected when active

Important files:

- `src/main/knowledge-base/index.ts`
- `src/main/knowledge-base/ipc-handlers.ts`
- `src/renderer/components/knowledge-base/*`
- `src/renderer/packages/model-calls/toolsets/knowledge-base.ts`

## MCP Architecture

MCP support is implemented as runtime tool injection.

- user config enables built-in or custom MCP servers
- controller manages lifecycle and status
- tools are normalized into model-call tool names
- stdio and HTTP transports are supported

Important files:

- `src/renderer/packages/mcp/controller.ts`
- `src/renderer/packages/mcp/builtin.ts`
- `src/main/mcp/ipc-stdio-transport.ts`

## Strengths

- clear separation between shared provider/model abstractions and renderer feature code
- good use of tool injection to unify KB, search, file, and MCP workflows
- practical platform abstraction
- thoughtful session feature depth for power users

## Architecture Liabilities

- very large "god files" in central UX paths
- multiple state paradigms increase debugging complexity
- cloud-assisted features are spread across the renderer with limited top-level boundary docs
- some web/mobile capability paths are partial or intentionally unsupported, which is not always visible from surface code alone
