import { Alert, Badge, Box, Button, Group, Paper, Progress, Stack, Text, Title } from '@mantine/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEmbeddedAppBridge } from '../useEmbeddedAppBridge'
import { buildFlashcardsCompletionSignal, buildStudyDeck, type DeterministicStudyDeck } from './deck'

type FlashcardsSessionSeed = {
  topic: string
  currentCard: number
  reviewedCardIds: string[]
  reviewedCount: number
}

function getReviewPercent(reviewedCount: number, cardCount: number) {
  if (cardCount <= 0) {
    return 0
  }

  return Math.min(100, Math.round((reviewedCount / cardCount) * 100))
}

function getSeedTopic(initialState: Record<string, unknown> | undefined, invocationMessage: unknown) {
  if (
    invocationMessage &&
    typeof invocationMessage === 'object' &&
    'payload' in invocationMessage &&
    invocationMessage.payload &&
    typeof invocationMessage.payload === 'object' &&
    'toolName' in invocationMessage.payload &&
    invocationMessage.payload.toolName === 'flashcards.start-session' &&
    'arguments' in invocationMessage.payload &&
    invocationMessage.payload.arguments &&
    typeof invocationMessage.payload.arguments === 'object' &&
    'topic' in invocationMessage.payload.arguments
  ) {
    const topic = String(invocationMessage.payload.arguments.topic ?? '').trim()
    return topic || 'fractions'
  }

  if (initialState) {
    if (typeof initialState.topic === 'string' && initialState.topic.trim()) {
      return initialState.topic.trim()
    }

    const toolArguments = initialState.toolArguments
    if (toolArguments && typeof toolArguments === 'object' && 'topic' in toolArguments) {
      const topic = String(toolArguments.topic ?? '').trim()
      return topic || 'fractions'
    }
  }

  if (typeof window !== 'undefined') {
    const topic = new URLSearchParams(window.location.search).get('topic')?.trim()
    if (topic) {
      return topic
    }
  }

  return null
}

function normalizeCount(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(0, Math.floor(value))
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .filter((entry, index, items) => items.indexOf(entry) === index)
}

function getFlashcardsSessionSeed(input: {
  initialState?: Record<string, unknown>
  invocationMessage: unknown
}): FlashcardsSessionSeed | null {
  const topic = getSeedTopic(input.initialState, input.invocationMessage)
  if (!topic) {
    return null
  }

  return {
    topic,
    currentCard: Math.max(1, normalizeCount(input.initialState?.currentCard, 1)),
    reviewedCardIds: normalizeStringArray(input.initialState?.reviewedCardIds),
    reviewedCount: normalizeCount(input.initialState?.reviewedCount, 0),
  }
}

function buildReviewedCardIds(deck: DeterministicStudyDeck, seed: FlashcardsSessionSeed) {
  const validCardIds = new Set(deck.cards.map((card) => card.id))
  const restoredIds = seed.reviewedCardIds.filter((cardId) => validCardIds.has(cardId))

  if (restoredIds.length > 0) {
    return restoredIds
  }

  return deck.cards.slice(0, Math.min(seed.reviewedCount, deck.cards.length)).map((card) => card.id)
}

function buildFlashcardsSummary(input: {
  deck: DeterministicStudyDeck
  currentIndex: number
  revealed: boolean
  reviewedCount: number
}) {
  const currentCard = input.deck.cards[input.currentIndex]
  const answerState = input.revealed ? 'answer revealed' : 'answer hidden'
  return `${input.deck.topic} flashcards on card ${input.currentIndex + 1} of ${input.deck.cards.length}. Focus: ${currentCard.focus}. ${answerState}. ${input.reviewedCount} reviewed.`
}

