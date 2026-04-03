# App Fix Task Board

This board turns each non-working app into an execution task. `Canvas Student` appeared twice in the original note, so it is tracked once here.

## Frozen Apps

These are working and should not be touched unless another change breaks them:

- `Desmos`
- `Padlet`
- `Quizlet`

## Runtime Apps

### Chess Tutor

| Field | Value |
| --- | --- |
| Integration method | `runtime` |
| Current problem | Sidebar runtime still renders washed out or blank instead of showing a usable board. |
| Shared dependency | `Runtime hardening` |
| Tasks | Audit iframe theme tokens and board CSS; make the board root fill the panel width and height; verify the runtime handshake hydrates board state on first paint; keep reload stable; add regression coverage for rendered board cells in the sidebar. |
| Done when | The board is visible, interactive, readable, and survives reload without dropping the current game state. |

### Flashcards Coach

| Field | Value |
| --- | --- |
| Integration method | `runtime` |
| Current problem | Runtime paints as a blank or washed-out shell instead of the flashcard workspace. |
| Shared dependency | `Runtime hardening` |
| Tasks | Fix panel styling and contrast; make the flashcard deck view render immediately after boot; ensure starter state appears without manual interaction; verify tool-driven updates change the visible study state; add runtime render tests. |
| Done when | The user sees the study surface and can move through a visible flashcard flow inside the panel. |

### Planner Connect

| Field | Value |
| --- | --- |
| Integration method | `runtime + auth` |
| Current problem | Runtime stays on a waiting state and does not transition into a real planner surface. |
| Shared dependency | `Runtime hardening` |
| Tasks | Separate unauthenticated state from broken render state; add a visible planner shell even before auth; persist auth status and planner session state; make reload preserve the planner status; add tests for waiting-auth and ready states. |
| Done when | The panel clearly shows planner state, handles auth cleanly, and transitions into a visible planner dashboard after authorization. |

## API Adapter Apps

### Google Classroom

| Field | Value |
| --- | --- |
| Integration method | `api-adapter` |
| Current problem | Generic governed workspace exists, but there is no real Classroom adapter experience yet. |
| Shared dependency | `API adapter shell` |
| Tasks | Build a Classroom adapter page with course and assignment shells; add auth state and token storage plan; wire real adapter sections for course list, assignment review, and launch prompts; add tool definitions for course/assignment actions; show connected vs disconnected state in-panel. |
| Done when | Google Classroom opens on a real ChatBridge-owned adapter page instead of a summary-only shell. |

### Schoology

| Field | Value |
| --- | --- |
| Integration method | `api-adapter / LTI` |
| Current problem | Workspace is still informational and not a real Schoology adapter. |
| Shared dependency | `API adapter shell` |
| Tasks | Build a Schoology adapter shell with course/resource sections; add auth and district/LTI guidance state; wire course/resource placeholders to the adapter UI; add tool contract stubs for class and assignment actions; document when to use API vs LTI launch. |
| Done when | The user lands in a Schoology-specific adapter workspace with real app sections and setup state. |

## District Adapter Apps

### Canvas Student

| Field | Value |
| --- | --- |
| Integration method | `district-adapter` |
| Current problem | It needs a district-specific launch path and still behaves like a configuration placeholder. |
| Shared dependency | `District launch shell` |
| Tasks | Build a Canvas launch workspace with district URL storage and validation; show school launch readiness state; add Canvas-specific setup checklist and connection panel; support reuse of the saved district launch target; add tests for configured vs unconfigured Canvas states. |
| Done when | Canvas opens on a real district-launch workspace with reusable district configuration and visible readiness state. |

### Seesaw

| Field | Value |
| --- | --- |
| Integration method | `district-adapter / LTI` |
| Current problem | Still only surfaces guidance, not a concrete Seesaw launch experience. |
| Shared dependency | `District launch shell` |
| Tasks | Add Seesaw-specific district launch storage; model school-managed connection state; render setup and launch readiness in the panel; add vendor-specific next actions instead of a generic summary block. |
| Done when | Seesaw presents a school-managed launch workspace with clear setup, saved launch data, and ready-state cues. |

### IXL

| Field | Value |
| --- | --- |
| Integration method | `district-adapter` |
| Current problem | Lacks a real school launch path in-product. |
| Shared dependency | `District launch shell` |
| Tasks | Add IXL launch target configuration and status; create IXL-specific panel copy and checklist; render launch readiness and class context shell; verify saved configuration survives reload. |
| Done when | IXL opens to a reusable district launch workspace instead of a generic placeholder. |

