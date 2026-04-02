import { createFileRoute } from '@tanstack/react-router'
import { ChessAppPage } from './-components/chess/ChessAppPage'

export const Route = createFileRoute('/embedded-apps/chess')({
  component: ChessRouteComponent,
})

function ChessRouteComponent() {
  return <ChessAppPage />
}
