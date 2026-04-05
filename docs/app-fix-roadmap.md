# App Fix Roadmap

This roadmap turns the current approved-app catalog into an execution order we can actually ship. It assumes these apps are already in a good state and should stay frozen unless a regression appears:

- `Desmos`
- `Padlet`
- `Quizlet`

Everything else should be fixed one by one using the correct integration method, not forced through a generic iframe.

## Objective

For every non-working app:

1. Open it inside the ChatBridge surface.
2. Use the right integration pattern for that app.
3. Keep chat context and app state connected.
4. Avoid dead-end placeholders and blocked vendor pages wherever a better path exists.

## Integration Lanes

| Lane | Method | Applies To |
| --- | --- | --- |
| `Runtime` | TutorMeAI-owned embedded runtime with postMessage bridge | Chess Tutor, Flashcards Coach, Planner Connect |
| `API Adapter` | ChatBridge-owned UI backed by vendor APIs and auth | Google Classroom, Schoology |
| `District Adapter` | District URL, LMS, LTI, or school-managed launch workflow | Canvas Student, Seesaw, IXL, Prodigy Math, SplashLearn, Newsela, Epic!, Kahoot!, Edpuzzle, Pear Deck, Nearpod |
| `Browser Session` | Governed in-product browser transport for vendors that block normal iframe use | ClassDojo, Khan Academy, Duolingo, ABCmouse, Canva for Education, CodeSpark Academy |
| `Native Replacement` | ChatBridge-native focused replacement experience | ScratchJr |

## Shared Platform Work

Before the app-specific rollout, we need four shared seams in place:

| Shared Track | Why It Exists | Apps Unblocked |
| --- | --- | --- |
| `Runtime hardening` | Fix blank render, theme contrast, and handshake reliability in the TutorMeAI runtime shell | Chess Tutor, Flashcards Coach, Planner Connect |
| `API adapter shell` | Reusable adapter UI, auth state, tool handoff, and completion pattern | Google Classroom, Schoology |
| `District launch shell` | Reusable district URL storage, launch validation, LMS/LTI guidance, and panel state | Canvas Student, Seesaw, IXL, Prodigy Math, SplashLearn, Newsela, Epic!, Kahoot!, Edpuzzle, Pear Deck, Nearpod |
| `Browser-session shell` | Reusable in-product browser transport with session state and graceful vendor fallback | ClassDojo, Khan Academy, Duolingo, ABCmouse, Canva for Education, CodeSpark Academy |

## Phase Order

### Phase 0: Freeze Working Apps

- Do not touch `Desmos`, `Padlet`, or `Quizlet`.
- Only revisit them if another change causes a regression.

### Phase 1: Repair TutorMeAI Runtime Apps

Apps:

- `Chess Tutor`
- `Flashcards Coach`
- `Planner Connect`

Goal:

- make the current runtime apps visually render, boot reliably, and return real app state inside the sidebar

Exit criteria:

- runtime apps no longer paint as blank or washed out
- runtime state appears inside the panel on first load
- reload does not lose the runtime session unexpectedly
- app completion still returns context to chat

### Phase 2: Build the First Adapter Layer

Apps:

- `Google Classroom`
- `Schoology`
- `Canvas Student`

Goal:

- prove the first real `API Adapter` and `District Adapter` flows with one classroom app and one LMS app

Exit criteria:

- each app opens on a purpose-built in-product workspace
- auth/setup state is clearly represented
- there is a concrete launch path beyond a generic summary card

### Phase 3: Roll Out the District Adapter Pattern

Apps:

- `Seesaw`
- `IXL`
- `Prodigy Math`
- `SplashLearn`
- `Newsela`
- `Epic!`
- `Kahoot!`
- `Quizizz`
- `Edpuzzle`
- `Pear Deck`
- `Nearpod`

Goal:

- reuse the district-launch shell across the remaining school-managed apps

Exit criteria:

- each app has district-specific setup guidance
- each app can store and reuse a launch entry point or configuration
- each app panel explains the real school-managed integration path instead of showing a dead-end iframe

### Phase 4: Roll Out the Browser-Session Pattern

Apps:

- `ClassDojo`
- `Khan Academy`
- `Duolingo`
- `ABCmouse`
- `Canva for Education`
- `CodeSpark Academy`

Goal:

- keep blocked vendors inside the product through the governed browser-session experience

Exit criteria:

- the app opens on a live governed browser surface
- session state is visible in the panel
- the user sees a concrete in-product flow instead of a blocked public iframe

### Phase 5: Ship the Native Replacement

Apps:

- `Khan Academy Kids`
- `ScratchJr`

Goal:

- replace the blocked or unsuitable vendor surface with a focused ChatBridge-native experience

Exit criteria:

- the user can complete the core learning workflow inside ChatBridge
- the app still behaves like an app with state, prompts, and completion signaling

## Recommended Execution Order

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

## Definition Of Done

An app counts as fixed only when all of these are true:

1. It opens inside ChatBridge without collapsing into a generic placeholder-first experience.
2. It uses the right integration method for that vendor.
3. The panel shows real app state, real setup state, or a real governed session.
4. The user has a valid next action instead of a blocked iframe dead end.
5. The chat can still talk about the app and keep context around it.
