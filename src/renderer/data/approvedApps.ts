import {
  exampleChessLaunchToolSchema,
  exampleFlashcardsStartToolSchema,
  examplePlannerDashboardToolSchema,
} from '@shared/contracts/v1'
import type { ApprovedApp } from '@/types/apps'

const DEFAULT_MODE_CAPABILITIES = {
  runtime: ['Structured tool bridge', 'Conversation-aware state', 'Completion signals back to chat'],
  'partner-embed': ['Approved in-app embed', 'Manual launch URL support', 'Teacher-friendly panel preview'],
  'api-adapter': ['ChatBridge-owned UI shell', 'Structured tool calls', 'API-backed state and context retention'],
  'district-adapter': ['District launch support', 'School-managed auth path', 'K-12 workflow shell inside ChatBridge'],
  'browser-session': ['Governed browser-session shell', 'In-product vendor launch target', 'Policy-aware fallback surface'],
  'native-replacement': ['ChatBridge-native workflow shell', 'Focused learning flow', 'Conversation-aware replacement UX'],
} as const

const APP_WORKSPACE_OVERRIDES: Record<string, Partial<NonNullable<ApprovedApp['integrationConfig']>>> = {
  'google-classroom': {
    helpUrl: 'https://developers.google.com/workspace/classroom/reference/rest',
    helpLabel: 'Google Classroom API docs',
    authModel: 'oauth',
    capabilities: ['Classroom course context', 'Assignments and announcements shell', 'Chat-guided workflow handoff'],
    samplePrompts: [
      'Open Google Classroom and summarize what I need to review.',
      'Show me the class workflow shell for Google Classroom.',
      'Help me plan a ChatBridge adapter for Classroom assignments.',
    ],
  },
  classdojo: {
    helpUrl: 'https://www.classdojo.com/',
    helpLabel: 'ClassDojo product site',
    authModel: 'vendor-session',
    statusNote: 'ClassDojo does not expose a friendly third-party API path, so this stays on the governed browser-session track.',
  },
  'canvas-student': {
    authModel: 'district-sso',
    capabilities: ['District launch URL save', 'Sidebar launch workspace', 'Canvas-specific LMS guidance'],
    samplePrompts: [
      'Open our Canvas district workspace and show the launch checklist.',
      'What Canvas launch URL do I need to configure for this school?',
      'Keep Canvas beside chat and walk me through the LMS setup.',
    ],
  },
  seesaw: {
    helpUrl: 'https://web.seesaw.me/',
    helpLabel: 'Seesaw product site',
    authModel: 'district-sso',
  },
  schoology: {
    helpUrl: 'https://developers.schoology.com/api',
    helpLabel: 'Schoology API docs',
    authModel: 'oauth',
  },
  'khan-academy': {
    helpUrl: 'https://support.khanacademy.org/hc/en-us/community/posts/360055082872-API-removal-notice',
    helpLabel: 'Khan Academy API notice',
    authModel: 'vendor-session',
  },
  'khan-academy-kids': {
    authModel: 'native',
  },
  ixl: {
    helpUrl: 'https://www.ixl.com/',
    helpLabel: 'IXL product site',
    authModel: 'district-sso',
  },
  'prodigy-math': {
    helpUrl: 'https://prodigygame.zendesk.com/hc/en-us/articles/26418988073876-Google-Classroom-Add-On',
    helpLabel: 'Prodigy Classroom add-on',
    authModel: 'district-sso',
  },
  splashlearn: {
    helpUrl: 'https://support.splashlearn.com/hc/en-us/articles/12274707283346-Enhancing-platform-compatibility-SplashLearn-integration',
    helpLabel: 'SplashLearn integration guide',
    authModel: 'district-sso',
  },
  desmos: {
    capabilities: ['Live calculator preview', 'Official partner embed path', 'Math workflow shell inside ChatBridge'],
    samplePrompts: [
      'Open Desmos in the app panel and keep the calculator beside chat.',
      'Launch the Desmos workspace and help me reason through this graph.',
      'Keep Desmos open while we work through a function problem.',
    ],
  },
  newsela: {
    helpUrl: 'https://newsela.com/',
    helpLabel: 'Newsela product site',
    authModel: 'district-sso',
  },
  epic: {
    helpUrl: 'https://www.getepic.com/',
    helpLabel: 'Epic product site',
    authModel: 'district-sso',
  },
  duolingo: {
    authModel: 'vendor-session',
    samplePrompts: [
      'Open the Duolingo browser-session workspace inside ChatBridge.',
      'Keep the Duolingo shell open and explain why the vendor iframe is blocked.',
      'Show me the governed browser-session plan for Duolingo.',
    ],
  },
  abcmouse: {
    authModel: 'vendor-session',
  },
  kahoot: {
    helpUrl: 'https://kahoot.com/schools-u/',
    helpLabel: 'Kahoot for schools',
    authModel: 'district-sso',
  },
  quizlet: {
    capabilities: ['Saved set/embed URL', 'Partner embed workspace', 'Study flow kept beside chat'],
    samplePrompts: [
      'Open a Quizlet set beside chat.',
      'Launch the Quizlet embed workspace for this study set.',
      'Keep Quizlet open while we review key terms.',
    ],
  },
  nearpod: {
    helpUrl: 'https://nearpod.com/lms-integrations',
    helpLabel: 'Nearpod LMS integrations',
    authModel: 'district-sso',
  },
  quizizz: {
    helpUrl: 'https://support.quizizz.com/hc/en-us/articles/37222826330265-All-LMS-Platforms-You-Can-Integrate-With-Quizizz',
    helpLabel: 'Quizizz LMS integrations',
    authModel: 'district-sso',
  },
  padlet: {
    capabilities: ['Saved Padlet board URL', 'Partner embed preview', 'Collaboration shell inside ChatBridge'],
    samplePrompts: [
      'Open our Padlet board inside ChatBridge.',
      'Keep the Padlet collaboration space beside chat.',
      'Launch Padlet and help me summarize what the group posted.',
    ],
  },
  edpuzzle: {
    helpUrl: 'https://support.edpuzzle.com/hc/en-us/articles/10617629370765-Integrating-with-Google-Classroom',
    helpLabel: 'Edpuzzle Classroom integration',
    authModel: 'district-sso',
  },
  'pear-deck': {
    helpUrl: 'https://www.peardeck.com/googleslides-addon',
    helpLabel: 'Pear Deck for Google Slides',
    authModel: 'district-sso',
  },
  'canva-for-education': {
    helpUrl: 'https://www.canva.dev/docs/apps/quickstart/',
    helpLabel: 'Canva apps docs',
    authModel: 'vendor-session',
  },
  scratchjr: {
    authModel: 'native',
    samplePrompts: [
      'Open the ScratchJr replacement workspace inside ChatBridge.',
      'Show me the native coding-workflow plan for ScratchJr.',
      'Help me design a ChatBridge-native ScratchJr style lesson flow.',
    ],
  },
  'codespark-academy': {
    authModel: 'vendor-session',
  },
}

