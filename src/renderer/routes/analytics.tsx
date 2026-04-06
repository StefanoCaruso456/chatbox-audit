import {
  Badge,
  Box,
  Divider,
  Flex,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  type MantineColor,
} from '@mantine/core'
import {
  IconChartBar,
  IconClock,
  IconClipboardCheck,
  IconHome,
  IconInfoCircle,
  IconMessage2,
  IconSchool,
  IconTarget,
  IconTrendingUp,
  IconUsers,
  type IconProps,
} from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { type ElementType, useState } from 'react'
import SegmentedControl from '@/components/common/SegmentedControl'
import Page from '@/components/layout/Page'

export const Route = createFileRoute('/analytics')({
  component: AnalyticsDashboard,
})

type AnalyticsAudience = 'teacher' | 'parent'

type MetricCardData = {
  label: string
  value: string
  detail: string
  icon: ElementType<IconProps>
  color: MantineColor
}

type AppEngagementRow = {
  app: string
  avgMinutes: string
  prompts: string
  activeStudents: string
  why: string
  assignment: string
  color: MantineColor
}

type StudentSignal = {
  name: string
  grade: string
  app: string
  status: string
  statusColor: MantineColor
  engagementScore: number
  trend: string
  behavior: string
  teacherAction: string
}

type AssignmentSnapshot = {
  title: string
  due: string
  completion: number
  score: string
  avgTime: string
  strongestApp: string
  note: string
  color: MantineColor
}

type PatternInsight = {
  label: string
  detail: string
  impact: string
}

type ParentAppBreakdown = {
  app: string
  time: string
  prompts: string
  why: string
  momentum: string
  color: MantineColor
}

type ParentAssignment = {
  title: string
  status: string
  completion: number
  score: string
  teacherNote: string
  color: MantineColor
}

type DailyEngagement = {
  day: string
  minutes: number
}

const teacherMetrics: MetricCardData[] = [
  {
    label: 'Active students this week',
    value: '108 / 124',
    detail: '+14% versus last week across approved apps',
    icon: IconUsers,
    color: 'blue',
  },
  {
    label: 'Average time in apps',
    value: '57 min',
    detail: 'Planner and Flashcards lead the longest focused sessions',
    icon: IconClock,
    color: 'teal',
  },
  {
    label: 'Prompts per active student',
    value: '14.8',
    detail: 'High prompt depth usually maps to stronger assignment completion',
    icon: IconMessage2,
    color: 'grape',
  },
  {
    label: 'Assignment completion',
    value: '84%',
    detail: '6 students need follow-up before the next due date window',
    icon: IconClipboardCheck,
    color: 'orange',
  },
]

const appEngagementRows: AppEngagementRow[] = [
  {
    app: 'Planner',
    avgMinutes: '21 min',
    prompts: '486',
    activeStudents: '92',
    why: 'Students use it to break assignments into steps and organize deadlines.',
    assignment: 'Narrative essay plan',
    color: 'blue',
  },
  {
    app: 'Flashcards',
    avgMinutes: '18 min',
    prompts: '352',
    activeStudents: '79',
    why: 'Strongest for rehearsal, spaced repetition, and pre-quiz review.',
    assignment: 'Fractions vocabulary set',
    color: 'teal',
  },
  {
    app: 'Chess',
    avgMinutes: '12 min',
    prompts: '141',
    activeStudents: '37',
    why: 'Builds strategic thinking and persistence during enrichment blocks.',
    assignment: 'Pattern recognition practice',
    color: 'grape',
  },
  {
    app: 'Chess.com',
    avgMinutes: '15 min',
    prompts: '118',
    activeStudents: '29',
    why: 'Students revisit games to reflect on decision-making and next moves.',
    assignment: 'Independent extension challenge',
    color: 'orange',
  },
]

