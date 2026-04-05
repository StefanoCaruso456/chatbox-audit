# App Integration Matrix

This matrix turns the approved app catalog into an implementation plan. The source catalog lives in [approvedApps.ts](/Users/stefanocaruso/Desktop/Gauntlet/ChatBridge/chatbox-approved-app-runtime-fix/src/renderer/data/approvedApps.ts).

The key rule is simple: ChatBridge should host the app experience. That does not mean every app should load the vendor's public homepage in an iframe. The `integrationMode` below describes the real strategy behind each catalog entry.

## Integration Modes

| Mode | Meaning |
| --- | --- |
| `runtime` | ChatBridge-hosted runtime app with structured state, tool invocation, and completion signaling. |
| `partner-embed` | Vendor-approved embed, widget, or SDK can render inside ChatBridge. |
| `api-adapter` | ChatBridge owns the UI and talks to vendor APIs or OAuth flows. |
| `district-adapter` | School or district managed integration that depends on district launch URLs, LMS setup, SSO, or LTI-like configuration. |
| `browser-session` | Use a controlled browser session inside ChatBridge when the vendor blocks standard iframe embedding. |
| `native-replacement` | Build a focused ChatBridge-native experience for the learning workflow instead of embedding the vendor product. |

## Matrix

| App | Mode | Why |
| --- | --- | --- |
| Chess Tutor | `runtime` | Required app and already implemented as a ChatBridge runtime with a board, tools, and completion signaling. |
| Flashcards Coach | `runtime` | Good TutorMeAI-owned runtime pattern for stateful study flows. |
| Planner Connect | `runtime` | Authenticated TutorMeAI runtime that exercises app auth and persistent context. |
| Google Classroom | `api-adapter` | Best fit is a ChatBridge UI backed by Classroom APIs and add-on flows, not the public site. |
| ClassDojo | `browser-session` | Public app blocks standard embed and third-party API access is limited. |
| Canvas Student | `district-adapter` | Needs district-specific launch URLs and Canvas-managed auth; good LMS adapter candidate. |
| Seesaw | `district-adapter` | Better treated as a school-managed launch than a public iframe destination. |
| Schoology | `api-adapter` | Schoology exposes an API and resource app path, so a ChatBridge-owned adapter is realistic. |
| Khan Academy | `browser-session` | Best in-product option for the full site because the broad public API path is no longer available. |
| Khan Academy Kids | `native-replacement` | Better to recreate a narrow learning workflow than chase a mobile-first product embed. |
| IXL | `district-adapter` | Official LMS integration path is stronger than a raw public-site embed. |
| Prodigy Math | `district-adapter` | School integration path exists through classroom ecosystems; better than direct embed. |
| SplashLearn | `district-adapter` | Classroom integration path exists even though standard embed and LTI support are limited. |
| Desmos | `partner-embed` | One of the cleanest candidates because Desmos offers an official API and embed story. |
| Newsela | `district-adapter` | Better as a school-managed or LMS-linked integration than a generic iframe. |
| Epic! | `district-adapter` | Classroom-linked workflows are the strongest supported integration pattern. |
| Duolingo | `browser-session` | Public site blocks iframe embedding, so standard iframe is not viable. |
| ABCmouse | `browser-session` | Closed early-learning platform with weak direct embed path. |
| Kahoot! | `district-adapter` | School integration and LMS-linked flows are a better fit than the public marketing site. |
| Quizlet | `partner-embed` | Quizlet supports embedded study sets, making a partial partner embed practical. |
| Nearpod | `district-adapter` | Best integrated through LMS setup and school-managed launch flows. |
| Quizizz | `district-adapter` | LMS integration path is stronger than direct embedding. |
| Padlet | `partner-embed` | Strong candidate because Padlet supports both embeds and API-backed workflows. |
| Edpuzzle | `district-adapter` | Best connected through classroom and LMS integrations. |
| Pear Deck | `district-adapter` | Better treated as a classroom workflow adapter tied to slides and LMS systems. |
| Canva for Education | `browser-session` | Canva Apps SDK is for apps inside Canva, not Canva inside ChatBridge. |
| ScratchJr | `native-replacement` | Better to model the learning workflow directly in ChatBridge than embed the product site. |
| CodeSpark Academy | `browser-session` | Limited direct embed path; browser session is the most realistic in-product route. |

## Priority Build Order

1. Keep the existing `runtime` apps as the reference implementation: Chess Tutor, Flashcards Coach, Planner Connect.
2. Promote the best real integration candidates next: Desmos and Padlet.
3. Add one classroom platform adapter and one LMS adapter next: Google Classroom plus Canvas or Schoology.
4. Treat blocked consumer products as `browser-session` or `native-replacement`, not as standard iframe apps.

## Evidence Sources

- Google Classroom API: [developers.google.com/workspace/classroom/reference/rest](https://developers.google.com/workspace/classroom/reference/rest)
- Canvas API: [canvas.instructure.com/doc/api](https://canvas.instructure.com/doc/api/)
- Schoology API: [developers.schoology.com/api](https://developers.schoology.com/api/)
- Desmos API: [desmos.com/api/v1.6/docs](https://www.desmos.com/api/v1.6/docs/index.html)
- Padlet Public API: [padlet.help](https://padlet.help/l/en/article/3933026qoo-public-api)
- Nearpod LMS integrations: [nearpod.com/lms-integrations](https://nearpod.com/lms-integrations)
- SplashLearn integrations: [support.splashlearn.com](https://support.splashlearn.com/hc/en-us/articles/12274707283346-SplashLearn-Integrations-Compatibility-and-Access)
- Prodigy Google Classroom add-on: [prodigygame.zendesk.com](https://prodigygame.zendesk.com/hc/en-us/articles/26418988073876-Google-Classroom-Add-On)
- Quizlet set embeds: [help.quizlet.com](https://help.quizlet.com/hc/en-us/articles/360032935851-Embedding-sets)
- Edpuzzle Classroom integration: [support.edpuzzle.com](https://support.edpuzzle.com/hc/en-us/articles/10617629370765-Integrating-with-Google-Classroom)
- ClassDojo admin security overview: [static.classdojo.com PDF](https://static.classdojo.com/docs/ClassDojoAdminSecurityOverview.pdf)
- Khan Academy API removal notice: [support.khanacademy.org](https://support.khanacademy.org/hc/en-us/community/posts/360055082872-API-removal-notice)
- Canva Apps SDK quickstart: [canva.dev](https://www.canva.dev/docs/apps/quickstart/)

## Notes

- The public catalog wrappers under `/embedded-apps/catalog/:appId` can stay as the current launch surface.
- `integrationMode` describes what should happen inside that surface.
- `browser-session` still means the app is opened inside ChatBridge. It is not the same as "open in a new tab."
