# Products

## Portfolio Summary

Chatbox is best understood as a product family rather than a single app.

| Surface | What it is | Evidence in repo | Primary user value |
| --- | --- | --- | --- |
| Desktop app | Electron application for macOS, Windows, Linux | `src/main`, `src/preload`, `electron-builder.yml`, `README.md` | Local-first AI workspace with native integrations |
| Web app | Browser build of the same renderer | `package.json` `build:web`, `serve:web`, `src/renderer`, `platform/web_platform.ts` | Anywhere access without installation |
| Mobile targets | Capacitor-based iOS and Android build/sync workflow | `package.json` mobile scripts, Capacitor dependencies, `CHATBOX_BUILD_TARGET` branches | On-the-go access and mobile-safe UX |
| Image creator | Dedicated image-generation workflow | `src/renderer/routes/image-creator/*` | Prompt-to-image generation and history |
| Knowledge-base workspace | RAG/document retrieval system | `src/main/knowledge-base/*`, `src/renderer/components/knowledge-base/*` | Retrieval over local and parsed documents |
| Team sharing helper | Sidecar proxy pattern for shared OpenAI access | `team-sharing/*` | Share one upstream API account without distributing raw keys |
| Cloud augmentation layer | Chatbox-hosted services for licensing, parsing, search, manifest, auth, web features | `src/renderer/packages/remote.ts` | Premium features, account/licensing, hosted helpers |

## Product Promise

The repo consistently points to one core promise:

- one workspace for many model providers
- local storage by default
- strong cross-platform reach
- richer context than a plain chat window
- optional hosted services when users want convenience or premium features

The README description, default settings, and route structure all support this framing.

## Functional Product Lines

### 1. Multi-model chat workspace

This is the center of gravity.

- New conversation flow lives at `/`
- Active conversations live at `/session/$sessionId`
- Session engine supports message submission, regeneration, forks, thread history, naming, export, and compaction

### 2. Context-enriched assistant workspace

Chatbox is opinionated about context, not just raw prompts.

- file attachments
- pasted long text as file
- link attachment and parsing
- knowledge-base selection
- web browsing toggle
- MCP tool usage

### 3. Visual generation workspace

Image creation has grown large enough to warrant its own route and history model.

- separate route: `/image-creator`
- dedicated storage and retry flows
- prompt, ratio, model, references, and history panel

### 4. Guided assistant marketplace

"Copilots" are effectively reusable prompt-packaged assistants.

- local copilots users can create, edit, star, and reuse
- remote featured copilots pulled from Chatbox services
- copilot selection is woven into the new-session journey

### 5. Admin and extension workspace

Settings are not just preferences; they are an operations surface.

- provider configuration
- default models
- document parser
- knowledge base
- web search
- MCP servers
- hotkeys
- chat behavior

## Commercial Boundary

The codebase shows a clear hybrid business model:

- open-source community edition repo
- optional Chatbox AI hosted service and license system
- cloud-assisted capabilities such as hosted search, login, manifest, upload URL generation, advanced link parsing, and remote config

This means the repo ships both:

- a local-first open app
- a client for Chatbox-operated services

That boundary matters because product expectations differ for each.

## Product Boundary Tension

The strongest tension in the repo is this:

- users may think they are using a fully local desktop app
- but several high-value features are cloud-assisted or license-gated

This is not inherently bad, but it should be documented and surfaced deliberately because it affects trust, support, and roadmap decisions.