### Prodigy Math

| Field | Value |
| --- | --- |
| Integration method | `district-adapter` |
| Current problem | Still missing a Classroom or district-connected launch workflow in the product. |
| Shared dependency | `District launch shell` |
| Tasks | Add Prodigy-specific launch configuration; represent classroom-linked status in the panel; add setup prompts for school integration; support saved launch target reuse; add verification around configured launch state. |
| Done when | Prodigy Math behaves like a district-linked app shell with visible setup and launch state. |

### SplashLearn

| Field | Value |
| --- | --- |
| Integration method | `district-adapter` |
| Current problem | Current surface does not reflect the classroom-linked integration path. |
| Shared dependency | `District launch shell` |
| Tasks | Add SplashLearn-specific launch configuration and setup state; render classroom-linked guidance in the panel; persist configuration; move away from generic fallback messaging. |
| Done when | SplashLearn has a real school-linked workspace with reusable configuration and launch readiness. |

### Newsela

| Field | Value |
| --- | --- |
| Integration method | `district-adapter / LMS` |
| Current problem | No school-managed Newsela workspace yet. |
| Shared dependency | `District launch shell` |
| Tasks | Build Newsela-specific setup and launch surface; add saved entry point state; render article/classroom workflow shell; show LMS-linked setup status and next actions. |
| Done when | Newsela opens on a concrete LMS-connected workspace rather than a generic summary. |

### Epic!

| Field | Value |
| --- | --- |
| Integration method | `district-adapter` |
| Current problem | Classroom-linked flow is not represented as a real app experience yet. |
| Shared dependency | `District launch shell` |
| Tasks | Add Epic-specific classroom setup state; store launch target or school entry point; show reader/class workflow shell; replace placeholder copy with real setup and launch actions. |
| Done when | Epic! has a classroom-oriented launch workspace with saved configuration and visible reader workflow state. |

### Kahoot!

| Field | Value |
| --- | --- |
| Integration method | `district-adapter / LTI` |
| Current problem | Product still lacks a real school-linked Kahoot workspace. |
| Shared dependency | `District launch shell` |
| Tasks | Add Kahoot-specific school setup surface; store school launch entry point; render quiz-session shell and readiness state; document LTI-linked expectations in-product. |
| Done when | Kahoot! behaves like a school-managed app shell with saved launch and active readiness feedback. |

### Quizizz

| Field | Value |
| --- | --- |
| Integration method | `district-adapter` |
| Current problem | The LMS-linked Quizizz path is not represented as a real workspace yet. |
| Shared dependency | `District launch shell` |
| Tasks | Add Quizizz launch storage and validation; render quiz-session and school setup shell; persist the district-linked target; replace generic guidance with app-specific setup and readiness state. |
| Done when | Quizizz opens on a real district-linked workspace with saved launch data and visible session readiness. |

### Edpuzzle

| Field | Value |
| --- | --- |
| Integration method | `district-adapter` |
| Current problem | No classroom-linked adapter shell exists yet. |
| Shared dependency | `District launch shell` |
| Tasks | Add Edpuzzle launch configuration; render assignment/video workflow shell; persist school launch target; show setup vs ready states with concrete next actions. |
| Done when | Edpuzzle opens into a reusable classroom-linked workspace instead of generic setup copy. |

### Pear Deck

| Field | Value |
| --- | --- |
| Integration method | `district-adapter` |
| Current problem | Slides-linked classroom flow is not modeled in the current panel. |
| Shared dependency | `District launch shell` |
| Tasks | Build Pear Deck-specific setup shell; store school or slides-linked launch configuration; show presentation workflow state; replace placeholder workspace messaging. |
| Done when | Pear Deck has a concrete district-linked workspace with reusable setup and presentation readiness state. |

### Nearpod

| Field | Value |
| --- | --- |
| Integration method | `district-adapter` |
| Current problem | LMS-connected launch path is not implemented as a real workspace yet. |
| Shared dependency | `District launch shell` |
| Tasks | Add Nearpod-specific launch storage and validation; render lesson-session shell; show LMS-linked setup status; keep the workspace reusable after reload. |
| Done when | Nearpod lands on a real school-managed workspace with visible setup and lesson-session state. |

## Browser-Session Apps

### ClassDojo

