import type { ApprovedApp } from '@/types/apps'

function buildIcon(initials: string, background: string, foreground = '#ffffff') {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none">
      <rect width="96" height="96" rx="28" fill="${background}" />
      <text
        x="50%"
        y="54%"
        dominant-baseline="middle"
        text-anchor="middle"
        fill="${foreground}"
        font-family="Inter, Arial, sans-serif"
        font-size="30"
        font-weight="700"
        letter-spacing="1"
      >
        ${initials}
      </text>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function createPlaceholderLaunchUrl(appId: string) {
  return `/embedded-apps/catalog/${appId}`
}

export const approvedApps: ApprovedApp[] = [
  {
    id: 'google-classroom',
    name: 'Google Classroom',
    icon: buildIcon('GC', '#2563eb'),
    shortSummary: 'Organize assignments, announcements, and class materials in one familiar classroom hub.',
    category: 'Learning Management & Communication',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('google-classroom'),
    isApproved: true,
    tags: ['District Approved', 'Teacher Favorite'],
  },
  {
    id: 'canvas',
    name: 'Canvas',
    icon: buildIcon('CV', '#dc2626'),
    shortSummary: 'Manage coursework, discussions, grading, and class communication with a structured LMS workflow.',
    category: 'Learning Management & Communication',
    gradeRanges: ['6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('canvas'),
    isApproved: true,
    tags: ['District Approved'],
  },
  {
    id: 'schoology',
    name: 'Schoology',
    icon: buildIcon('SG', '#0f766e'),
    shortSummary: 'Keep lessons, submissions, and classroom updates together for teachers, students, and families.',
    category: 'Learning Management & Communication',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('schoology'),
    isApproved: true,
    tags: ['District Approved'],
  },
  {
    id: 'seesaw',
    name: 'Seesaw',
    icon: buildIcon('SS', '#7c3aed'),
    shortSummary: 'Capture student work with easy activities, portfolios, and family-friendly communication tools.',
    category: 'Learning Management & Communication',
    gradeRanges: ['Pre-K-2', '3-5'],
    launchUrl: createPlaceholderLaunchUrl('seesaw'),
    isApproved: true,
    tags: ['Teacher Favorite', 'Student Friendly'],
  },
  {
    id: 'remind',
    name: 'Remind',
    icon: buildIcon('RM', '#0ea5e9'),
    shortSummary:
      'Send quick class updates and reminders so teachers and families can stay aligned throughout the week.',
    category: 'Learning Management & Communication',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('remind'),
    isApproved: true,
    tags: ['Family Communication'],
  },
  {
    id: 'desmos',
    name: 'Desmos',
    icon: buildIcon('DM', '#16a34a'),
    shortSummary: 'Explore graphs, activities, and interactive math models that make reasoning visible for students.',
    category: 'Math & STEM',
    gradeRanges: ['6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('desmos'),
    isApproved: true,
    tags: ['Teacher Favorite', 'Interactive Math'],
  },
  {
    id: 'khan-academy',
    name: 'Khan Academy',
    icon: buildIcon('KA', '#0891b2'),
    shortSummary: 'Offer standards-aligned practice, videos, and personalized progress tracking across core subjects.',
    category: 'Math & STEM',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('khan-academy'),
    isApproved: true,
    tags: ['Personalized Practice'],
  },
  {
    id: 'geogebra',
    name: 'GeoGebra',
    icon: buildIcon('GG', '#4f46e5'),
    shortSummary: 'Model algebra and geometry concepts with dynamic tools students can manipulate in real time.',
    category: 'Math & STEM',
    gradeRanges: ['6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('geogebra'),
    isApproved: true,
    tags: ['Interactive Math'],
  },
  {
    id: 'st-math',
    name: 'ST Math',
    icon: buildIcon('ST', '#ea580c'),
    shortSummary: 'Build conceptual math fluency through visual puzzles and structured problem-solving routines.',
    category: 'Math & STEM',
    gradeRanges: ['Pre-K-2', '3-5', '6-8'],
    launchUrl: createPlaceholderLaunchUrl('st-math'),
    isApproved: true,
    tags: ['Student Friendly'],
  },
  {
    id: 'code-org',
    name: 'Code.org',
    icon: buildIcon('CO', '#be123c'),
    shortSummary: 'Teach computer science with accessible lessons, coding labs, and project-based creativity tools.',
    category: 'Creativity, Coding & Projects',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('code-org'),
    isApproved: true,
    tags: ['STEM', 'Project Based'],
  },
  {
    id: 'epic',
    name: 'Epic',
    icon: buildIcon('EP', '#7c2d12'),
    shortSummary: 'Give students a library of age-appropriate digital books, read-alouds, and literacy supports.',
    category: 'Literacy & Language',
    gradeRanges: ['Pre-K-2', '3-5'],
    launchUrl: createPlaceholderLaunchUrl('epic'),
    isApproved: true,
    tags: ['Student Friendly'],
  },
  {
    id: 'readworks',
    name: 'ReadWorks',
    icon: buildIcon('RW', '#1d4ed8'),
    shortSummary: 'Access reading passages, question sets, and vocabulary supports aligned to classroom instruction.',
    category: 'Literacy & Language',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('readworks'),
    isApproved: true,
    tags: ['Assessment Ready'],
  },
  {
    id: 'commonlit',
    name: 'CommonLit',
    icon: buildIcon('CL', '#7e22ce'),
    shortSummary: 'Support close reading with texts, discussion prompts, and standards-based comprehension checks.',
    category: 'Literacy & Language',
    gradeRanges: ['6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('commonlit'),
    isApproved: true,
    tags: ['Teacher Favorite'],
  },
  {
    id: 'newsela',
    name: 'Newsela',
    icon: buildIcon('NS', '#0f766e'),
    shortSummary: 'Bring current events and nonfiction reading into class with leveled articles and quick checks.',
    category: 'Literacy & Language',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('newsela'),
    isApproved: true,
    tags: ['Current Events'],
  },
  {
    id: 'duolingo',
    name: 'Duolingo',
    icon: buildIcon('DL', '#16a34a'),
    shortSummary:
      'Practice vocabulary and language structures through short, gamified lessons students can revisit often.',
    category: 'Literacy & Language',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('duolingo'),
    isApproved: true,
    tags: ['Student Friendly', 'Practice'],
  },
  {
    id: 'quizizz',
    name: 'Quizizz',
    icon: buildIcon('QZ', '#9333ea'),
    shortSummary: 'Run formative checks, homework review, and live classroom competitions with fast feedback loops.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('quizizz'),
    isApproved: true,
    tags: ['Teacher Favorite', 'Engagement'],
  },
  {
    id: 'kahoot',
    name: 'Kahoot!',
    icon: buildIcon('KH', '#7c3aed'),
    shortSummary: 'Turn review into a lively quiz game with whole-group participation and instant answer data.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('kahoot'),
    isApproved: true,
    tags: ['Engagement', 'Whole Group'],
  },
  {
    id: 'nearpod',
    name: 'Nearpod',
    icon: buildIcon('NP', '#2563eb'),
    shortSummary: 'Deliver interactive lessons with checks for understanding, collaboration, and multimedia content.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('nearpod'),
    isApproved: true,
    tags: ['Interactive Lessons'],
  },
  {
    id: 'quizlet',
    name: 'Quizlet',
    icon: buildIcon('QL', '#0f766e'),
    shortSummary: 'Create and study flashcards, review sets, and quick practice routines across subjects.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('quizlet'),
    isApproved: true,
    tags: ['Study Skills'],
  },
  {
    id: 'edpuzzle',
    name: 'Edpuzzle',
    icon: buildIcon('ED', '#ef4444'),
    shortSummary:
      'Embed checks and prompts into instructional videos so teachers can monitor understanding as students watch.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('edpuzzle'),
    isApproved: true,
    tags: ['Video Learning'],
  },
  {
    id: 'brainpop',
    name: 'BrainPOP',
    icon: buildIcon('BP', '#f59e0b'),
    shortSummary:
      'Mix videos, concept explainers, and quizzes to build background knowledge before deeper instruction.',
    category: 'Study, Assessment & Engagement',
    gradeRanges: ['Pre-K-2', '3-5', '6-8'],
    launchUrl: createPlaceholderLaunchUrl('brainpop'),
    isApproved: true,
    tags: ['Student Friendly'],
  },
  {
    id: 'scratch',
    name: 'Scratch',
    icon: buildIcon('SC', '#f97316'),
    shortSummary:
      'Help students create stories, games, and animations while learning sequencing and computational thinking.',
    category: 'Creativity, Coding & Projects',
    gradeRanges: ['3-5', '6-8'],
    launchUrl: createPlaceholderLaunchUrl('scratch'),
    isApproved: true,
    tags: ['Project Based', 'Student Creation'],
  },
  {
    id: 'tynker',
    name: 'Tynker',
    icon: buildIcon('TY', '#2563eb'),
    shortSummary: 'Guide coding progression from block-based exploration to more advanced programming challenges.',
    category: 'Creativity, Coding & Projects',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('tynker'),
    isApproved: true,
    tags: ['Coding Pathways'],
  },
  {
    id: 'flip',
    name: 'Flip',
    icon: buildIcon('FL', '#14b8a6'),
    shortSummary: 'Capture student voice with short video reflections, discussion prompts, and creative responses.',
    category: 'Creativity, Coding & Projects',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('flip'),
    isApproved: true,
    tags: ['Student Voice'],
  },
  {
    id: 'padlet',
    name: 'Padlet',
    icon: buildIcon('PD', '#ec4899'),
    shortSummary: 'Collect class ideas, links, and project artifacts on collaborative boards that are easy to scan.',
    category: 'Creativity, Coding & Projects',
    gradeRanges: ['3-5', '6-8', '9-12'],
    launchUrl: createPlaceholderLaunchUrl('padlet'),
    isApproved: true,
    tags: ['Collaboration', 'Project Based'],
  },
]

export const approvedAppsById = new Map(approvedApps.map((app) => [app.id, app]))

export function getApprovedAppById(appId: string) {
  return approvedAppsById.get(appId)
}
