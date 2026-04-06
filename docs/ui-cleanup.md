# UI Cleanup And Product UX Improvements

## Goal

The UI work in this fork is not cosmetic cleanup alone. It reshapes the product so a broader audience can use it as a workspace instead of a power-user chat shell with too many disconnected surfaces.

The main UX goals were:

- make the workspace feel organized
- reduce friction around starting work
- keep apps beside the conversation instead of breaking flow
- support more product surfaces without making the interface feel crowded

## Key Improvements

### Projects And Workspace Organization

- chats can be grouped into projects
- project creation is part of the sidebar workflow
- sessions can be moved into projects directly

Why it matters:

- the product feels closer to a workspace than a flat chat history
- it supports longer-running workstreams and multi-step assignments

### Cleaner Sidebar Behavior

- sidebar organization is more structured
- app-opening behavior can collapse the left rail when needed
- project grouping reduces clutter in long chat lists

Why it matters:

- the chat shell now supports both conversation management and app work without feeling overloaded

### Better Conversation Mode Entry

- conversation mode settings are surfaced more clearly
- preset modes are easier to understand and configure
- onboarding around these modes is less buried

Why it matters:

- users can understand the product's guided modes without hunting through settings

### Voice-Enabled Composer

- microphone input is integrated into the compose bar
- voice state is visible and easier to control
- language handling and failure messaging are more deliberate

Why it matters:

- the product becomes easier to use for faster capture, accessibility, and everyday workflows

### Responsive Composer And Layout

- narrow-layout composer behavior is more intentional
- compact-screen app behavior uses a right-side drawer instead of forcing a desktop panel pattern everywhere

Why it matters:

- the interface feels designed for the available space instead of merely shrinking

### Approved App Workspace

- a dedicated apps trigger makes the app layer discoverable
- the right-side app panel keeps the app in context with chat
- the panel is resizable on larger screens
- compact layouts switch to a drawer model
- embedded app routes are isolated so the main shell does not double-render inside app views

Why it matters:

- the product can support "chat plus tool" workflows without pushing users into disconnected screens

## Product Impact

The cleanup work improves the product in three ways:

### 1. Better first impression

The app feels more intentional, modern, and easier to understand.

### 2. Better workflow continuity

Projects, apps, and conversation controls now work together more naturally.

### 3. Better foundation for expansion

The UI now has room for:

- governed apps
- onboarding
- analytics
- trust review flows
- role-based experiences

without collapsing into a cluttered chat-only shell.

## Primary Implementation Areas

- `src/renderer/Sidebar.tsx`
- `src/renderer/hooks/useProjects.ts`
- `src/renderer/modals/CreateProject.tsx`
- `src/renderer/modals/MoveSessionToProject.tsx`
- `src/renderer/modals/SessionSettings.tsx`
- `src/renderer/components/InputBox/InputBox.tsx`
- `src/renderer/components/apps`
- `src/renderer/routes/index.tsx`

## UX Principles To Preserve

Future UI work should keep these principles:

- chat remains the anchor, but not the only surface
- apps should feel adjacent to chat, not detached from it
- new controls should reduce clicks or context switching, not add ornamental complexity
- product organization should favor projects, workflows, and outcomes over raw feature accumulation

## Recommended External Framing

When explaining the UI changes to users, the clearest summary is:

"We cleaned up the product by turning Chatbox into a more organized workspace: projects for chat organization, a simpler conversation setup flow, voice-enabled composing, and a governed app panel that keeps tools beside the conversation instead of sending you somewhere else."