export function FlashcardsAppPage() {
  const { invocationMessage, runtimeContext, sendCompletion, sendState } = useEmbeddedAppBridge('flashcards.public')
  const [deck, setDeck] = useState<DeterministicStudyDeck | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [reviewedCardIds, setReviewedCardIds] = useState<string[]>([])
  const sessionSeed = useMemo(
    () =>
      getFlashcardsSessionSeed({
        initialState:
          runtimeContext?.initialState && typeof runtimeContext.initialState === 'object'
            ? (runtimeContext.initialState as Record<string, unknown>)
            : undefined,
        invocationMessage,
      }),
    [invocationMessage, runtimeContext?.initialState]
  )

  useEffect(() => {
    if (!runtimeContext || sessionSeed) {
      return
    }

    sendState({
      status: 'waiting-user',
      summary: 'Flashcards Coach is ready. Waiting for a topic to study.',
      state: {
        status: 'idle',
      },
      progress: {
        label: 'Ready',
        percent: 0,
      },
    })
  }, [runtimeContext, sendState, sessionSeed])

  useEffect(() => {
    if (!sessionSeed) {
      return
    }

    const nextDeck = buildStudyDeck(sessionSeed.topic)
    const nextCurrentIndex = Math.min(Math.max(0, sessionSeed.currentCard - 1), nextDeck.cards.length - 1)

    setDeck(nextDeck)
    setCurrentIndex(nextCurrentIndex)
    setRevealed(false)
    setReviewedCardIds(buildReviewedCardIds(nextDeck, sessionSeed))
  }, [sessionSeed])

  const currentCard = useMemo(() => {
    if (!deck) {
      return null
    }

    return deck.cards[currentIndex] ?? null
  }, [currentIndex, deck])

  const reviewedCount = reviewedCardIds.length
  const reviewPercent = deck ? getReviewPercent(reviewedCount, deck.cards.length) : 0
  const currentCardNumber = currentIndex + 1
  const canMovePrevious = currentIndex > 0
  const canMoveNext = Boolean(deck) && currentIndex < deck.cards.length - 1

  useEffect(() => {
    if (!runtimeContext || !deck || !currentCard) {
      return
    }

    sendState({
      status: 'active',
      summary: buildFlashcardsSummary({
        deck,
        currentIndex,
        revealed,
        reviewedCount,
      }),
      state: {
        topic: deck.topic,
        cardCount: deck.cards.length,
        currentCard: currentCardNumber,
        currentCardId: currentCard.id,
        currentFocus: currentCard.focus,
        currentPrompt: currentCard.question,
        currentAnswer: currentCard.answer,
        answerRevealed: revealed,
        reviewedCount,
        reviewedCardIds,
        remainingCount: Math.max(0, deck.cards.length - reviewedCount),
        studyTip: deck.studyTip,
        canMovePrevious,
        canMoveNext,
        availableActions: ['previous-card', revealed ? 'hide-answer' : 'reveal-answer', 'next-card', 'finish-session'],
      },
      progress: {
        label: `Card ${currentCardNumber} of ${deck.cards.length}`,
        percent: Math.round((currentCardNumber / deck.cards.length) * 100),
      },
    })
  }, [
    canMoveNext,
    canMovePrevious,
    currentCard,
    currentCardNumber,
    currentIndex,
    deck,
    revealed,
    reviewedCardIds,
    reviewedCount,
    runtimeContext,
    sendState,
  ])

  const handleToggleReveal = useCallback(() => {
    if (!currentCard) {
      return
    }

    setRevealed((current) => !current)
    setReviewedCardIds((current) => (current.includes(currentCard.id) ? current : [...current, currentCard.id]))
  }, [currentCard])

  const handlePrevious = useCallback(() => {
    setCurrentIndex((current) => Math.max(0, current - 1))
    setRevealed(false)
  }, [])

  const handleNext = useCallback(() => {
    if (!deck) {
      return
    }

    setCurrentIndex((current) => Math.min(deck.cards.length - 1, current + 1))
    setRevealed(false)
  }, [deck])

  const handleFinish = useCallback(() => {
    if (!deck || !runtimeContext) {
      return
    }

    sendCompletion(
      buildFlashcardsCompletionSignal({
        conversationId: runtimeContext.conversationId,
        appSessionId: runtimeContext.appSessionId,
        toolCallId: invocationMessage?.payload.toolCallId,
        deck,
        reviewedCount,
      })
    )
  }, [deck, invocationMessage?.payload.toolCallId, reviewedCount, runtimeContext, sendCompletion])

  return (
    <Box
      data-testid="flashcards-app-root"
      p="md"
      mih="100vh"
      c="#e5eefb"
      style={{
        background: 'linear-gradient(180deg, #071120 0%, #0f172a 52%, #111827 100%)',
        overflowX: 'hidden',
      }}
    >
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={3} c="white">
              Flashcards Coach
            </Title>
            <Text c="rgba(226,232,240,0.78)" size="sm">
              Review the live card here while TutorMeAI keeps the session synced with the conversation.
            </Text>
          </div>
          <Badge color={deck ? 'teal' : 'blue'} variant="light">
            {deck ? `Card ${currentCardNumber}/${deck.cards.length}` : 'Waiting'}
          </Badge>
        </Group>

        {!deck && (
          <Paper
            withBorder
            radius="xl"
            p="lg"
            style={{
              background: 'linear-gradient(180deg, rgba(15,23,42,0.94) 0%, rgba(17,24,39,0.88) 100%)',
              borderColor: 'rgba(96, 165, 250, 0.18)',
            }}
          >
            <Stack gap="sm">
              <Alert color="blue" variant="light">
                Waiting for the host to send a study topic.
              </Alert>
              <Text size="sm" c="rgba(226,232,240,0.74)">
                When TutorMeAI starts a flashcard session, the deck, progress, and completion summary will appear here.
              </Text>
            </Stack>
          </Paper>
        )}

        {deck && currentCard && (
          <Paper
            withBorder
            radius="xl"
            p="lg"
            style={{
              background: 'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.92) 100%)',
              borderColor: 'rgba(148, 163, 184, 0.22)',
            }}
          >
            <Stack gap="lg">
              <Group justify="space-between" align="center">
                <Stack gap={2}>
                  <Text size="xs" tt="uppercase" fw={700} c="rgba(148,163,184,0.9)">
                    Current deck
                  </Text>
                  <Text fw={700} c="white">
                    {deck.topic}
                  </Text>
                </Stack>
                <Badge variant="light" color="orange">
                  {currentCard.focus}
                </Badge>
              </Group>

              <Stack gap="xs">
                <Progress value={reviewPercent} radius="xl" color="blue" />
                <Group justify="space-between" gap="sm">
                  <Text size="sm" c="rgba(226,232,240,0.82)">
                    Reviewed {reviewedCount} of {deck.cards.length} cards
                  </Text>
                  <Text size="sm" c="rgba(148,163,184,0.82)">
                    {deck.studyTip}
                  </Text>
                </Group>
              </Stack>

              <Paper
                withBorder
                radius="xl"
                p="xl"
                style={{
                  background: 'linear-gradient(180deg, rgba(8,15,32,0.92) 0%, rgba(15,23,42,0.86) 100%)',
                  borderColor: revealed ? 'rgba(45, 212, 191, 0.28)' : 'rgba(96, 165, 250, 0.22)',
                }}
              >
                <Stack gap="lg">
                  <Stack gap="sm">
                    <Text size="xs" tt="uppercase" fw={700} c="rgba(125,211,252,0.9)">
                      Prompt
                    </Text>
                    <Text fw={700} fz="xl" c="white">
                      {currentCard.question}
                    </Text>
                  </Stack>

                  <Stack
                    gap="sm"
                    style={{
                      paddingTop: '1rem',
                      borderTop: '1px solid rgba(148, 163, 184, 0.16)',
                    }}
                  >
                    <Text size="xs" tt="uppercase" fw={700} c={revealed ? 'rgba(94,234,212,0.9)' : 'rgba(148,163,184,0.88)'}>
                      {revealed ? 'Answer' : 'Answer hidden'}
                    </Text>
                    <Text c={revealed ? 'white' : 'rgba(226,232,240,0.72)'} fz="md">
                      {revealed ? currentCard.answer : 'Reveal the answer when you are ready to check your understanding.'}
                    </Text>
                  </Stack>
                </Stack>
              </Paper>

              <Group gap="sm" wrap="wrap">
                <Button variant="default" onClick={handlePrevious} disabled={!canMovePrevious}>
                  Previous card
                </Button>
                <Button onClick={handleToggleReveal}>{revealed ? 'Hide answer' : 'Reveal answer'}</Button>
                <Button variant="default" onClick={handleNext} disabled={!canMoveNext}>
                  Next card
                </Button>
                <Button variant="light" onClick={handleFinish}>
                  Finish session
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Box>
  )
}