function defaultAuthModelForMode(app: ApprovedApp): NonNullable<ApprovedApp['integrationConfig']>['authModel'] {
  switch (app.integrationMode) {
    case 'runtime':
    case 'partner-embed':
      return 'none'
    case 'api-adapter':
      return 'oauth'
    case 'district-adapter':
      return 'district-sso'
    case 'browser-session':
      return 'vendor-session'
    case 'native-replacement':
      return 'native'
  }
}

function buildDefaultSetupChecklist(app: ApprovedApp) {
  switch (app.integrationMode) {
    case 'partner-embed':
      return [
        `Confirm the approved ${app.name} embed or public share URL.`,
        'Save the launch target inside ChatBridge.',
        'Verify the app preview renders cleanly beside chat.',
      ]
    case 'api-adapter':
      return [
        `Define the ChatBridge-owned ${app.name} adapter UI shell.`,
        'Connect the required API or OAuth path on the backend.',
        'Map the app workflow into structured tool calls and chat context.',
      ]
    case 'district-adapter':
      return [
        `Collect the school-specific ${app.name} launch URL or district entry point.`,
        'Confirm the LMS or SSO flow expected by the district.',
        'Save the launch target and validate the in-app panel experience.',
      ]
    case 'browser-session':
      return [
        `Save the primary ${app.name} launch target for the governed browser session.`,
        'Keep the workflow inside the ChatBridge browser-session shell instead of a raw iframe.',
        'Decide whether this app should later stay browser-session or move to a native replacement.',
      ]
    case 'native-replacement':
      return [
        `Define the minimum workflow ChatBridge must recreate for ${app.name}.`,
        'Design the focused native lesson experience.',
        'Wire the replacement UI back into chat context and completion summaries.',
      ]
    case 'runtime':
      return ['Open the runtime beside chat.', 'Invoke the app tool flow.', 'Return completion context to the conversation.']
  }
}

