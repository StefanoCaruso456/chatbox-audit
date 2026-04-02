import { createFileRoute } from '@tanstack/react-router'
import { PlannerAppPage } from './-components/planner/PlannerAppPage'

export const Route = createFileRoute('/embedded-apps/planner')({
  component: PlannerRouteComponent,
})

function PlannerRouteComponent() {
  return <PlannerAppPage />
}