const studentSignals: StudentSignal[] = [
  {
    name: 'Ava Thompson',
    grade: '8',
    app: 'Flashcards',
    status: 'Needs follow-up',
    statusColor: 'yellow',
    engagementScore: 42,
    trend: 'Prompt volume dropped 31% after the first review round.',
    behavior: 'Starts sessions consistently, but exits before retrieval practice gets harder.',
    teacherAction: 'Assign a shorter deck and compare completion after guided practice.',
  },
  {
    name: 'Noah Martinez',
    grade: '7',
    app: 'Planner',
    status: 'Low momentum',
    statusColor: 'orange',
    engagementScore: 54,
    trend: 'High planning time but only 58% of tasks are marked complete.',
    behavior: 'Reads prompts carefully, then stalls when turning plans into next actions.',
    teacherAction: 'Review task chunking and add a teacher checkpoint halfway through.',
  },
  {
    name: 'Mia Chen',
    grade: '6',
    app: 'Chess',
    status: 'Improving',
    statusColor: 'teal',
    engagementScore: 76,
    trend: 'Session frequency is up 19% and reflection prompts are more specific.',
    behavior: 'Persistence is stronger, but late-evening sessions correlate with lower scores.',
    teacherAction: 'Celebrate improvement and suggest earlier practice windows at home.',
  },
]

const assignmentSnapshots: AssignmentSnapshot[] = [
  {
    title: 'Narrative Essay Planning',
    due: 'Apr 9',
    completion: 88,
    score: '84%',
    avgTime: '24 min',
    strongestApp: 'Planner',
    note: 'Students who revised their plan twice submitted the strongest first drafts.',
    color: 'blue',
  },
  {
    title: 'Fractions Vocabulary Check',
    due: 'Apr 8',
    completion: 81,
    score: '78%',
    avgTime: '19 min',
    strongestApp: 'Flashcards',
    note: 'Completion is solid, but prompt quality drops when sessions run longer than 20 minutes.',
    color: 'teal',
  },
  {
    title: 'Enrichment Strategy Reflection',
    due: 'Apr 12',
    completion: 63,
    score: '91%',
    avgTime: '14 min',
    strongestApp: 'Chess.com',
    note: 'Smaller participation, but students who engage are producing high-quality reasoning.',
    color: 'grape',
  },
]

const teacherPatterns: PatternInsight[] = [
  {
    label: 'Early intervention',
    detail: 'Spot when prompt depth, time on task, or assignment completion starts slipping.',
    impact: 'Helps teachers act before a student quietly disengages.',
  },
  {
    label: 'Parent conferences',
    detail: 'Bring concrete app usage, effort, and assignment evidence into the conversation.',
    impact: 'Keeps family discussions grounded in trends instead of anecdotes.',
  },
  {
    label: 'Curriculum tuning',
    detail: 'See which apps actually support the assignment and where students get stuck.',
    impact: 'Improves lesson design and future app rollout decisions.',
  },
]

const parentMetrics: MetricCardData[] = [
  {
    label: 'Weekly learning time',
    value: '4h 18m',
    detail: 'Most productive between 4:00 PM and 6:00 PM',
    icon: IconClock,
    color: 'blue',
  },
  {
    label: 'Helpful prompts used',
    value: '38',
    detail: 'Prompts were strongest when your child asked for step-by-step guidance',
    icon: IconMessage2,
    color: 'grape',
  },
  {
    label: 'Assignments on track',
    value: '92%',
    detail: 'One enrichment task still needs a final reflection',
    icon: IconClipboardCheck,
    color: 'teal',
  },
  {
    label: 'Consistency streak',
    value: '4 days',
    detail: 'Shorter sessions are producing the best completion rate',
    icon: IconTrendingUp,
    color: 'orange',
  },
]

const parentDailyEngagement: DailyEngagement[] = [
  { day: 'Mon', minutes: 42 },
  { day: 'Tue', minutes: 36 },
  { day: 'Wed', minutes: 54 },
  { day: 'Thu', minutes: 49 },
  { day: 'Fri', minutes: 28 },
  { day: 'Sat', minutes: 31 },
  { day: 'Sun', minutes: 18 },
]

const parentAppBreakdown: ParentAppBreakdown[] = [
  {
    app: 'Planner',
    time: '96 min',
    prompts: '22',
    why: 'Used to turn the science fair outline into a daily checklist.',
    momentum: 'Strong follow-through after school.',
    color: 'blue',
  },
  {
    app: 'Flashcards',
    time: '72 min',
    prompts: '11',
    why: 'Best for vocabulary and quiz review before evening homework.',
    momentum: 'Great when sessions stay under 20 minutes.',
    color: 'teal',
  },
  {
    app: 'Chess',
    time: '41 min',
    prompts: '5',
    why: 'Supports strategy practice and helps with perseverance.',
    momentum: 'Better as a reward or enrichment block.',
    color: 'grape',
  },
]