function buildDefaultSamplePrompts(app: ApprovedApp) {
  return [
    `Open ${app.name} beside chat.`,
    `Use ${app.name} to help with this ${app.category.toLowerCase()} workflow.`,
    `Keep ${app.name} open while we work through the next step together.`,
  ]
}

function buildStatusNote(app: ApprovedApp) {
  switch (app.integrationMode) {
    case 'partner-embed':
      return `${app.name} is configured to use an approved embed-style workspace inside ChatBridge.`
    case 'api-adapter':
      return `${app.name} now opens on a governed adapter workspace route instead of a raw vendor iframe.`
    case 'district-adapter':
      return `${app.name} now opens on a district launch workspace so school-specific setup can stay inside ChatBridge.`
    case 'browser-session':
      return `${app.name} now opens on a governed browser-session workspace instead of failing straight into a blocked vendor iframe.`
    case 'native-replacement':
      return `${app.name} now opens on a native replacement workspace that keeps the learning flow inside ChatBridge.`
    case 'runtime':
      return `${app.name} runs through the TutorMeAI runtime bridge.`
  }
}

function buildIntegrationConfig(app: ApprovedApp): NonNullable<ApprovedApp['integrationConfig']> {
  const existing = app.integrationConfig ?? {}
  const override = APP_WORKSPACE_OVERRIDES[app.id] ?? {}
  const defaultLaunchUrl =
    existing.defaultLaunchUrl ??
    override.defaultLaunchUrl ??
    (app.integrationMode === 'partner-embed' ||
    app.integrationMode === 'district-adapter' ||
    app.integrationMode === 'browser-session'
      ? app.vendorUrl ?? app.launchUrl
      : undefined)

  return {
    defaultLaunchUrl,
    configurableLaunchUrl:
      existing.configurableLaunchUrl ??
      override.configurableLaunchUrl ??
      (app.integrationMode !== 'api-adapter' && app.integrationMode !== 'native-replacement'),
    launchUrlLabel: existing.launchUrlLabel ?? override.launchUrlLabel,
    launchUrlPlaceholder: existing.launchUrlPlaceholder ?? override.launchUrlPlaceholder,
    helpUrl: existing.helpUrl ?? override.helpUrl ?? app.vendorUrl ?? app.launchUrl,
    helpLabel: existing.helpLabel ?? override.helpLabel ?? 'Vendor reference',
    authModel: existing.authModel ?? override.authModel ?? defaultAuthModelForMode(app),
    capabilities: existing.capabilities ?? override.capabilities ?? [...DEFAULT_MODE_CAPABILITIES[app.integrationMode]],
    setupChecklist: existing.setupChecklist ?? override.setupChecklist ?? buildDefaultSetupChecklist(app),
    samplePrompts: existing.samplePrompts ?? override.samplePrompts ?? buildDefaultSamplePrompts(app),
    statusNote: existing.statusNote ?? override.statusNote ?? buildStatusNote(app),
  }
}

