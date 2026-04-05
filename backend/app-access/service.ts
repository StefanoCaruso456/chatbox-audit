import { randomUUID } from 'node:crypto'
import type { TutorMeAIUserRole } from '@shared/types/settings'
import { failureResult } from '../errors'
import { isTutorMeAIReviewerRole, readAssignedStudentIds, type AuthRepository, type UserRecord } from '../auth'
import type { AppAccessRepository } from './repository'
import type {
  AppAccessRequestRecord,
  AppAccessResult,
  PublicAppAccessRequest,
} from './types'

const REVIEWER_ROLES = new Set<TutorMeAIUserRole>(['teacher', 'school_admin', 'district_Director'])

export class AppAccessService {
  constructor(
    private readonly repository: AppAccessRepository,
    private readonly authRepository: Pick<AuthRepository, 'listUsersByRole'>,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async requestStudentAccess(input: {
    student: UserRecord
    appId: string
    appName: string
  }): Promise<AppAccessResult<{ access: AppAccessRequestRecord['status']; request: PublicAppAccessRequest }>> {
    const appId = this.normalizeRequired(input.appId)
    const appName = this.normalizeRequired(input.appName)
    if (!appId || !appName) {
      return this.failure('invalid-request', 'appId and appName are required.')
    }

    if (input.student.role !== 'student') {
      return this.failure('app-access-forbidden', 'Only student profiles require teacher approval for app access.')
    }

    const latest = await this.repository.getLatestAppAccessRequestForStudentApp(input.student.userId, appId)
    const now = this.now()

    if (!(await this.hasAssignedReviewer(input.student.userId))) {
      return this.failure(
        'app-access-forbidden',
        'No assigned teacher or administrator can approve this app yet. Ask your teacher to add you to their student list.'
      )
    }

    if (latest?.status === 'approved') {
      return {
        ok: true,
        value: {
          access: 'approved',
          request: this.toPublicRequest(latest),
        },
      }
    }

    if (latest?.status === 'pending') {
      const refreshed: AppAccessRequestRecord = {
        ...latest,
        appName,
        studentDisplayName: input.student.displayName,
        studentEmail: input.student.email,
        studentRole: input.student.role,
        updatedAt: now,
      }
      await this.repository.updateAppAccessRequest(refreshed)
      return {
        ok: true,
        value: {
          access: refreshed.status,
          request: this.toPublicRequest(refreshed),
        },
      }
    }

    const created = await this.repository.createAppAccessRequest({
      appAccessRequestId: `app-access.${appId}.${input.student.userId}.${randomUUID()}`,
      appId,
      appName,
      studentUserId: input.student.userId,
      studentDisplayName: input.student.displayName,
      studentEmail: input.student.email,
      studentRole: input.student.role,
      metadata: {
        requestedByRole: input.student.role ?? 'unknown',
      },
      now,
    })

    return {
      ok: true,
      value: {
        access: created.status,
        request: this.toPublicRequest(created),
      },
    }
  }

  async getStudentRequest(input: {
    student: UserRecord
    appId: string
  }): Promise<AppAccessResult<PublicAppAccessRequest | null>> {
    const appId = this.normalizeRequired(input.appId)
    if (!appId) {
      return this.failure('invalid-request', 'appId is required.')
    }

    const latest = await this.repository.getLatestAppAccessRequestForStudentApp(input.student.userId, appId)
    return {
      ok: true,
      value: latest ? this.toPublicRequest(latest) : null,
    }
  }

  async listPendingRequests(input: {
    reviewer: UserRecord
  }): Promise<AppAccessResult<PublicAppAccessRequest[]>> {
    if (!this.isReviewerRole(input.reviewer.role)) {
      return this.failure('app-access-forbidden', 'Only teacher or administrator profiles can review app access requests.')
    }

    const assignedStudentIds = new Set(readAssignedStudentIds(input.reviewer))
    if (assignedStudentIds.size === 0) {
      return {
        ok: true,
        value: [],
      }
    }

    const requests = await this.repository.listAppAccessRequestsByStatus('pending')
    return {
      ok: true,
      value: requests
        .filter((request) => assignedStudentIds.has(request.studentUserId))
        .map((request) => this.toPublicRequest(request)),
    }
  }

  async decideRequest(input: {
    reviewer: UserRecord
    appAccessRequestId: string
    status: 'approved' | 'declined'
    decisionReason?: string | null
  }): Promise<AppAccessResult<PublicAppAccessRequest>> {
    if (!this.isReviewerRole(input.reviewer.role)) {
      return this.failure('app-access-forbidden', 'Only teacher or administrator profiles can review app access requests.')
    }

    const appAccessRequestId = this.normalizeRequired(input.appAccessRequestId)
    if (!appAccessRequestId) {
      return this.failure('invalid-request', 'appAccessRequestId is required.')
    }

    const current = await this.repository.getAppAccessRequestById(appAccessRequestId)
    if (!current) {
      return this.failure('app-access-request-not-found', 'The requested app approval record was not found.')
    }

    if (!this.isReviewerAssignedToStudent(input.reviewer, current.studentUserId)) {
      return this.failure(
        'app-access-forbidden',
        'You are not assigned to review app access requests for this student.'
      )
    }

    if (current.status !== 'pending') {
      return this.failure('app-access-request-already-decided', 'This app access request has already been decided.')
    }

    const decided: AppAccessRequestRecord = {
      ...current,
      status: input.status,
      decisionReason: this.normalizeOptional(input.decisionReason),
      decidedByUserId: input.reviewer.userId,
      decidedByDisplayName: input.reviewer.displayName,
      decidedAt: this.now(),
      updatedAt: this.now(),
    }
    await this.repository.updateAppAccessRequest(decided)
    return {
      ok: true,
      value: this.toPublicRequest(decided),
    }
  }

  private toPublicRequest(request: AppAccessRequestRecord): PublicAppAccessRequest {
    return {
      appAccessRequestId: request.appAccessRequestId,
      appId: request.appId,
      appName: request.appName,
      studentUserId: request.studentUserId,
      studentDisplayName: request.studentDisplayName,
      studentEmail: request.studentEmail,
      studentRole: request.studentRole,
      status: request.status,
      decisionReason: request.decisionReason,
      decidedByUserId: request.decidedByUserId,
      decidedByDisplayName: request.decidedByDisplayName,
      requestedAt: request.requestedAt,
      decidedAt: request.decidedAt,
      updatedAt: request.updatedAt,
    }
  }

  private isReviewerRole(role: TutorMeAIUserRole | null) {
    return Boolean(role && REVIEWER_ROLES.has(role) && isTutorMeAIReviewerRole(role))
  }

  private isReviewerAssignedToStudent(reviewer: UserRecord, studentUserId: string) {
    return readAssignedStudentIds(reviewer).includes(studentUserId)
  }

  private async hasAssignedReviewer(studentUserId: string) {
    for (const reviewerRole of REVIEWER_ROLES) {
      const reviewers = await this.authRepository.listUsersByRole(reviewerRole)
      if (reviewers.some((reviewer) => this.isReviewerAssignedToStudent(reviewer, studentUserId))) {
        return true
      }
    }

    return false
  }

  private normalizeRequired(value: string | null | undefined) {
    const normalized = value?.trim()
    return normalized ? normalized : null
  }

  private normalizeOptional(value: string | null | undefined) {
    const normalized = value?.trim()
    return normalized ? normalized : null
  }

  private failure(code: Parameters<typeof failureResult<'invalid-request', 'app-access'>>[1], message: string) {
    return failureResult('app-access', code, message)
  }
}