const parentAssignments: ParentAssignment[] = [
  {
    title: 'Science Fair Outline',
    status: 'On track',
    completion: 100,
    score: '94%',
    teacherNote: 'Strong improvement when prompts stay specific and action-oriented.',
    color: 'teal',
  },
  {
    title: 'Fractions Vocabulary',
    status: 'Almost there',
    completion: 85,
    score: '81%',
    teacherNote: 'A little more repetition will likely raise confidence before the quiz.',
    color: 'blue',
  },
  {
    title: 'Strategy Reflection',
    status: 'Needs one more session',
    completion: 60,
    score: 'Pending',
    teacherNote: 'Reflection quality is strong, but the final response has not been submitted yet.',
    color: 'orange',
  },
]

const generalUseCases: PatternInsight[] = [
  {
    label: 'Licensing and app adoption',
    detail: 'See which tools drive real learning time and which are mostly unused.',
    impact: 'Helps schools make better purchasing and rollout decisions.',
  },
  {
    label: 'Student support teams',
    detail: 'Combine engagement trends with teacher observations for MTSS or intervention planning.',
    impact: 'Makes support conversations faster and more evidence-based.',
  },
  {
    label: 'School-wide reporting',
    detail: 'Roll classroom activity up into grade, teacher, or campus-level snapshots.',
    impact: 'Supports leadership reviews without losing classroom detail.',
  },
]

function AnalyticsDashboard() {
  const [audience, setAudience] = useState<AnalyticsAudience>('teacher')

  const heroTitle = audience === 'teacher' ? 'Learning Analytics for Teachers' : 'Learning Analytics for Families'
  const heroDescription =
    audience === 'teacher'
      ? 'Review student behavior, app engagement, prompt depth, and assignment follow-through in one place so teachers can intervene earlier and coach more precisely.'
      : 'Give parents a clear view into how their child is using each app, where time is being spent, and how that engagement connects to assignments and progress.'
  const heroPills =
    audience === 'teacher'
      ? ['Behavior patterns', 'Time on each app', 'Prompts by app', 'Assignments and performance']
      : ['Child progress', 'App-by-app engagement', 'Family visibility', 'Shared accountability']

  return (
    <Page title="Analytics">
      <div className="relative overflow-hidden p-4 md:p-6">
        <Stack gap="md" style={{ margin: '0 auto', maxWidth: 1320 }}>
          <Paper withBorder radius="xl" p="xl" className="cb-neumo-card relative overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-chatbox-background-brand-secondary/35 to-transparent" />
            <div className="pointer-events-none absolute right-6 top-6 h-28 w-28 rounded-full bg-chatbox-background-brand-secondary/30 blur-3xl" />

            <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <Stack gap={8} maw={760}>
                <Badge variant="light" color="chatbox-brand" radius="xl">
                  {audience === 'teacher' ? 'Teacher View' : 'Parent View'}
                </Badge>
                <Title order={2}>{heroTitle}</Title>
                <Text c="chatbox-secondary" maw={720}>
                  {heroDescription}
                </Text>
                <Group gap="xs">
                  {heroPills.map((pill) => (
                    <Badge key={pill} variant="outline" color="gray" radius="xl">
                      {pill}
                    </Badge>
                  ))}
                </Group>
              </Stack>

              <div className="w-full xl:max-w-[320px]">
                <Text size="xs" tt="uppercase" fw={700} c="chatbox-tertiary" mb={8}>
                  Audience
                </Text>
                <SegmentedControl
                  value={audience}
                  onChange={(value) => setAudience(value as AnalyticsAudience)}
                  data={[
                    { label: 'Teacher', value: 'teacher' },
                    { label: 'Parent', value: 'parent' },
                  ]}
                />
              </div>
            </div>
          </Paper>

          {audience === 'teacher' ? <TeacherAnalyticsView /> : <ParentAnalyticsView />}

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
            <SurfaceCard
              title="Why this dashboard matters"
              description="The value is not just seeing activity. The value is tying engagement to outcomes."
            >
              <Stack gap="sm">
                <InsightRow
                  icon={IconSchool}
                  title="Teachers get an earlier signal"
                  body="When time on app, prompt quality, or assignment completion changes, teachers can step in before grades slip."
                />
                <InsightRow
                  icon={IconHome}
                  title="Parents stay aligned with school"
                  body="Families can see effort, consistency, and app usage in context instead of guessing whether screen time was productive."
                />
                <InsightRow
                  icon={IconTarget}
                  title="Everyone can focus on what works"
                  body="The dashboard shows which apps are driving follow-through, where students stall, and which assignments deserve more support."
                />
              </Stack>
            </SurfaceCard>

            <SurfaceCard
              title="Other strong use cases"
              description="This same analytics layer can support decisions beyond day-to-day review."
            >
              <Stack gap="sm">
                {generalUseCases.map((item) => (
                  <MiniUseCaseCard key={item.label} label={item.label} detail={item.detail} impact={item.impact} />
                ))}
              </Stack>
            </SurfaceCard>
          </SimpleGrid>
        </Stack>
      </div>
    </Page>
  )
}