const curatedApprovedAppCatalog: ApprovedApp[] = [
  {
    id: 'google-classroom',
    name: 'Google Classroom',
    icon: '/icons/apps/google-classroom.png',
    shortSummary:
      'A central classroom hub for assignments, announcements, feedback, and workflow across K-12 environments.',
    category: 'Learning Management & Communication',
    gradeRanges: ['Multi-level'],
    launchUrl: 'https://classroom.google.com/',
    launchMode: 'iframe',
    integrationMode: 'api-adapter',
    isApproved: true,
    tags: ['lms', 'assignments', 'teacher-workflow', 'classroom-management'],
  },
  {
    id: 'classdojo',
    name: 'ClassDojo',
    icon: '/icons/apps/classdojo.png',
    shortSummary: 'A classroom communication and culture tool that helps teachers connect with students and families.',
    category: 'Learning Management & Communication',
    gradeRanges: ['Pre-K-2', '3-5'],
    launchUrl: 'https://www.classdojo.com/',
    launchMode: 'iframe',
    integrationMode: 'browser-session',
    isApproved: true,
    tags: ['communication', 'family-engagement', 'elementary', 'classroom-culture'],
  },
  {
    id: 'canvas-student',
    name: 'Canvas Student',
    icon: '/icons/apps/canvas-student.png',
    shortSummary: 'A robust LMS experience for course materials, assignments, grades, and class organization.',
    category: 'Learning Management & Communication',
    gradeRanges: ['6-8', '9-12'],
    launchUrl: 'https://www.instructure.com/canvas',
    launchMode: 'iframe',
    integrationMode: 'district-adapter',
    embedStatus: 'needs-district-url',
    isApproved: true,
    tags: ['lms', 'secondary', 'assignments', 'course-management'],
    vendorUrl: 'https://www.instructure.com/canvas/login',
    integrationConfig: {
      configurableLaunchUrl: true,
      launchUrlLabel: 'District Canvas launch URL',
      launchUrlPlaceholder: 'https://district.instructure.com/login/canvas',
      helpUrl: 'https://canvas.instructure.com/doc/api/',
      helpLabel: 'Canvas API docs',
    },
    loadingFallback: {
      title: 'Canvas needs a school-specific embedded launch link',
      body: 'Canvas and similar district-managed tools need a verified school iframe launch URL before they can run inside the TutorMeAI sidebar.',
    },
  },
  {
    id: 'seesaw',
    name: 'Seesaw',
    icon: '/icons/apps/seesaw.png',
    shortSummary:
      'An elementary-focused learning platform for student work, feedback, portfolios, and family visibility.',
    category: 'Learning Management & Communication',
    gradeRanges: ['Pre-K-2', '3-5'],
    launchUrl: 'https://web.seesaw.me/',
    launchMode: 'iframe',
    integrationMode: 'district-adapter',
    isApproved: true,
    tags: ['portfolio', 'elementary', 'family-engagement', 'student-work'],
  },
  {
    id: 'schoology',
    name: 'Schoology',
    icon: '/icons/apps/schoology.png',
    shortSummary: 'A school-centered LMS for managing instruction, assignments, discussions, and student progress.',
    category: 'Learning Management & Communication',
    gradeRanges: ['6-8', '9-12'],
    launchUrl: 'https://www.schoology.com/',
    launchMode: 'iframe',
    integrationMode: 'api-adapter',
    isApproved: true,
    tags: ['lms', 'secondary', 'instruction', 'student-progress'],
  },
  {
    id: 'khan-academy',
    name: 'Khan Academy',
    icon: '/icons/apps/khan-academy.png',
    shortSummary: 'A standards-aligned learning platform with lessons and practice across math, science, and more.',
    category: 'Math & STEM',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: 'https://www.khanacademy.org/',
    launchMode: 'iframe',
    integrationMode: 'browser-session',
    isApproved: true,
    tags: ['math', 'science', 'practice', 'standards-aligned'],
  },
  {
    id: 'khan-academy-kids',
    name: 'Khan Academy Kids',
    icon: '/icons/apps/khan-academy-kids.png',
    shortSummary: 'An early learning app for foundational reading, math, and developmental skills.',
    category: 'Math & STEM',
    gradeRanges: ['Pre-K-2'],
    launchUrl: 'https://learn.khanacademy.org/khan-academy-kids/',
    launchMode: 'iframe',
    integrationMode: 'native-replacement',
    isApproved: true,
    tags: ['early-learning', 'foundational-skills', 'prek', 'primary'],
  },
  {
    id: 'ixl',
    name: 'IXL',
    icon: '/icons/apps/ixl.png',
    shortSummary: 'An adaptive practice platform with skill-based learning and immediate feedback across subjects.',
    category: 'Math & STEM',
    gradeRanges: ['Multi-level'],
    launchUrl: 'https://www.ixl.com/',
    launchMode: 'iframe',
    integrationMode: 'district-adapter',
    isApproved: true,
    tags: ['adaptive', 'practice', 'math', 'multi-subject'],
  },
  {
    id: 'prodigy-math',
    name: 'Prodigy Math',
    icon: '/icons/apps/prodigy-math.png',
    shortSummary: 'A game-based math practice experience designed to increase engagement and repetition.',
    category: 'Math & STEM',
    gradeRanges: ['Pre-K-2', '3-5', '6-8'],
    launchUrl: 'https://www.prodigygame.com/',
    launchMode: 'iframe',
    integrationMode: 'district-adapter',
    isApproved: true,
    tags: ['gamified', 'math', 'engagement', 'practice'],
  },
  {
    id: 'splashlearn',
    name: 'SplashLearn',
    icon: '/icons/apps/splashlearn.png',
    shortSummary: 'A gamified math and reading platform built for younger learners and foundational skill growth.',
    category: 'Math & STEM',
    gradeRanges: ['Pre-K-2', '3-5'],
    launchUrl: 'https://www.splashlearn.com/',
    launchMode: 'iframe',
    integrationMode: 'district-adapter',
    isApproved: true,
    tags: ['gamified', 'elementary', 'math', 'reading'],
  },
  {
    id: 'desmos',
    name: 'Desmos',
    icon: '/icons/apps/desmos.png',
    shortSummary: 'A concept-driven math tool with calculators and classroom activities for deeper understanding.',
    category: 'Math & STEM',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: 'https://www.desmos.com/',
    launchMode: 'iframe',
    integrationMode: 'partner-embed',
    isApproved: true,
    tags: ['math', 'conceptual-learning', 'calculator', 'activities'],
    integrationConfig: {
      defaultLaunchUrl: 'https://www.desmos.com/calculator',
      helpUrl: 'https://www.desmos.com/api/v1.6/docs/index.html',
      helpLabel: 'Desmos API docs',
    },
  },
  {
    id: 'newsela',
    name: 'Newsela',
    icon: '/icons/apps/newsela.png',
    shortSummary:
      'A literacy platform with leveled informational texts, quizzes, and standards-aligned reading practice.',
    category: 'Literacy & Language',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: 'https://newsela.com/',
    launchMode: 'iframe',
    integrationMode: 'district-adapter',
    isApproved: true,
    tags: ['literacy', 'reading-levels', 'informational-text', 'ela'],
  },
  {
    id: 'epic',
    name: 'Epic!',
    icon: '/icons/apps/epic.png',
    shortSummary: 'A digital reading library with books, audiobooks, and reading discovery for younger students.',
    category: 'Literacy & Language',
    gradeRanges: ['Pre-K-2', '3-5'],
    launchUrl: 'https://www.getepic.com/',
    launchMode: 'iframe',
    integrationMode: 'district-adapter',
    isApproved: true,
    tags: ['books', 'reading', 'audiobooks', 'elementary'],
  },
  {
    id: 'duolingo',
    name: 'Duolingo',
    icon: '/icons/apps/duolingo.png',
    shortSummary: 'A gamified language-learning app for vocabulary, grammar, and repeated practice.',
    category: 'Literacy & Language',
    gradeRanges: ['6-8', '9-12'],
    launchUrl: 'https://www.duolingo.com/',
    launchMode: 'iframe',
    integrationMode: 'browser-session',
    isApproved: true,
    tags: ['languages', 'gamified', 'vocabulary', 'grammar'],
  },
  {
    id: 'abcmouse',
    name: 'ABCmouse',
    icon: '/icons/apps/abcmouse.png',
    shortSummary: 'An early learning platform focused on foundational reading, phonics, and beginner math skills.',
    category: 'Literacy & Language',
    gradeRanges: ['Pre-K-2'],
    launchUrl: 'https://www.abcmouse.com/',
    launchMode: 'iframe',
    integrationMode: 'browser-session',
    isApproved: true,
    tags: ['early-learning', 'phonics', 'literacy', 'prek'],
  },
  {
    id: 'kahoot',
    name: 'Kahoot!',
    icon: '/icons/apps/kahoot.png',
    shortSummary:
      'A live quiz and review platform that makes formative checks and classroom engagement more interactive.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['Multi-level'],
    launchUrl: 'https://kahoot.com/',
    launchMode: 'iframe',
    integrationMode: 'district-adapter',
    isApproved: true,
    tags: ['quizzes', 'engagement', 'formative-assessment', 'review'],
  },
  {
    id: 'quizlet',
    name: 'Quizlet',
    icon: '/icons/apps/quizlet.png',
    shortSummary: 'A study and review tool for flashcards, memorization, and self-paced reinforcement.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: 'https://quizlet.com/',
    launchMode: 'iframe',
    integrationMode: 'partner-embed',
    isApproved: true,
    tags: ['flashcards', 'study', 'review', 'memorization'],
    integrationConfig: {
      configurableLaunchUrl: true,
      launchUrlLabel: 'Quizlet set or embed URL',
      launchUrlPlaceholder: 'https://quizlet.com/... or https://quizlet.com/.../embed',
      helpUrl: 'https://help.quizlet.com/hc/en-us/articles/360032935851-Embedding-sets',
      helpLabel: 'Quizlet embed docs',
    },
  },
  {
    id: 'nearpod',
    name: 'Nearpod',
    icon: '/icons/apps/nearpod.png',
    shortSummary:
      'An interactive lesson platform with polls, checks for understanding, and teacher-led instruction tools.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['Multi-level'],
    launchUrl: 'https://nearpod.com/',
    launchMode: 'iframe',
    integrationMode: 'district-adapter',
    isApproved: true,
    tags: ['interactive-lessons', 'teacher-led', 'checks-for-understanding', 'presentation'],
  },
  {
    id: 'quizizz',
    name: 'Quizizz',
    icon: '/icons/apps/quizizz.png',
    shortSummary: 'A self-paced or live quiz platform for review, comprehension checks, and quick classroom practice.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: 'https://quizizz.com/',
    launchMode: 'iframe',
    integrationMode: 'district-adapter',
    isApproved: true,
    tags: ['quizzes', 'self-paced', 'review', 'classroom-practice'],
  },
  {
    id: 'padlet',
    name: 'Padlet',
    icon: '/icons/apps/padlet.png',
    shortSummary: 'A collaborative digital board for brainstorming, discussion, media sharing, and project responses.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: 'https://padlet.com/',
    launchMode: 'iframe',
    integrationMode: 'partner-embed',
    isApproved: true,
    tags: ['collaboration', 'brainstorming', 'discussion', 'projects'],
    integrationConfig: {
      configurableLaunchUrl: true,
      launchUrlLabel: 'Public Padlet URL',
      launchUrlPlaceholder: 'https://padlet.com/.../public-board',
      helpUrl: 'https://padlet.help/l/en/article/3933026qoo-public-api',
      helpLabel: 'Padlet integration docs',
    },
  },
  {
    id: 'edpuzzle',
    name: 'Edpuzzle',
    icon: '/icons/apps/edpuzzle.png',
    shortSummary: 'An interactive video lesson tool that lets teachers embed questions and track student progress.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: 'https://edpuzzle.com/',
    launchMode: 'iframe',
    integrationMode: 'district-adapter',
    isApproved: true,
    tags: ['video', 'interactive-lessons', 'assessment', 'teacher-tools'],
  },
  {
    id: 'pear-deck',
    name: 'Pear Deck',
    icon: '/icons/apps/pear-deck.png',
    shortSummary: 'An active learning tool that turns teacher slides into interactive lessons and formative checks.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: 'https://www.peardeck.com/',
    launchMode: 'iframe',
    integrationMode: 'district-adapter',
    isApproved: true,
    tags: ['slides', 'active-learning', 'formative-assessment', 'teacher-tools'],
  },
  {
    id: 'canva-for-education',
    name: 'Canva for Education',
    icon: '/icons/apps/canva-for-education.png',
    shortSummary: 'A visual creation platform for presentations, posters, videos, and classroom storytelling.',
    category: 'Creativity, Coding & Projects',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: 'https://www.canva.com/education/',
    launchMode: 'iframe',
    integrationMode: 'browser-session',
    isApproved: true,
    tags: ['design', 'presentations', 'projects', 'creativity'],
  },
  {
    id: 'scratchjr',
    name: 'ScratchJr',
    icon: '/icons/apps/scratchjr.png',
    shortSummary: 'An introductory coding app that teaches sequencing and logic through simple visual storytelling.',
    category: 'Creativity, Coding & Projects',
    gradeRanges: ['Pre-K-2'],
    launchUrl: 'https://www.scratchjr.org/',
    launchMode: 'iframe',
    integrationMode: 'native-replacement',
    isApproved: true,
    tags: ['coding', 'early-learning', 'logic', 'storytelling'],
  },
  {
    id: 'codespark-academy',
    name: 'CodeSpark Academy',
    icon: '/icons/apps/codespark-academy.png',
    shortSummary: 'A game-based coding experience for younger learners that builds logic and computational thinking.',
    category: 'Creativity, Coding & Projects',
    gradeRanges: ['Pre-K-2', '3-5'],
    launchUrl: 'https://codespark.com/',
    launchMode: 'iframe',
    integrationMode: 'browser-session',
    isApproved: true,
    tags: ['coding', 'computational-thinking', 'games', 'elementary'],
  },
]