| Field | Value |
| --- | --- |
| Integration method | `browser-session` |
| Current problem | Public embed path is blocked and there is no governed browser-session runtime yet. |
| Shared dependency | `Browser-session shell` |
| Tasks | Build the governed browser-session transport; add ClassDojo launch target state; show session connection status and fallback actions; keep the user inside ChatBridge rather than a dead iframe. |
| Done when | ClassDojo opens on a live governed browser-session surface inside the product. |

### Khan Academy

| Field | Value |
| --- | --- |
| Integration method | `browser-session` |
| Current problem | It currently falls back to a summary shell because the browser-session transport is incomplete. |
| Shared dependency | `Browser-session shell` |
| Tasks | Add live browser-session transport support; keep saved launch target handling; render real session state before fallback messaging; handle vendor cookies or redirects cleanly. |
| Done when | Khan Academy opens on a live governed browser-session surface instead of a summary-first panel. |

### Duolingo

| Field | Value |
| --- | --- |
| Integration method | `browser-session` |
| Current problem | Vendor blocks normal iframe embedding and the governed session flow is not done yet. |
| Shared dependency | `Browser-session shell` |
| Tasks | Add Duolingo browser-session launch state; show active session status and fallback actions; keep launch inside ChatBridge; replace blocked iframe dead ends with governed session behavior. |
| Done when | Duolingo uses the in-product browser-session surface instead of failing on public iframe restrictions. |

### ABCmouse

| Field | Value |
| --- | --- |
| Integration method | `browser-session` |
| Current problem | No real in-product transport exists for this blocked vendor path. |
| Shared dependency | `Browser-session shell` |
| Tasks | Add ABCmouse launch state, session connection view, and reusable saved target handling; show clear session readiness and fallback actions. |
| Done when | ABCmouse opens through the governed browser-session surface with visible session state. |

### Canva for Education

| Field | Value |
| --- | --- |
| Integration method | `browser-session / narrow adapter` |
| Current problem | Public Canva is not a standard ChatBridge embed target and the in-product transport is not ready yet. |
| Shared dependency | `Browser-session shell` |
| Tasks | Decide whether this stays browser-session or narrows into a smaller adapter flow; add governed browser-session path first; show launch target state and fallback actions in-panel. |
| Done when | Canva for Education opens in a reliable in-product session surface, with a clear note if a later narrow adapter will replace it. |

### CodeSpark Academy

| Field | Value |
| --- | --- |
| Integration method | `browser-session` |
| Current problem | Still missing the governed in-product browser path. |
| Shared dependency | `Browser-session shell` |
| Tasks | Add CodeSpark-specific launch target handling; render live session state; preserve session guidance after reload; avoid summary-only fallback as the primary experience. |
| Done when | CodeSpark Academy uses a real governed browser-session surface inside ChatBridge. |

## Native Replacement App

### Khan Academy Kids

| Field | Value |
| --- | --- |
| Integration method | `native-replacement` |
| Current problem | The original product is not a practical ChatBridge embed target and there is no narrow replacement flow yet. |
| Shared dependency | `Native replacement shell` |
| Tasks | Define the minimum early-learning workflow to recreate; build a focused lesson/activity shell; add app state and completion summary support; keep the experience simple and child-friendly. |
| Done when | Khan Academy Kids has a usable ChatBridge-native early-learning workflow that stays inside the product. |

### ScratchJr

| Field | Value |
| --- | --- |
| Integration method | `native-replacement` |
| Current problem | The vendor product is not the right embed target, and there is no focused replacement flow yet. |
| Shared dependency | `Native replacement shell` |
| Tasks | Define the minimum coding workflow to recreate; build a ScratchJr-style native lesson shell; add project state, prompts, and completion summary; make it feel like an app, not a placeholder. |
| Done when | ScratchJr has a usable ChatBridge-native coding workflow that stays inside the product. |

## Suggested Execution Queue

1. `Chess Tutor`
2. `Flashcards Coach`
3. `Planner Connect`
4. `Google Classroom`
5. `Canvas Student`
6. `Schoology`
7. `Seesaw`
8. `IXL`
9. `Prodigy Math`
10. `SplashLearn`
11. `Newsela`
12. `Epic!`
13. `Kahoot!`
14. `Quizizz`
15. `Edpuzzle`
16. `Pear Deck`
17. `Nearpod`
18. `ClassDojo`
19. `Khan Academy`
20. `Duolingo`
21. `ABCmouse`
22. `Canva for Education`
23. `CodeSpark Academy`
24. `Khan Academy Kids`
25. `ScratchJr`
