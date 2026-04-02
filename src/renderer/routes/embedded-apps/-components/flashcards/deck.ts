import type { CompletionSignal } from '@shared/contracts/v1'

export type StudyCard = {
  id: string
  focus: string
  question: string
  answer: string
}

export type DeterministicStudyDeck = {
  topic: string
  cards: StudyCard[]
  summary: string
  studyTip: string
}

function hashTopic(topic: string) {
  return Array.from(topic).reduce((total, character) => total + character.charCodeAt(0), 0)
}

export function buildStudyDeck(rawTopic: string): DeterministicStudyDeck {
  const topic = rawTopic.trim() || 'fractions'
  const hash = hashTopic(topic.toLowerCase())
  const tones = ['definition', 'example', 'compare', 'mistake-check', 'memory cue']
  const studyTips = [
    'Start by saying each answer out loud before flipping to the next card.',
    'Explain each answer in your own words before moving on.',
    'Connect each card to a class example or homework problem.',
  ]

  const cards: StudyCard[] = tones.map((tone, index) => ({
    id: `${topic.replace(/\s+/gu, '-').toLowerCase()}-${index + 1}`,
    focus: tone,
    question:
      tone === 'definition'
        ? `What is the clearest definition of ${topic}?`
        : tone === 'example'
          ? `Give one classroom-ready example of ${topic}.`
          : tone === 'compare'
            ? `What is an important comparison or contrast involving ${topic}?`
            : tone === 'mistake-check'
              ? `What is a common mistake students make with ${topic}?`
              : `What memory cue would help a student remember ${topic}?`,
    answer:
      tone === 'definition'
        ? `${topic} is the core idea the student should be able to explain in one or two clear sentences.`
        : tone === 'example'
          ? `A strong example of ${topic} should connect the concept to a real problem, worked step, or familiar classroom scenario.`
          : tone === 'compare'
            ? `${topic} becomes easier when compared with a nearby concept so the student can see what changes and what stays the same.`
            : tone === 'mistake-check'
              ? `Students often rush ${topic} by memorizing steps without checking why the idea works, which leads to avoidable mistakes.`
              : `A short phrase, sketch, or verbal hook tied to ${topic} usually makes recall much easier on the next review round.`,
  }))

  return {
    topic,
    cards,
    summary: `Flashcards ready for ${topic} with ${cards.length} study prompts.`,
    studyTip: studyTips[hash % studyTips.length],
  }
}

export function buildFlashcardsCompletionSignal(input: {
  conversationId: string
  appSessionId: string
  toolCallId?: string
  deck: DeterministicStudyDeck
  reviewedCount: number
}): CompletionSignal {
  return {
    version: 'v1',
    conversationId: input.conversationId,
    appSessionId: input.appSessionId,
    appId: 'flashcards.public',
    toolCallId: input.toolCallId,
    status: 'succeeded',
    resultSummary: `Flashcard session on ${input.deck.topic} is ready with ${input.deck.cards.length} cards.`,
    result: {
      topic: input.deck.topic,
      cardCount: input.deck.cards.length,
      reviewedCount: input.reviewedCount,
    },
    completedAt: new Date().toISOString(),
    followUpContext: {
      summary: 'Use the flashcard deck to quiz the student, reinforce the topic, or choose the next study step.',
      userVisibleSummary: `Flashcards on ${input.deck.topic} are ready in chat.`,
      recommendedPrompts: ['Quiz me on this topic.', 'Which card should I review first?'],
      stateDigest: {
        topic: input.deck.topic,
        cardCount: input.deck.cards.length,
        reviewedCount: input.reviewedCount,
      },
    },
  }
}
