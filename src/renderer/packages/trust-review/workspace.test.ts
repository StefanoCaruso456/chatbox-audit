import { describe, expect, it } from 'vitest'
import { getTrustReviewWorkspace } from './workspace'

describe('TrustReviewWorkspace', () => {
  it('seeds open review candidates and exposes queue/context helpers', async () => {
    const workspace = getTrustReviewWorkspace()

    const queue = await workspace.listQueue()
    expect(queue.length).toBeGreaterThanOrEqual(2)
    expect(queue.some((item) => item.reviewState === 'review-pending')).toBe(true)
    expect(queue.some((item) => item.reviewState === 'rejected')).toBe(true)

    const planner = queue.find((item) => item.appId === 'planner.oauth')
    expect(planner).toBeDefined()
    if (!planner) {
      return
    }

    const context = await workspace.getReviewContext(planner.appId, planner.appVersionId)
    expect(context.ok).toBe(true)
    if (!context.ok) {
      return
    }

    expect(context.value.app.appId).toBe(planner.appId)
    expect(context.value.app.currentVersion.appVersionId).toBe(planner.appVersionId)
  })
})
