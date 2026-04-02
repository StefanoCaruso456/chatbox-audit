import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { ReviewHarnessPage } from './review-harness/-components/ReviewHarnessPage'
import { buildReviewHarnessConfig } from './review-harness/review-harness'

const searchSchema = z.object({
  appId: z.string().optional(),
  appName: z.string().optional(),
  entryUrl: z.string().url(),
  targetOrigin: z.string().optional(),
  allowedOrigins: z.string().optional(),
  conversationId: z.string().optional(),
  appSessionId: z.string().optional(),
  authState: z.enum(['not-required', 'connected', 'required', 'expired']).optional(),
  sandbox: z.string().optional(),
  reviewerNotes: z.string().optional(),
})

export const Route = createFileRoute('/review-harness')({
  component: ReviewHarnessRouteComponent,
  validateSearch: zodValidator(searchSchema),
})

function ReviewHarnessRouteComponent() {
  const search = Route.useSearch()
  const config = buildReviewHarnessConfig(search)

  return <ReviewHarnessPage config={config} />
}
