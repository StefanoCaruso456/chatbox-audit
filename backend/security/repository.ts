import type { AppSecurityRepository, AppSecurityReviewRecord, GetLatestAppSecurityReviewRequest } from './types'

export class InMemoryAppSecurityRepository implements AppSecurityRepository {
  private readonly reviewsByAppId = new Map<string, AppSecurityReviewRecord[]>()

  async getLatestReview(request: GetLatestAppSecurityReviewRequest): Promise<AppSecurityReviewRecord | undefined> {
    const reviews = this.reviewsByAppId.get(request.appId) ?? []
    const filtered = request.appVersionId
      ? reviews.filter((review) => review.appVersionId === request.appVersionId)
      : reviews

    const [latest] = [...filtered].sort((left, right) => {
      const decidedDelta = Date.parse(right.decidedAt ?? right.createdAt) - Date.parse(left.decidedAt ?? left.createdAt)
      if (decidedDelta !== 0) {
        return decidedDelta
      }

      return Date.parse(right.createdAt) - Date.parse(left.createdAt)
    })

    return latest ? structuredClone(latest) : undefined
  }

  async listReviews(appId: string): Promise<AppSecurityReviewRecord[]> {
    const reviews = this.reviewsByAppId.get(appId) ?? []
    return [...reviews]
      .sort((left, right) => {
        const decidedDelta = Date.parse(right.decidedAt ?? right.createdAt) - Date.parse(left.decidedAt ?? left.createdAt)
        if (decidedDelta !== 0) {
          return decidedDelta
        }

        return Date.parse(right.createdAt) - Date.parse(left.createdAt)
      })
      .map((review) => structuredClone(review))
  }

  async saveReview(record: AppSecurityReviewRecord): Promise<void> {
    const current = this.reviewsByAppId.get(record.appId) ?? []
    const next = current.filter((review) => review.appReviewRecordId !== record.appReviewRecordId)
    next.push(structuredClone(record))
    this.reviewsByAppId.set(record.appId, next)
  }
}
