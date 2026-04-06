# Features

## Core Workspace

- Multi-provider chat conversations
- New session flow with temporary state before persistence
- Session list, session switching, session reordering, and startup-page behavior
- Thread history within a session
- Message fork creation, switching, expansion, and deletion
- Regenerate and generate-more flows
- Auto-generated session and thread titles
- Export chat in multiple scopes and formats

Relevant code:

- `src/renderer/routes/index.tsx`
- `src/renderer/routes/session/$sessionId.tsx`
- `src/renderer/stores/chatStore.ts`
- `src/renderer/stores/session/*`

## Model and Provider Orchestration

- 17 built-in provider definitions
- custom provider support
- provider registry architecture
- per-provider model metadata and capabilities
- provider-specific settings and API styles
- favorite models
- default chat, thread-naming, search-term, and OCR models

Built-in providers present in the repo:

- Chatbox AI
- OpenAI
- OpenAI Responses
- Azure OpenAI
- Claude
- Gemini
- DeepSeek
- Groq
- LM Studio
- Mistral AI
- Ollama
- OpenRouter
- Perplexity
- SiliconFlow
- VolcEngine
- xAI
- ChatGLM6B

Relevant code:

- `src/shared/providers/*`
- `src/shared/types/provider.ts`
- `src/renderer/hooks/useProviders.ts`

## Context and Attachment Features

- drag-and-drop file upload
- pasted-image handling
- pasted long text as a file
- link attachment and preprocessing
- file preprocessing state and preview
- image OCR fallback for non-vision models
- token estimation for messages and attachments
- context compaction and summary points

Relevant code:

- `src/renderer/components/InputBox/InputBox.tsx`
- `src/renderer/packages/context-management/*`
- `src/renderer/packages/token-estimation/*`
- `src/renderer/packages/model-calls/stream-text.ts`

## Knowledge Base / RAG

- create knowledge bases
- assign embedding, rerank, and optional vision models
- choose provider mode
- choose document parser mode
- upload and process files
- background chunking/indexing
- search, read chunks, inspect file metadata
- attach a knowledge base to a session

Relevant code:

- `src/main/knowledge-base/*`
- `src/renderer/components/knowledge-base/*`
- `src/renderer/packages/model-calls/toolsets/knowledge-base.ts`
- `docs/rag.md`

## Web Search and Browsing

- session-level web browsing toggle
- built-in search provider
- Bing and Bing News option
- Tavily option
- hosted link parsing for premium flows
- fallback prompt-engineering search path when models do not support tool use

Relevant code:

- `src/renderer/packages/web-search/*`
- `src/renderer/packages/model-calls/toolsets/web-search.ts`
- `src/renderer/stores/session/generation.ts`

## MCP and Tool Use

- configurable MCP servers
- built-in MCP servers
- stdio and HTTP transports
- runtime tool injection into model calls
- server status monitoring in UI

Built-in MCP servers called out in the repo:

- Fetch
- Sequential Thinking
- EdgeOne Pages
- arXiv
- Context7

Relevant code:

- `src/renderer/packages/mcp/*`
- `src/main/mcp/*`
- `src/renderer/hooks/mcp.ts`

## Image Creation

- dedicated image-creator route
- model selection
- aspect ratio selection
- reference-image upload
- generation history
- retry flow
- dedicated storage and records

Relevant code:

- `src/renderer/routes/image-creator/*`
- `src/renderer/stores/imageGeneration*`
- `src/renderer/components/ImageModelSelect.tsx`

## Copilots

- create, edit, delete, star, and reuse personal copilots
- browse remote featured copilots
- inject a copilot into the new-session flow

Relevant code:

- `src/renderer/routes/copilots.tsx`
- `src/renderer/hooks/useCopilots.ts`
- `src/renderer/packages/remote.ts`

## Rendering and Response Experience

- Markdown rendering
- LaTeX rendering
- Mermaid rendering
- code highlighting
- artifact and SVG preview
- image preview
- optional auto-preview artifacts
- optional code-block collapse

Relevant code:

- `src/renderer/components/Markdown.tsx`
- `src/renderer/components/Mermaid.tsx`
- `src/renderer/packages/latex.ts`

## Settings and Operations

- general settings
- provider settings
- chat settings
- hotkeys
- document parser
- web search
- default models
- knowledge base
- MCP configuration
- logging export/clear
- proxy
- auto launch
- auto update and beta update

Relevant code:

- `src/renderer/routes/settings/*`
- `src/renderer/stores/settingsStore.ts`

## Cross-platform and Localization

- desktop packaging for macOS, Windows, Linux
- web build
- mobile sync/open scripts
- 14 locale folders
- platform abstraction for storage, navigation, logging, knowledge base, and export

Relevant code:

- `src/renderer/platform/*`
- `electron-builder.yml`
- `electron.vite.config.ts`
- `src/renderer/i18n/locales/*`

## Support and Trust Features

- error boundaries
- global error handlers
- Sentry adapters
- analytics/tracking toggles
- FAQ and support links

Relevant code:

- `docs/engineering/error-handling.md`
- `src/renderer/setup/global_error_handler.ts`
- `src/main/adapters/sentry.ts`
- `src/renderer/adapters/sentry.ts`