const tutorMeAiApps: ApprovedApp[] = [
  {
    id: 'chess-tutor',
    name: 'Chess Tutor',
    icon: '/icons/apps/chess-tutor.png',
    shortSummary:
      'A chat-aware chess practice experience with board state, move guidance, and completion summaries that flow back into TutorMeAI.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['6-8', '9-12'],
    launchUrl: '/embedded-apps/chess',
    launchMode: 'iframe',
    integrationMode: 'runtime',
    isApproved: true,
    tags: ['tutormeai', 'chess', 'strategy', 'guided-practice'],
    experience: 'tutormeai-runtime',
    runtimeBridge: {
      appId: 'chess.internal',
      sidebarMode: 'direct-iframe',
      authState: 'not-required',
      grantedPermissions: ['session:write', 'tool:invoke'],
      availableTools: [exampleChessLaunchToolSchema],
      pendingInvocation: {
        toolName: exampleChessLaunchToolSchema.name,
        arguments: { mode: 'practice' },
        timeoutMs: exampleChessLaunchToolSchema.timeoutMs,
      },
    },
  },
  {
    id: 'flashcards-coach',
    name: 'Flashcards Coach',
    icon: '/icons/apps/flashcards-coach.png',
    shortSummary:
      'A TutorMeAI flashcards session that keeps study topics, progress, and completion summaries connected to the conversation.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: '/embedded-apps/flashcards',
    launchMode: 'iframe',
    integrationMode: 'runtime',
    isApproved: true,
    tags: ['tutormeai', 'flashcards', 'study', 'review'],
    experience: 'tutormeai-runtime',
    runtimeBridge: {
      appId: 'flashcards.public',
      authState: 'not-required',
      grantedPermissions: ['tool:invoke'],
      availableTools: [exampleFlashcardsStartToolSchema],
      pendingInvocation: {
        toolName: exampleFlashcardsStartToolSchema.name,
        arguments: { topic: 'fractions' },
        timeoutMs: exampleFlashcardsStartToolSchema.timeoutMs,
      },
    },
  },
  {
    id: 'planner-connect',
    name: 'Planner Connect',
    icon: '/icons/apps/planner-connect.png',
    shortSummary:
      'An authenticated TutorMeAI planner workspace that keeps assignment focus, auth state, and completion context attached to chat.',
    category: 'Learning Management & Communication',
    gradeRanges: ['6-8', '9-12'],
    launchUrl: '/embedded-apps/planner',
    launchMode: 'iframe',
    integrationMode: 'runtime',
    isApproved: true,
    tags: ['tutormeai', 'planner', 'assignments', 'authenticated'],
    experience: 'tutormeai-runtime',
    runtimeBridge: {
      appId: 'planner.oauth',
      authState: 'required',
      grantedPermissions: ['conversation:read-summary', 'tool:invoke', 'oauth:connect', 'user:read-profile'],
      availableTools: [examplePlannerDashboardToolSchema],
      pendingInvocation: {
        toolName: examplePlannerDashboardToolSchema.name,
        arguments: { focus: 'today' },
        timeoutMs: examplePlannerDashboardToolSchema.timeoutMs,
      },
    },
  },
]