function TeacherAnalyticsView() {
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
        {teacherMetrics.map((metric) => (
          <MetricCard key={metric.label} data={metric} />
        ))}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
        <SurfaceCard
          title="App engagement"
          description="Track time on each app, prompt counts, active students, and the learning reason behind usage."
        >
          <Box style={{ overflowX: 'auto' }}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md" miw={760}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>App</Table.Th>
                  <Table.Th>Avg time</Table.Th>
                  <Table.Th>Prompts</Table.Th>
                  <Table.Th>Active students</Table.Th>
                  <Table.Th>Why students use it</Table.Th>
                  <Table.Th>Linked assignment</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {appEngagementRows.map((row) => (
                  <Table.Tr key={row.app}>
                    <Table.Td>
                      <Group gap="xs">
                        <ThemeIcon variant="light" color={row.color} radius="xl" size={30}>
                          <IconChartBar size={16} />
                        </ThemeIcon>
                        <Text fw={600}>{row.app}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>{row.avgMinutes}</Table.Td>
                    <Table.Td>{row.prompts}</Table.Td>
                    <Table.Td>{row.activeStudents}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="chatbox-secondary" maw={240}>
                        {row.why}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={row.color} radius="xl">
                        {row.assignment}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        </SurfaceCard>

        <SurfaceCard
          title="Students needing attention"
          description="Use behavior and engagement signals to decide who needs a quick check-in, reteach, or family update."
        >
          <Stack gap="sm">
            {studentSignals.map((student) => (
              <Paper key={student.name} withBorder radius="xl" p="md" className="cb-neumo-card-soft">
                <Stack gap="sm">
                  <Flex align="center" justify="space-between" gap="sm" wrap="wrap">
                    <div>
                      <Text fw={700}>{student.name}</Text>
                      <Text size="sm" c="chatbox-secondary">
                        Grade {student.grade} • Primary app: {student.app}
                      </Text>
                    </div>
                    <Badge variant="light" color={student.statusColor} radius="xl">
                      {student.status}
                    </Badge>
                  </Flex>

                  <div>
                    <Flex align="center" justify="space-between" mb={6}>
                      <Text size="xs" fw={700} tt="uppercase" c="chatbox-tertiary">
                        Engagement score
                      </Text>
                      <Text size="sm" fw={600}>
                        {student.engagementScore} / 100
                      </Text>
                    </Flex>
                    <Progress value={student.engagementScore} color={student.statusColor} radius="xl" />
                  </div>

                  <LabeledValue label="Trend" value={student.trend} />
                  <LabeledValue label="Behavior signal" value={student.behavior} />
                  <LabeledValue label="Recommended teacher action" value={student.teacherAction} />
                </Stack>
              </Paper>
            ))}
          </Stack>
        </SurfaceCard>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
        <SurfaceCard
          title="Assignment performance"
          description="Connect classroom tasks to the apps students use, the time they spend, and the quality of outcomes."
        >
          <Stack gap="sm">
            {assignmentSnapshots.map((assignment) => (
              <Paper key={assignment.title} withBorder radius="xl" p="md" className="cb-neumo-card-soft">
                <Stack gap="sm">
                  <Flex align="center" justify="space-between" gap="sm" wrap="wrap">
                    <div>
                      <Text fw={700}>{assignment.title}</Text>
                      <Text size="sm" c="chatbox-secondary">
                        Due {assignment.due}
                      </Text>
                    </div>
                    <Badge variant="light" color={assignment.color} radius="xl">
                      Strongest app: {assignment.strongestApp}
                    </Badge>
                  </Flex>

                  <div>
                    <Flex align="center" justify="space-between" mb={6}>
                      <Text size="xs" fw={700} tt="uppercase" c="chatbox-tertiary">
                        Completion
                      </Text>
                      <Text size="sm" fw={600}>
                        {assignment.completion}%
                      </Text>
                    </Flex>
                    <Progress value={assignment.completion} color={assignment.color} radius="xl" />
                  </div>

                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <LabeledValue label="Average score" value={assignment.score} />
                    <LabeledValue label="Average time" value={assignment.avgTime} />
                  </SimpleGrid>

                  <Text size="sm" c="chatbox-secondary">
                    {assignment.note}
                  </Text>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </SurfaceCard>

        <SurfaceCard
          title="Monitoring goals"
          description="These are the next-level ways a teacher dashboard becomes strategically useful."
        >
          <Stack gap="sm">
            {teacherPatterns.map((pattern) => (
              <MiniUseCaseCard
                key={pattern.label}
                label={pattern.label}
                detail={pattern.detail}
                impact={pattern.impact}
              />
            ))}
          </Stack>
        </SurfaceCard>
      </SimpleGrid>
    </Stack>
  )
}

function ParentAnalyticsView() {
  const maxDailyMinutes = Math.max(...parentDailyEngagement.map((item) => item.minutes))

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
        {parentMetrics.map((metric) => (
          <MetricCard key={metric.label} data={metric} />
        ))}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
        <SurfaceCard
          title="Weekly learning rhythm"
          description="A family-friendly view of when learning happened and where focus was strongest."
        >
          <Stack gap="md">
            <Group gap="xs">
              <Badge variant="light" color="blue" radius="xl">
                Best window: 4 PM - 6 PM
              </Badge>
              <Badge variant="outline" color="gray" radius="xl">
                Short sessions outperform long sessions
              </Badge>
            </Group>

            <div className="flex items-end gap-3 overflow-x-auto pb-2">
              {parentDailyEngagement.map((entry) => (
                <div key={entry.day} className="min-w-[52px] flex-1">
                  <DailyEngagementBar day={entry.day} minutes={entry.minutes} maxMinutes={maxDailyMinutes} />
                </div>
              ))}
            </div>

            <Paper withBorder radius="xl" p="md" className="cb-neumo-card-soft">
              <Text fw={600}>Teacher note for families</Text>
              <Text size="sm" c="chatbox-secondary" mt={6}>
                Your child does best when the first prompt is specific, the session stays under 25 minutes, and there is
                a short check-in after the assignment is complete.
              </Text>
            </Paper>
          </Stack>
        </SurfaceCard>

        <SurfaceCard
          title="App-by-app breakdown"
          description="Parents can see how each app supports learning instead of only seeing screen time."
        >
          <Stack gap="sm">
            {parentAppBreakdown.map((app) => (
              <Paper key={app.app} withBorder radius="xl" p="md" className="cb-neumo-card-soft">
                <Stack gap="sm">
                  <Flex align="center" justify="space-between" gap="sm" wrap="wrap">
                    <Group gap="xs">
                      <ThemeIcon variant="light" color={app.color} radius="xl" size={30}>
                        <IconChartBar size={16} />
                      </ThemeIcon>
                      <Text fw={700}>{app.app}</Text>
                    </Group>
                    <Badge variant="light" color={app.color} radius="xl">
                      {app.time} • {app.prompts} prompts
                    </Badge>
                  </Flex>

                  <LabeledValue label="Why it was used" value={app.why} />
                  <LabeledValue label="Momentum" value={app.momentum} />
                </Stack>
              </Paper>
            ))}
          </Stack>
        </SurfaceCard>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
        <SurfaceCard
          title="Assignments and progress"
          description="Tie each assignment to completion status, performance, and the feedback parents should know."
        >
          <Stack gap="sm">
            {parentAssignments.map((assignment) => (
              <Paper key={assignment.title} withBorder radius="xl" p="md" className="cb-neumo-card-soft">
                <Stack gap="sm">
                  <Flex align="center" justify="space-between" gap="sm" wrap="wrap">
                    <div>
                      <Text fw={700}>{assignment.title}</Text>
                      <Text size="sm" c="chatbox-secondary">
                        Status: {assignment.status}
                      </Text>
                    </div>
                    <Badge variant="light" color={assignment.color} radius="xl">
                      Score: {assignment.score}
                    </Badge>
                  </Flex>

                  <div>
                    <Flex align="center" justify="space-between" mb={6}>
                      <Text size="xs" fw={700} tt="uppercase" c="chatbox-tertiary">
                        Completion
                      </Text>
                      <Text size="sm" fw={600}>
                        {assignment.completion}%
                      </Text>
                    </Flex>
                    <Progress value={assignment.completion} color={assignment.color} radius="xl" />
                  </div>

                  <Text size="sm" c="chatbox-secondary">
                    {assignment.teacherNote}
                  </Text>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </SurfaceCard>

        <SurfaceCard
          title="Conversation starters for home"
          description="A parent view is most useful when it helps families ask better questions, not just inspect numbers."
        >
          <Stack gap="sm">
            <InsightRow
              icon={IconInfoCircle}
              title="Ask about the strongest prompt"
              body="“Which question helped you the most today?” encourages reflection instead of only asking whether homework is done."
            />
            <InsightRow
              icon={IconTarget}
              title="Focus on one next action"
              body="Use Planner activity to ask what the next small task is, rather than reopening the whole assignment."
            />
            <InsightRow
              icon={IconHome}
              title="Build routines around the best window"
              body="This sample data suggests after-school sessions are strongest, so families can protect that time for focused app use."
            />
          </Stack>
        </SurfaceCard>
      </SimpleGrid>
    </Stack>
  )
}

function SurfaceCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Paper withBorder radius="xl" p="lg" className="cb-neumo-card h-full">
      <Stack gap="md" h="100%">
        <div>
          <Title order={4}>{title}</Title>
          {description ? (
            <Text size="sm" c="chatbox-secondary" mt={6}>
              {description}
            </Text>
          ) : null}
        </div>
        <Divider />
        <div className="flex-1">{children}</div>
      </Stack>
    </Paper>
  )
}

function MetricCard({ data }: { data: MetricCardData }) {
  const Icon = data.icon

  return (
    <Paper withBorder radius="xl" p="lg" className="cb-neumo-card h-full">
      <Stack gap="sm">
        <ThemeIcon variant="light" color={data.color} radius="xl" size={42}>
          <Icon size={22} />
        </ThemeIcon>
        <div>
          <Text size="sm" fw={700} c="chatbox-secondary">
            {data.label}
          </Text>
          <Title order={3} mt={6}>
            {data.value}
          </Title>
        </div>
        <Text size="sm" c="chatbox-secondary">
          {data.detail}
        </Text>
      </Stack>
    </Paper>
  )
}

function LabeledValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="xs" fw={700} tt="uppercase" c="chatbox-tertiary" mb={4}>
        {label}
      </Text>
      <Text size="sm" c="chatbox-secondary">
        {value}
      </Text>
    </div>
  )
}

function InsightRow({ icon, title, body }: { icon: ElementType<IconProps>; title: string; body: string }) {
  const Icon = icon

  return (
    <Flex align="flex-start" gap="sm">
      <ThemeIcon variant="light" color="chatbox-brand" radius="xl" size={36}>
        <Icon size={18} />
      </ThemeIcon>
      <div>
        <Text fw={700}>{title}</Text>
        <Text size="sm" c="chatbox-secondary" mt={4}>
          {body}
        </Text>
      </div>
    </Flex>
  )
}

function MiniUseCaseCard({ label, detail, impact }: { label: string; detail: string; impact: string }) {
  return (
    <Paper withBorder radius="xl" p="md" className="cb-neumo-card-soft">
      <Stack gap={8}>
        <Text fw={700}>{label}</Text>
        <Text size="sm" c="chatbox-secondary">
          {detail}
        </Text>
        <Text size="sm">
          <Text span fw={700}>
            Why it matters:
          </Text>{' '}
          {impact}
        </Text>
      </Stack>
    </Paper>
  )
}

function DailyEngagementBar({ day, minutes, maxMinutes }: { day: string; minutes: number; maxMinutes: number }) {
  const height = Math.max(24, Math.round((minutes / maxMinutes) * 132))

  return (
    <div className="flex flex-col items-center gap-2">
      <Text size="sm" fw={700}>
        {minutes}m
      </Text>
      <div
        className="flex w-full items-end justify-center rounded-[18px] border border-chatbox-border-primary bg-[var(--chatbox-surface-inset)] px-2 py-2"
        style={{ minHeight: 150 }}
      >
        <div
          className="w-full rounded-[12px] bg-[var(--chatbox-background-brand-primary)] shadow-[0_10px_24px_rgba(45,127,249,0.24)]"
          style={{ height }}
        />
      </div>
      <Text size="xs" fw={700} tt="uppercase" c="chatbox-tertiary">
        {day}
      </Text>
    </div>
  )
}
