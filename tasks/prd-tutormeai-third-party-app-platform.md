# PRD: TutorMeAI Third-Party App Platform

## Document Metadata

- **Product Name:** TutorMeAI Third-Party App Platform
- **Document Status:** Draft v1
- **Owner:** Product Management
- **Date:** March 31, 2026

## 1. Executive Summary

TutorMeAI has built strong adoption in K-12 by offering a highly configurable AI chatbot that teachers can tailor to classroom needs. To maintain differentiation and expand product value, the platform must evolve from a configurable chatbot into a secure, extensible AI chat platform that can integrate and orchestrate third-party educational apps directly inside the chat experience.

The goal of this initiative is to enable students and teachers to access interactive tools such as chess, flashcards, quizzes, games, or authenticated external services without leaving the chat interface, while preserving conversation continuity, teacher control, platform safety, and system reliability. The platform must support app registration, tool discovery, structured tool invocation, embedded UI rendering, secure bidirectional communication, completion signaling, and state-aware follow-up by the chatbot.

This PRD defines the business need, product vision, user needs, scope, requirements, risks, success metrics, and launch plan for the TutorMeAI app platform.

## 2. Problem Statement

### Business Problem

TutorMeAI's competitive advantage has been chatbot configurability for teachers, but that advantage is increasingly copyable. To remain differentiated, the platform must deliver broader utility and deeper engagement than a standalone chatbot can offer.

### User Problem

Students and teachers currently rely on separate tools for activities like simulations, games, practice, or content exploration. Switching out of chat creates friction, breaks focus, and fragments context.

### Product Problem

The current product supports conversation, but not embedded experiences or tool orchestration. It cannot yet:

- host third-party apps inside chat
- discover app capabilities dynamically
- invoke app tools with structured parameters
- maintain awareness of app state across turns
- resume conversation naturally after app completion

### Engineering Problem

Third-party apps control their own UI and tool definitions, making the integration surface highly variable. The platform must support unknown app types while remaining secure, reliable, and simple for developers to integrate.

### Safety Problem

Because the product serves K-12 users, the platform must prevent harmful content, protect student data, limit app permissions, and ensure only approved apps can run in the ecosystem.

## 3. Product Vision

Create a production-quality AI chat platform where third-party educational applications can securely plug into the chat experience, render custom interfaces, communicate with the chatbot in real time, and preserve learning context across multi-turn interactions.

## 4. Goals

### Primary Goals

- Enable third-party apps to register tools and render UI inside the chat experience.
- Allow the chatbot to discover, invoke, and reason over third-party app capabilities.
- Preserve conversation continuity before, during, and after app interaction.
- Provide strong trust, safety, and security controls suitable for K-12.
- Support multiple app types, including internal, public external, and authenticated external apps.

### Secondary Goals

- Create a reusable integration framework for future apps.
- Reduce friction for students and teachers by keeping workflows in one interface.
- Provide developer documentation that makes third-party integration intuitive.
- Establish a cost model for AI usage at different levels of scale.

## 5. Non-Goals

This phase will not:

- build an open public app marketplace
- support arbitrary unreviewed third-party code execution
- optimize for every possible consumer use case outside education
- solve advanced monetization or revenue sharing for app partners
- build deep analytics or teacher reporting beyond core usage instrumentation

## 6. Target Users

### Primary Users

#### Students

Need seamless access to interactive learning tools without losing conversational support.

#### Teachers

Need control over what tools are available and confidence that integrated apps are safe, useful, and classroom appropriate.

### Secondary Users

#### Third-Party Developers

Need a clear contract for app registration, tool definitions, UI embedding, and secure communication.

#### Platform Administrators / School Stakeholders

Need confidence in privacy, safety, reliability, and controlled rollout.

## 7. User Needs

### Student Needs

- Start an activity directly from conversation
- Use an interactive tool without leaving chat
- Ask the chatbot questions during the activity
- Return to conversation with full context retained

### Teacher Needs

- Control which apps are available
- Trust app safety and appropriateness
- Ensure classroom interactions remain guided and productive

### Developer Needs

- Understand how to register an app
- Define tools in a standard schema
- Render custom UI safely
- Send results back to the platform in a predictable way

### Platform Needs

- Prevent broken or malicious app behavior
- Maintain app isolation
- Preserve performance and reliability
- Keep costs manageable at scale

## 8. Core Use Cases

### App Invocation