export const APP_MILESTONE_ORDER = [
  'chess-tutor',
  'flashcards-coach',
  'planner-connect',
  'desmos',
  'padlet',
  'google-classroom',
  'canvas-student',
  'schoology',
  'quizlet',
  'seesaw',
  'ixl',
  'prodigy-math',
  'splashlearn',
  'newsela',
  'epic',
  'kahoot',
  'nearpod',
  'quizizz',
  'edpuzzle',
  'pear-deck',
  'classdojo',
  'khan-academy',
  'duolingo',
  'abcmouse',
  'canva-for-education',
  'codespark-academy',
  'khan-academy-kids',
  'scratchjr',
] as const
export const approvedApps: ApprovedApp[] = [
  ...tutorMeAiApps,
  ...curatedApprovedAppCatalog.map((app) => {
    const vendorUrl = app.vendorUrl ?? app.launchUrl
    const workspaceApp: ApprovedApp = {
      ...app,
      launchUrl: `/embedded-apps/catalog/${app.id}`,
      vendorUrl,
      experience: 'approved-library',
    }

    return {
      ...workspaceApp,
      integrationConfig: buildIntegrationConfig(workspaceApp),
    }
  }),
]

export const approvedAppsById = new Map(approvedApps.map((app) => [app.id, app] as const))
export const approvedAppsByRuntimeAppId = new Map(
  approvedApps.reduce<[string, ApprovedApp][]>((entries, app) => {
    if (app.runtimeBridge?.appId) {
      entries.push([app.runtimeBridge.appId, app])
    }

    return entries
  }, [])
)

export function getApprovedAppById(appId: string) {
  return approvedAppsById.get(appId)
}

export function getApprovedAppByRuntimeAppId(runtimeAppId: string) {
  return approvedAppsByRuntimeAppId.get(runtimeAppId)
}
