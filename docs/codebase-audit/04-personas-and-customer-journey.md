# Personas and Customer Journey

## Likely Personas

These personas are inferred from README language, feature design, route structure, settings depth, and integration surfaces.

### 1. AI Power User

What they need:

- fast multi-model switching
- saved sessions and branches
- prompt reuse
- keyboard shortcuts
- local storage and export

Evidence:

- provider registry and favorites
- thread/fork/session features
- shortcuts and startup settings
- export and local persistence

### 2. Developer / Prompt Engineer

What they need:

- test prompts across providers
- inspect code/markdown/LaTeX/Mermaid output
- attach files and links
- use local models and custom providers
- use MCP or knowledge-base tools

Evidence:

- original README origin story about prompt/API debugging
- Markdown, Mermaid, artifact preview, file tools
- LM Studio, Ollama, OpenAI-compatible providers
- MCP, KB, token estimation, compaction

### 3. Researcher / Analyst

What they need:

- work across documents and web content
- maintain long-running context
- use retrieval and tool-enabled models
- save and revisit threads

Evidence:

- knowledge-base subsystem
- link parsing and web browsing
- long-context management and compaction
- thread history drawer

### 4. Team Admin / Technical Lead

What they need:

- safe sharing of upstream model credentials
- controllable provider setup
- installable desktop clients for a group
- optional hosted services

Evidence:

- `team-sharing/README.md`
- provider settings and remote license flows
- multi-platform installers

### 5. Casual Mobile / Everyday User

What they need:

- easy onboarding
- one default provider that "just works"
- good rendering and polished UI
- mobile-friendly usage

Evidence:

- Chatbox AI default settings
- welcome/setup flows
- mobile build scripts
- image creator and copilot discovery

## Customer Journey

## Phase 1: Discovery

User discovers Chatbox because they want:

- a better desktop AI client
- access to many models in one place
- privacy/local storage
- easier prompt workflow than raw provider dashboards

## Phase 2: Onboarding

The first meaningful moment is not account creation. It is provider readiness.

Typical onboarding path:

1. Install desktop app or open the web build.
2. Reach home screen.
3. Configure a provider or use Chatbox AI.
4. Optionally choose a copilot.
5. Send the first message and create the first real session.

Important product truth:

- the first-session experience is built around reducing setup friction
- the app defers true session creation until the first message is actually sent

## Phase 3: First Value

The user sees value when they can:

- ask a question
- switch models
- render rich output cleanly
- keep history locally

That is the basic "aha."

## Phase 4: Expansion

Power features extend the journey:

- attach files
- attach links
- enable web browsing
- enable knowledge base
- create copilots
- use image creator
- connect MCP servers

This is where Chatbox shifts from "client" to "workspace."

## Phase 5: Habit / Retention

Retention is driven by:

- persistent session memory
- multi-thread iteration
- title generation and organization
- saved copilots
- model favorites/defaults
- cross-platform availability

## Phase 6: Monetization / Admin Path

Some users then enter a monetized or admin journey:

- activate a Chatbox AI license
- use hosted parsing/search flows
- manage license instances
- use team sharing

## Journey Friction

The likely drop-off points are:

- provider setup complexity
- model capability confusion
- unclear local-vs-hosted feature boundary
- knowledge-base setup complexity
- advanced settings density

## What the Journey Says About the Product

Chatbox is optimized for a two-step adoption curve:

- simple enough to start as a general AI client
- deep enough to retain power users as an AI workspace

That is a strong product shape, but only if onboarding continues to hide the underlying complexity until the user is ready.