User asks chatbot to use a tool such as chess or flashcards. The chatbot identifies the appropriate app and initiates it.

### UI Rendering

App interface appears inside the chat experience.

### Mid-Interaction Assistance

User asks for help while interacting with the app. The chatbot reasons over current app state and responds.

### Completion Signaling

App signals task completion. The chatbot resumes normal conversation flow.

### Context Retention

User asks about the result after completion. The chatbot retains and references app outcome.

### Multi-App Conversations

User switches between different apps within the same thread.

### Authenticated App Flow

User is prompted to authorize an external app. The platform stores and refreshes tokens securely. The app can then be invoked on behalf of the user.

## 9. Product Requirements

### 9.1 Functional Requirements

#### A. Chat Platform

- The system must support real-time chat with streaming AI responses.
- The system must persist conversation history across sessions.
- The system must maintain context about active third-party apps and app state.
- The system must support multi-turn conversations spanning app interactions.
- The system must recover gracefully from tool or app failures.
- The platform must support user authentication.

#### B. Third-Party App Framework

- The platform must allow third-party apps to register themselves.
- The platform must allow apps to declare their capabilities and tool schemas.
- The chatbot must be able to discover available tools at runtime.
- The chatbot must invoke app tools with structured parameters.
- The platform must render app UI within the chat experience.
- Apps must be able to maintain their own independent state.
- Apps must be able to signal completion back to the chatbot.

#### C. Required App Support

- The platform must support at least three third-party apps.
- Chess is required.
- At least one app must require authentication.
- The selected apps should represent different complexity and integration patterns.

#### D. Authentication

- The platform must distinguish between platform authentication and per-app authentication.
- The platform must support external authenticated apps using OAuth2 or similar flows.
- Tokens must be stored securely.
- Refresh tokens must be managed automatically where needed.
- Users must be clearly informed when app authorization is required.

#### E. Context and State

- The platform must store app session state separately from chat history.
- The chatbot must receive the app context needed to respond accurately during and after app use.
- App state must persist across refreshes or reconnects where feasible.
- Switching between multiple apps in a single conversation must not corrupt context.

#### F. Trust and Safety

- The platform must verify that apps are appropriate for children before activation.
- The platform must prevent malicious apps from exposing data or harmful content.
- The system must restrict app permissions to only what is required.
- The system must isolate third-party UI from the parent platform.
- Teacher or admin controls must govern app availability.

#### G. Error Handling

- The system must handle app load failures gracefully.
- The system must handle timeouts and invalid tool calls.
- The chatbot must explain failures clearly and guide the user to retry or continue.
- The system must maintain chat stability even if an app crashes.

#### H. Developer Experience

- The platform must expose clear documentation for app registration and tool integration.
- The platform must define the app contract early and consistently.
- The platform should support local development and debugging flows for third-party developers.

## 10. Non-Functional Requirements

### Performance

- Responses should feel responsive for chat and tool invocation.
- Embedded apps should show loading states and progress indicators.
- The platform should minimize perceived latency during orchestration.

### Reliability

- Failures in third-party apps must not break the core chat experience.
- The system should support reconnection and recovery for interrupted sessions.

### Security

- App execution must be sandboxed.
- Credentials must be stored securely.
- Cross-app and app-to-platform data access must be tightly controlled.

### Scalability

- Architecture should support projected usage growth and multiple apps per user session.

### Maintainability

- API contracts must be clear and versionable.
- Plugin architecture should allow new apps without rewriting the platform core.

## 11. Assumptions

- TutorMeAI already has a working chatbot foundation.
- Teachers and districts will accept integrated apps if safety and control are strong.
- Third-party developers will need a simple and well-documented integration surface.
- A curated ecosystem is more appropriate than an open marketplace for the initial phase.
- Dynamic tool invocation is feasible using modern LLM function-calling patterns.

## 12. Constraints

- One-week sprint with defined checkpoints.
- Must build on top of a forked version of Chatbox.
- Must deliver at least three working apps.
- Must include auth for at least one third-party app.
- Must produce architecture documentation, demo video, deployed app, and AI cost analysis.

## 13. MVP Scope

### In Scope for MVP

- Real-time AI chat
- Persistent chat history
- Plugin/app registration contract
- Dynamic tool discovery and invocation
- Embedded app UI rendering
- Completion signaling
- Context retention across app interactions
- Three working apps including chess
- One authenticated app
- Core error handling
- Core trust and safety controls
- Setup guide and developer docs
- Initial AI cost analysis

