import { IdentifierSchema } from '@shared/contracts/v1'
import type { JsonObject } from '@shared/contracts/v1/shared'
import type { TutorMeAIUserRole } from '@shared/types/settings'

const REVIEWER_ROLES = new Set<TutorMeAIUserRole>(['teacher', 'school_admin', 'district_Director'])

export function isTutorMeAIReviewerRole(
  role: TutorMeAIUserRole | null | undefined
): role is TutorMeAIUserRole {
  return Boolean(role && REVIEWER_ROLES.has(role))
}

export function sanitizeAssignedStudentIds(studentIds: readonly string[] | null | undefined): string[] {
  if (!studentIds?.length) {
    return []
  }

  const dedupedStudentIds: string[] = []
  const seen = new Set<string>()

  for (const value of studentIds) {
    const parsed = IdentifierSchema.safeParse(value)
    if (!parsed.success || seen.has(parsed.data)) {
      continue
    }
    seen.add(parsed.data)
    dedupedStudentIds.push(parsed.data)
  }

  return dedupedStudentIds
}

export function readAssignedStudentIds(
  input:
    | JsonObject
    | {
        metadata: JsonObject
      }
    | null
    | undefined
): string[] {
  const metadata = input && 'metadata' in input ? input.metadata : input
  const rawStudents = metadata?.students

  return Array.isArray(rawStudents)
    ? sanitizeAssignedStudentIds(rawStudents.filter((value): value is string => typeof value === 'string'))
    : []
}
