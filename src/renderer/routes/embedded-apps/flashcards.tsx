import { createFileRoute } from '@tanstack/react-router'
import { FlashcardsAppPage } from './-components/flashcards/FlashcardsAppPage'

export const Route = createFileRoute('/embedded-apps/flashcards')({
  component: FlashcardsRouteComponent,
})

function FlashcardsRouteComponent() {
  return <FlashcardsAppPage />
}
