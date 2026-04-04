import { Alert, Badge, Box, Button, Group, Paper, Progress, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEmbeddedAppBridge } from '../useEmbeddedAppBridge'
import { buildFlashcardsCompletionSignal, buildStudyDeck, type DeterministicStudyDeck } from './deck'

function getReviewPercent(reviewedCount: number, cardCount: number) {
  if (cardCount <= 0) {
    return 0
  }

  return Math.min(100, Math.round((reviewedCount / cardCount) * 100))
}

export function FlashcardsAppPage() {
  const { invocationMessage, runtimeContext, sendCompletion, sendState } = useEmbeddedAppBridge('flashcards.public')
  const [deck, setDeck] = useState<DeterministicStudyDeck | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [reviewedIndices, setReviewedIndices] = useState<number[]>([])

  useEffect(() => {
    if (!runtimeContext) {
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
  }, [runtimeContext, sendState])

  useEffect(() => {
    if (!invocationMessage || invocationMessage.payload.toolName !== 'flashcards.start-session' || !runtimeContext) {
      return
    }

    const nextDeck = buildStudyDeck(String(invocationMessage.payload.arguments.topic ?? 'fractions'))
    setDeck(nextDeck)
    setCurrentIndex(0)
    setRevealed(false)
    setReviewedIndices([])

    sendState({
      status: 'active',
      summary: nextDeck.summary,
      state: {
        topic: nextDeck.topic,
        cardCount: nextDeck.cards.length,
        currentCard: 1,
        reviewedCount: 0,
      },
      progress: {
        label: 'Card 1',
        percent: 20,
      },
    })
  }, [invocationMessage, runtimeContext, sendState])

  const currentCard = useMemo(() => {
    if (!deck) {
      return null
    }

    return deck.cards[currentIndex] ?? null
  }, [currentIndex, deck])

  const reviewedCount = reviewedIndices.length
  const reviewPercent = deck ? getReviewPercent(reviewedCount, deck.cards.length) : 0

  const handleReveal = useCallback(() => {
    if (!deck || !currentCard) {
      return
    }

    const nextReviewedCount = reviewedIndices.includes(currentIndex) ? reviewedIndices.length : reviewedIndices.length + 1

    setRevealed(true)
    setReviewedIndices((current) => (current.includes(currentIndex) ? current : [...current, currentIndex]))
    sendState({
      status: 'active',
      summary: `Reviewed card ${currentIndex + 1} of ${deck.cards.length} for ${deck.topic}.`,
      state: {
        topic: deck.topic,
        cardCount: deck.cards.length,
        currentCard: currentIndex + 1,
        reviewedCount: nextReviewedCount,
        currentFocus: currentCard.focus,
      },
      progress: {
        label: `Card ${currentIndex + 1}`,
        percent: Math.min(95, Math.round(((currentIndex + 1) / deck.cards.length) * 100)),
      },
    })
  }, [currentCard, currentIndex, deck, reviewedIndices, sendState])

  const handleNext = useCallback(() => {
    if (!deck) {
      return
    }

    const nextIndex = (currentIndex + 1) % deck.cards.length
    setCurrentIndex(nextIndex)
    setRevealed(false)
  }, [currentIndex, deck])

  const handleShare = useCallback(() => {
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
              Guided topic review that stays connected to the conversation and study progress.
            </Text>
          </div>
          <Badge color={deck ? 'teal' : 'blue'} variant="light">
            {deck ? `${reviewedCount}/${deck.cards.length} reviewed` : 'Waiting'}
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
          <>
            <Paper
              withBorder
              radius="xl"
              p="lg"
              style={{
                background: 'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.92) 100%)',
                borderColor: 'rgba(148, 163, 184, 0.22)',
              }}
            >
              <Stack gap="md">
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

                <Progress value={reviewPercent} radius="xl" color="blue" />

                <SimpleGrid cols={1} spacing="md">
                  <Paper
                    withBorder
                    radius="xl"
                    p="lg"
                    style={{
                      background: 'rgba(15, 23, 42, 0.82)',
                      borderColor: 'rgba(96, 165, 250, 0.22)',
                    }}
                  >
                    <Stack gap="sm">
                      <Text size="xs" tt="uppercase" fw={700} c="rgba(125,211,252,0.9)">
                        Prompt
                      </Text>
                      <Text fw={700} fz="lg" c="white">
                        {currentCard.question}
                      </Text>
                      <Text size="sm" c="rgba(226,232,240,0.7)">
                        {deck.studyTip}
                      </Text>
                    </Stack>
                  </Paper>

                  <Paper
                    withBorder
                    radius="xl"
                    p="lg"
                    style={{
                      background: revealed ? 'rgba(6, 78, 59, 0.24)' : 'rgba(15, 23, 42, 0.74)',
                      borderColor: revealed ? 'rgba(45, 212, 191, 0.28)' : 'rgba(148, 163, 184, 0.16)',
                    }}
                  >
                    <Stack gap="sm">
                      <Text size="xs" tt="uppercase" fw={700} c={revealed ? 'rgba(94,234,212,0.9)' : 'rgba(148,163,184,0.88)'}>
                        {revealed ? 'Answer revealed' : 'Answer hidden'}
                      </Text>
                      <Text c={revealed ? 'white' : 'rgba(226,232,240,0.72)'} fz="md">
                        {revealed ? currentCard.answer : 'Reveal the answer when you are ready to check your understanding.'}
                      </Text>
                    </Stack>
                  </Paper>
                </SimpleGrid>

                <Group>
                  <Button onClick={handleReveal}>{revealed ? 'Reviewed' : 'Reveal answer'}</Button>
                  <Button variant="default" onClick={handleNext}>
                    Next card
                  </Button>
                  <Button variant="light" onClick={handleShare}>
                    Send study summary to chat
                  </Button>
                </Group>
              </Stack>
            </Paper>

            <Paper
              withBorder
              radius="xl"
              p="lg"
              style={{
                background: 'linear-gradient(180deg, rgba(15,23,42,0.9) 0%, rgba(17,24,39,0.84) 100%)',
                borderColor: 'rgba(148, 163, 184, 0.16)',
              }}
            >
              <Stack gap="xs">
                <Text fw={600} c="white">
                  Session summary
                </Text>
                <Text size="sm" c="rgba(226,232,240,0.78)">
                  {deck.summary}
                </Text>
                <Text size="sm" c="rgba(148,163,184,0.82)">
                  Reviewed {reviewedCount} of {deck.cards.length} cards so far.
                </Text>
              </Stack>
            </Paper>
          </>
        )}
      </Stack>
    </Box>
  )
}