### Out of Scope for MVP

- Open public app store
- Revenue sharing or billing for app developers
- Advanced moderation operations dashboard
- Sophisticated analytics suite for school admins
- Fully generalized low-code app builder for partners

## 14. Prioritization

### P0

- Chat works end to end
- Registration contract exists
- One app fully integrated vertically
- Tool invocation works
- Embedded UI works
- Completion signaling works
- Context retention works

### P1

- Three apps supported
- Authenticated app flow
- Graceful failure handling
- Safety checks and permission boundaries

### P2

- Enhanced developer documentation
- Better observability and monitoring
- Broader app-type support

This prioritization aligns with the build strategy in the case study, which recommends solving the plugin interface early and integrating one app fully before adding more.

## 15. User Stories

### Student

- As a student, I want to launch an educational tool from chat so I do not have to leave the conversation.
- As a student, I want the chatbot to understand what is happening in the app so it can help me during the activity.
- As a student, I want the chatbot to remember what happened after the app finishes.

### Teacher

- As a teacher, I want control over which apps are available so classroom use stays appropriate and aligned with learning goals.
- As a teacher, I want confidence that apps are safe and do not expose student data.

### Developer

- As a third-party developer, I want a clear app registration contract so I can integrate my tool without custom platform work.
- As a developer, I want predictable communication patterns and docs so I can test and debug easily.

### Platform Admin

- As a platform operator, I want app failures isolated so the core product remains stable.
- As a platform operator, I want visibility into tool success rates, failures, and app health.

## 16. Success Metrics

### Product Metrics

- Percentage of conversations with successful app invocation
- Percentage of app sessions completed successfully
- Percentage of conversations where chatbot retains correct app context
- User engagement per session
- Repeat usage of integrated apps
- Teacher enablement rate for approved apps

### Quality Metrics

- Tool routing accuracy
- Completion signaling success rate
- App UI render success rate
- App error rate
- Auth success rate for protected apps
- Context retention accuracy in follow-up turns

### Safety Metrics

- Number of blocked unsafe apps
- Number of app-level policy violations
- Student data exposure incidents
- Harmful content incident rate

### Reliability Metrics

- App timeout rate
- Chat recovery success after app failure
- Median app launch latency
- Median tool execution latency

### Cost Metrics

- Average LLM cost per conversation
- Average LLM cost per tool invocation
- Monthly cost projections at 100, 1K, 10K, and 100K users, as required by the case study

## 17. Risks and Tradeoffs

### Flexibility vs Safety

A highly flexible plugin model increases risk. A curated and contract-driven ecosystem is safer for K-12.

### Speed vs Extensibility

Shipping quickly may favor simpler integration methods, but the contract should still be designed for future scale.

### Richness vs Complexity

Allowing full app awareness and bidirectional state improves user value but increases orchestration complexity.

### Context Quality vs AI Cost

Injecting app schemas and app state into prompts improves assistant performance but increases token usage and cost.

### App Isolation vs UX Depth

Strong sandboxing improves security but may constrain richer app-to-chat coordination.

## 18. Launch Plan

### Phase 1: MVP / 24 Hours

- Pre-search document
- Case study analysis
- Technical architecture
- Basic chat foundation
- Initial contract design

### Phase 2: Early Submission / 4 Days

- Full plugin system
- One complete app flow
- Multi-app support
- Core context retention

### Phase 3: Final Submission / 7 Days

- Polished auth flows
- Full documentation
- Deployed app
- Cost analysis
- Final demo assets

## 19. Open Questions

- What level of teacher control is required at launch: district-wide, classroom-level, or both?
- Will apps be approved manually, or can there be automated app review workflows?
- What minimum metadata must an app provide to be considered safe and classroom-ready?
- How much app state should be passed back into the LLM by default?
- How long should app session state persist after the user leaves the conversation?
- What audit logging is required for school or district administrators?

## 20. Recommendation

The recommended product strategy is to build a contract-first, curated app platform inside TutorMeAI rather than an open plugin ecosystem. The MVP should prioritize one robust end-to-end integration first, then expand to at least three apps with different interaction patterns. Architecture decisions should optimize for safety, predictable state management, graceful recovery, and teacher control over maximum flexibility. This best fits the K-12 environment and the explicit case-study requirement that safety and security be built into the contract from the beginning.
