import { createFileRoute } from '@tanstack/react-router'
import { ChessComAppPage } from './-components/chess-com/ChessComAppPage'

export const Route = createFileRoute('/embedded-apps/chess-com')({
  component: ChessComRouteComponent,
})

function ChessComRouteComponent() {
  return <ChessComAppPage />
}
