import { Alert, Badge, Box, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEmbeddedAppBridge } from '../useEmbeddedAppBridge'
import { buildFlashcardsCompletionSignal, buildStudyDeck, type DeterministicStudyDeck } from './deck'

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

  const handleReveal = useCallback(() => {
    if (!deck || !currentCard) {
      return
    }

    setRevealed(true)
    setReviewedIndices((current) => (current.includes(currentIndex) ? current : [...current, currentIndex]))
    sendState({
      status: 'active',
      summary: `Reviewed card ${currentIndex + 1} of ${deck.cards.length} for ${deck.topic}.`,
      state: {
        topic: deck.topic,
        cardCount: deck.cards.length,
        currentCard: currentIndex + 1,
        reviewedCount: reviewedIndices.includes(currentIndex) ? reviewedIndices.length : reviewedIndices.length + 1,
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
        reviewedCount: reviewedIndices.length,
      })
    )
  }, [deck, invocationMessage?.payload.toolCallId, reviewedIndices.length, runtimeContext, sendCompletion])

  return (
    <Box p="md" bg="linear-gradient(180deg, #fff7ed 0%, #ffffff 100%)" mih="100vh">
      <Stack gap="md">
        <Group justify="space-between">
          <div>
            <Title order={3}>Flashcards Coach</Title>
            <Text c="dimmed" size="sm">
              Public study cards that help students review a topic without leaving the chat.
            </Text>
          </div>
          <Badge color={deck ? 'teal' : 'blue'} variant="light">
            {deck ? `${reviewedIndices.length}/${deck.cards.length} reviewed` : 'Waiting'}
          </Badge>
        </Group>

        {!deck && (
          <Alert color="blue" variant="light">
            Waiting for the host to send a study topic.
          </Alert>
        )}

        {deck && currentCard && (
          <>
            <Paper withBorder radius="lg" p="md">
              <Stack gap="sm">
                <Text fw={700}>{deck.topic}</Text>
                <Text size="sm" c="dimmed">
                  {deck.studyTip}
                </Text>
                <Badge variant="light" color="orange" w="fit-content">
                  {currentCard.focus}
                </Badge>
                <Text fw={600}>{currentCard.question}</Text>
                {revealed ? (
                  <Alert color="teal" variant="light">
                    {currentCard.answer}
                  </Alert>
                ) : (
                  <Text size="sm" c="dimmed">
                    Reveal the answer when you are ready to check your understanding.
                  </Text>
                )}
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

            <Paper withBorder radius="lg" p="md">
              <Stack gap="xs">
                <Text fw={600}>Session summary</Text>
                <Text size="sm">{deck.summary}</Text>
                <Text size="sm" c="dimmed">
                  Reviewed {reviewedIndices.length} of {deck.cards.length} cards so far.
                </Text>
              </Stack>
            </Paper>
          </>
        )}
      </Stack>
    </Box>
  )
}
