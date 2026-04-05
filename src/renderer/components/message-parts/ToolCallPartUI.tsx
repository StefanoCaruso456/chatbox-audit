import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Collapse,
  Group,
  Paper,
  SimpleGrid,
  Space,
  Stack,
  Text,
} from '@mantine/core'
import {
  createMessage,
  type Message,
  type MessageReasoningPart,
  type MessageToolCallPart,
  MessageToolCallPartSchema,
} from '@shared/types'
import {
  IconArrowRight,
  IconBulb,
  IconChevronRight,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconCode,
  IconCopy,
  IconLoader,
  IconTool,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { type FC, type ReactNode, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import z from 'zod'
import { formatElapsedTime, useThinkingTimer } from '@/hooks/useThinkingTimer'
import { cn } from '@/lib/utils'
import { getToolName } from '@/packages/tools'
import type { SearchResultItem } from '@/packages/web-search'
import { submitNewUserMessage } from '@/stores/sessionActions'
import * as toastActions from '@/stores/toastActions'
import { ScalableIcon } from '../common/ScalableIcon'

const ToolCallHeader: FC<{ part: MessageToolCallPart; action: ReactNode; onClick: () => void }> = (props) => {
  return (
    <Paper withBorder radius="md" px="xs" onClick={props.onClick} className="cursor-pointer group">
      <Group justify="space-between" className="w-full">
        <Group gap="xs">
          <Text fw={600}>{getToolName(props.part.toolName)}</Text>
          <ScalableIcon icon={IconTool} color="var(--chatbox-tint-success)" />
          {props.part.state === 'call' ? (
            <ScalableIcon icon={IconLoader} className="animate-spin" color="var(--chatbox-tint-brand)" />
          ) : props.part.state === 'error' ? (
            <ScalableIcon icon={IconCircleXFilled} color="var(--chatbox-tint-error)" />
          ) : (
            <ScalableIcon icon={IconCircleCheckFilled} color="var(--chatbox-tint-success)" />
          )}
        </Group>
        <Space miw="xl" />
        {props.action}
      </Group>
    </Paper>
  )
}

const WebBrowsingToolCallPartSchema = MessageToolCallPartSchema.extend({
  toolName: z.literal('web_search'),
  args: z.object({
    query: z.string(),
  }),
  result: z
    .object({
      query: z.string(),
      searchResults: z.array(
        z.object({
          title: z.string(),
          snippet: z.string(),
          link: z.string(),
        })
      ),
    })
    .optional(),
})

type WebBrowsingToolCallPart = MessageToolCallPart<
  { query: string },
  { query: string; searchResults: SearchResultItem[] }
>

const getSafeExternalHref = (raw: string): string | null => {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (!/^https?:\/\//i.test(trimmed)) {
    return null
  }

  try {
    return new URL(trimmed).toString()
  } catch (_error) {
    const encoded = trimmed.replace(/%(?![0-9A-Fa-f]{2})/g, '%25')
    try {
      return new URL(encoded).toString()
    } catch (_innerError) {
      return null
    }
  }
}

const SearchResultCard: FC<{ index: number; result: SearchResultItem }> = ({ index, result }) => {
  const href = getSafeExternalHref(result.link)

  const content = (
    <Paper radius="md" p={8} bg={'var(--chatbox-background-gray-secondary)'} maw={200} title={result.title}>
      <Text size="sm" truncate="end" m={0}>
        <b>{index + 1}.</b> {result.title}
      </Text>
      <Text size="xs" truncate="end" c="chatbox-tertiary" m={0} mt={4}>
        {result.link}
      </Text>
    </Paper>
  )

  if (!href) {
    return content
  }

  return (
    <Box component="a" href={href} target="_blank" rel="noopener noreferrer" className="no-underline">
      {content}
    </Box>
  )
}

const WebSearchToolCallUI: FC<{ part: WebBrowsingToolCallPart }> = ({ part }) => {
  const { t } = useTranslation()
  const [expaned, setExpand] = useState(false)
  return (
    <Stack gap="xs" mb="xs">
      <ToolCallHeader
        part={part}
        onClick={() => setExpand((prev) => !prev)}
        action={
          <ScalableIcon icon={IconChevronRight} className={clsx('transition-transform', expaned ? 'rotate-90' : '')} />
        }
      />
      <Collapse in={expaned}>
        <Stack gap="xs">
          <Group gap="xs" my={2}>
            <Text c="chatbox-tertiary" m={0}>
              {t('Search query')}:
            </Text>
            <Text fw={600} size="sm" m={0} fs="italic">
              {part.args.query}
            </Text>
          </Group>
          {part.result && (
            <SimpleGrid cols={{ sm: 3, md: 4 }} spacing="xs">
              {part.result.searchResults.map((result, index) => (
                <SearchResultCard key={result.link} index={index} result={result} />
              ))}
            </SimpleGrid>
          )}
        </Stack>
      </Collapse>
      <Collapse in={!expaned}>
        {part.result && (
          <Group gap="xs" wrap="nowrap" className="overflow-x-auto" pb="xs">
            {part.result.searchResults.map((result, index) => (
              <SearchResultCard key={result.link} index={index} result={result} />
            ))}
          </Group>
        )}
      </Collapse>
    </Stack>
  )
}

const ChessBoardStateResultSchema = z
  .object({
    turn: z.enum(['white', 'black']),
    phase: z.string(),
    lastMove: z.string(),
    status: z.string(),
    candidateMoves: z.array(z.string()).default([]),
    moveExecutionAvailable: z.boolean().default(false),
    recommendedMove: z.string().nullable().optional(),
    recommendationReason: z.string().nullable().optional(),
    coachingTip: z.string().nullable().optional(),
    alternativeMoves: z.array(z.string()).default([]),
  })
  .passthrough()

const ChessBoardStateToolCallPartSchema = MessageToolCallPartSchema.extend({
  toolName: z.literal('chess.get-board-state'),
  result: ChessBoardStateResultSchema.optional(),
})

type ChessBoardStateToolCallPart = MessageToolCallPart<
  { scope?: string },
  z.infer<typeof ChessBoardStateResultSchema>
>

const ChessMoveResultSchema = z
  .object({
    appliedMove: z.string(),
    turn: z.enum(['white', 'black']),
    summary: z.string(),
    explanation: z.string(),
    coachingTip: z.string().nullable().optional(),
    strategicTheme: z.string().nullable().optional(),
    alternativeMoves: z.array(z.string()).default([]),
  })
  .passthrough()

const ChessMoveToolCallPartSchema = MessageToolCallPartSchema.extend({
  toolName: z.literal('chess.make-move'),
  result: ChessMoveResultSchema.optional(),
})

type ChessMoveToolCallPart = MessageToolCallPart<
  { move?: string; expectedFen?: string },
  z.infer<typeof ChessMoveResultSchema>
>

type ChessCoachAction = {
  label: string
  prompt: string
  primary?: boolean
}

function titleCaseChessTurn(turn: 'white' | 'black') {
  return turn[0].toUpperCase() + turn.slice(1)
}

function buildChessCoachActionLabelPromptSet(input: {
  recommendedMove?: string | null
  alternativeMoves?: string[]
  turn: 'white' | 'black'
  moveExecutionAvailable?: boolean
}) {
  const recommendedMove = input.recommendedMove?.trim() || null
  const sideToMove = titleCaseChessTurn(input.turn)

  const actions: ChessCoachAction[] = []
  if (recommendedMove && input.moveExecutionAvailable) {
    actions.push({
      label: `Play ${recommendedMove}`,
      prompt: `play ${recommendedMove}`,
      primary: true,
    })
  }

  if (recommendedMove) {
    actions.push({
      label: `Why ${recommendedMove}?`,
      prompt: `Why is ${recommendedMove} recommended here? Teach it like a chess coach.`,
    })
    actions.push({
      label: 'Explain for beginner',
      prompt: `Explain why ${recommendedMove} is recommended here for a beginner chess player.`,
    })
    actions.push({
      label: `Plan for ${sideToMove}`,
      prompt: `What is the plan after ${recommendedMove} for ${sideToMove}?`,
    })
  }

  if ((input.alternativeMoves?.length ?? 0) > 0) {
    actions.push({
      label: 'Show alternatives',
      prompt: `Show me the top 2 alternatives to ${recommendedMove ?? 'the best move'} here and explain the tradeoffs.`,
    })
  }

  return actions.slice(0, 4)
}

function buildChessMoveFollowUpActions(result: z.infer<typeof ChessMoveResultSchema>) {
  const sideToMove = titleCaseChessTurn(result.turn)

  return [
    {
      label: `Best reply for ${sideToMove}`,
      prompt: `What should ${sideToMove} play here? Teach the idea first, then recommend the best move.`,
      primary: true,
    },
    {
      label: `Why ${result.appliedMove}?`,
      prompt: `Why was ${result.appliedMove} a strong move here? Explain the strategic idea like a chess coach.`,
    },
    {
      label: 'Explain for beginner',
      prompt: `Explain the idea behind ${result.appliedMove} for a beginner chess player.`,
    },
    {
      label: 'Show alternatives',
      prompt: `What were the top 2 alternatives to ${result.appliedMove} here, and what were their tradeoffs?`,
    },
  ] satisfies ChessCoachAction[]
}

const ChessCoachActionButtons: FC<{
  sessionId: string
  actions: ChessCoachAction[]
}> = ({ sessionId, actions }) => {
  const [submittingPrompt, setSubmittingPrompt] = useState<string | null>(null)

  const onActionClick = useCallback(
    async (prompt: string) => {
      if (submittingPrompt) {
        return
      }

      setSubmittingPrompt(prompt)
      try {
        await submitNewUserMessage(sessionId, {
          newUserMsg: createMessage('user', prompt),
          needGenerating: true,
        })
      } catch (error) {
        console.error('Failed to submit chess coach prompt', error)
        toastActions.add((error as Error)?.message || 'Failed to send chess coach prompt.')
      } finally {
        setSubmittingPrompt(null)
      }
    },
    [sessionId, submittingPrompt]
  )

  return (
    <Group gap="xs" wrap="wrap">
      {actions.map((action) => (
        <Button
          key={action.label}
          size="compact-sm"
          radius="xl"
          variant={action.primary ? 'filled' : 'light'}
          loading={submittingPrompt === action.prompt}
          onClick={() => void onActionClick(action.prompt)}
        >
          {action.label}
        </Button>
      ))}
    </Group>
  )
}

const ChessCoachCard: FC<{
  eyebrow: string
  phase?: string
  turn: 'white' | 'black'
  headline: string
  body: string
  coachingTip?: string | null
  alternatives?: string[]
  sessionId: string
  actions: ChessCoachAction[]
}> = ({ eyebrow, phase, turn, headline, body, coachingTip, alternatives = [], sessionId, actions }) => {
  return (
    <Paper withBorder radius="lg" p="sm" mb="xs" bg="var(--chatbox-background-gray-secondary)">
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Badge variant="light" color="blue">
              Chess Coach
            </Badge>
            {phase ? (
              <Badge variant="outline" color="gray">
                {phase}
              </Badge>
            ) : null}
          </Group>
          <Badge variant="light" color={turn === 'white' ? 'indigo' : 'dark'}>
            {titleCaseChessTurn(turn)} to move
          </Badge>
        </Group>

        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            {eyebrow}
          </Text>
          <Text size="lg" fw={700}>
            {headline}
          </Text>
        </div>

        <Text size="sm">{body}</Text>

        {coachingTip ? (
          <Paper radius="md" p="xs" bg="var(--chatbox-background-brand-secondary)">
            <Text size="xs" fw={700} c="chatbox-brand" mb={4}>
              Coach note
            </Text>
            <Text size="sm">{coachingTip}</Text>
          </Paper>
        ) : null}

        {alternatives.length > 0 ? (
          <Group gap="xs" wrap="wrap">
            <Text size="xs" c="dimmed">
              Alternatives:
            </Text>
            {alternatives.map((move) => (
              <Badge key={move} variant="outline" color="gray">
                {move}
              </Badge>
            ))}
          </Group>
        ) : null}

        <ChessCoachActionButtons sessionId={sessionId} actions={actions} />
      </Stack>
    </Paper>
  )
}

const ChessBoardStateToolCallUI: FC<{ part: ChessBoardStateToolCallPart; sessionId: string }> = ({ part, sessionId }) => {
  if (!part.result) {
    return <GeneralToolCallUI part={part} />
  }

  const recommendedMove = part.result.recommendedMove ?? part.result.candidateMoves[0] ?? null
  const recommendationReason =
    part.result.recommendationReason ??
    (recommendedMove ? `${recommendedMove} improves the position with a clear strategic idea.` : 'No clear move available.')

  return (
    <ChessCoachCard
      sessionId={sessionId}
      eyebrow="Recommended move"
      phase={part.result.phase}
      turn={part.result.turn}
      headline={recommendedMove ?? 'Review the board'}
      body={`Best practice right now: ${recommendedMove ?? 'No clear move available'}. ${recommendationReason}`}
      coachingTip={part.result.coachingTip}
      alternatives={part.result.alternativeMoves}
      actions={buildChessCoachActionLabelPromptSet({
        recommendedMove,
        alternativeMoves: part.result.alternativeMoves,
        turn: part.result.turn,
        moveExecutionAvailable: part.result.moveExecutionAvailable,
      })}
    />
  )
}

const ChessMoveToolCallUI: FC<{ part: ChessMoveToolCallPart; sessionId: string }> = ({ part, sessionId }) => {
  if (!part.result) {
    return <GeneralToolCallUI part={part} />
  }

  return (
    <ChessCoachCard
      sessionId={sessionId}
      eyebrow="Move played"
      turn={part.result.turn}
      headline={part.result.appliedMove}
      body={`${part.result.summary} Why it works: ${part.result.explanation}${
        part.result.strategicTheme ? ` Strategic theme: ${part.result.strategicTheme}.` : ''
      }`}
      coachingTip={part.result.coachingTip}
      alternatives={part.result.alternativeMoves}
      actions={buildChessMoveFollowUpActions(part.result)}
    />
  )
}

const GeneralToolCallUI: FC<{ part: MessageToolCallPart }> = ({ part }) => {
  const { t } = useTranslation()
  const [expaned, setExpand] = useState(false)
  return (
    <Stack gap="xs" mb="xs">
      <ToolCallHeader
        part={part}
        onClick={() => setExpand((prev) => !prev)}
        action={
          <ScalableIcon icon={IconChevronRight} className={clsx('transition-transform', expaned ? 'rotate-90' : '')} />
        }
      />

      <Collapse in={expaned}>
        <Paper withBorder radius="md" p="sm">
          <Stack gap="xs">
            <Group gap="xs" c="chatbox-tertiary">
              <ScalableIcon icon={IconCode} />
              <Text fw={600} size="xs" c="chatbox-tertiary" m="0">
                {t('Arguments')}
              </Text>
            </Group>
            <Box>
              <Code block>{JSON.stringify(part.args, null, 2)}</Code>
            </Box>
          </Stack>
          {!!part.result && (
            <Stack gap="xs" className="mt-2">
              <Group gap="xs" c="chatbox-tertiary">
                <ScalableIcon icon={IconArrowRight} />
                <Text fw={600} size="xs" c="chatbox-tertiary" m="0">
                  {t('Result')}
                </Text>
              </Group>
              <Box>
                <Code block>{JSON.stringify(part.result, null, 2)}</Code>
              </Box>
            </Stack>
          )}
        </Paper>
      </Collapse>
    </Stack>
  )
}

export const ToolCallPartUI: FC<{ part: MessageToolCallPart; sessionId: string }> = ({ part, sessionId }) => {
  if (part.toolName === 'web_search') {
    const parsedPart = WebBrowsingToolCallPartSchema.safeParse(part)
    if (parsedPart.success) {
      return <WebSearchToolCallUI part={parsedPart.data as WebBrowsingToolCallPart} />
    }
  }

  if (part.toolName === 'chess.get-board-state') {
    const parsedPart = ChessBoardStateToolCallPartSchema.safeParse(part)
    if (parsedPart.success) {
      return <ChessBoardStateToolCallUI part={parsedPart.data as ChessBoardStateToolCallPart} sessionId={sessionId} />
    }
  }

  if (part.toolName === 'chess.make-move') {
    const parsedPart = ChessMoveToolCallPartSchema.safeParse(part)
    if (parsedPart.success) {
      return <ChessMoveToolCallUI part={parsedPart.data as ChessMoveToolCallPart} sessionId={sessionId} />
    }
  }

  return <GeneralToolCallUI part={part} />
}

export const ReasoningContentUI: FC<{
  message: Message
  part?: MessageReasoningPart
  onCopyReasoningContent: (content: string) => (e: React.MouseEvent<HTMLButtonElement>) => void
}> = ({ message, part, onCopyReasoningContent }) => {
  const reasoningContent = part?.text || message.reasoningContent || ''
  const { t } = useTranslation()
  const isThinking =
    (message.generating &&
      part &&
      message.contentParts &&
      message.contentParts.length > 0 &&
      message.contentParts[message.contentParts.length - 1] === part) ||
    false
  const [isExpanded, setIsExpanded] = useState<boolean>(false)

  // Timer state management:
  // - elapsedTime: Real-time updates while thinking is active (updates every 100ms)
  // - isThinking: True when message is generating AND this reasoning part is the last content part
  // - shouldShowTimer: Only show timer for streaming responses, hide for non-streaming
  const elapsedTime = useThinkingTimer(part?.startTime, isThinking)
  const shouldShowTimer = message.isStreamingMode === true // Show timer only when explicitly marked as streaming

  // Timer display logic with clear priority order:
  // 1. If we have a final duration (thinking completed), always show it (persistent display)
  // 2. If actively thinking and we have elapsed time, show real-time updates
  // 3. Otherwise show 0 (fallback for edge cases)
  // This ensures the timer stops immediately when thinking ends and persists the final duration
  const displayTime =
    part?.duration && part.duration > 0 ? part.duration : isThinking && elapsedTime > 0 ? elapsedTime : 0

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  return (
    <Paper withBorder radius="md" mb="xs">
      <Box onClick={toggleExpanded} className="cursor-pointer group">
        <Group px="xs" justify="space-between" className="w-full">
          <Group gap="xs" className={cn(isThinking ? 'animate-pulse' : '')}>
            <ScalableIcon icon={IconBulb} color="var(--chatbox-tint-warning)" />
            <Text fw={600} size="sm">
              {isThinking ? t('Thinking') : t('Deeply thought')}
            </Text>
            {reasoningContent.length > 0 && shouldShowTimer && (
              <Text size="xs" c="chatbox-tertiary">
                ({formatElapsedTime(displayTime)})
              </Text>
            )}
          </Group>
          <Space miw="xl" />
          <Group gap="xs">
            <ActionIcon
              variant="subtle"
              c="chatbox-gray"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onCopyReasoningContent(reasoningContent)(e)
              }}
              aria-label={t('Copy reasoning content')}
            >
              <ScalableIcon icon={IconCopy} />
            </ActionIcon>

            <ScalableIcon
              icon={IconChevronRight}
              className={clsx('transition-transform', isExpanded ? 'rotate-90' : '')}
            />
          </Group>
        </Group>
      </Box>

      <Collapse in={isExpanded}>
        <Box
          style={{
            borderTop: '1px solid var(--paper-border-color)',
          }}
        >
          <Text size="sm" px={'sm'} style={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>
            {reasoningContent}
          </Text>
        </Box>
      </Collapse>
    </Paper>
  )
}
