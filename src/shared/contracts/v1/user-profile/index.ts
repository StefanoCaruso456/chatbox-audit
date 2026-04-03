import { z } from 'zod'
import { IdentifierSchema, IsoDatetimeSchema, JsonObjectSchema } from '../shared'

export const TutorMeAIUserRoleSchema = z.enum(['student', 'teacher', 'school_admin', 'district_admin'])
export type TutorMeAIUserRole = z.infer<typeof TutorMeAIUserRoleSchema>

export const DEFAULT_TUTOR_ME_AI_USER_ROLE: TutorMeAIUserRole = 'student'

export const TutorMeAIUserPermissionsSchema = z.object({
  canRequestAppReview: z.boolean(),
  canViewReviewQueue: z.boolean(),
  canStartAppReview: z.boolean(),
  canApproveApp: z.boolean(),
  canBlockApp: z.boolean(),
  canManageSafetySettings: z.boolean(),
})

export type TutorMeAIUserPermissions = z.infer<typeof TutorMeAIUserPermissionsSchema>

const ROLE_PERMISSION_MAP: Record<TutorMeAIUserRole, TutorMeAIUserPermissions> = {
  student: {
    canRequestAppReview: false,
    canViewReviewQueue: false,
    canStartAppReview: false,
    canApproveApp: false,
    canBlockApp: false,
    canManageSafetySettings: false,
  },
  teacher: {
    canRequestAppReview: true,
    canViewReviewQueue: false,
    canStartAppReview: false,
    canApproveApp: false,
    canBlockApp: false,
    canManageSafetySettings: false,
  },
  school_admin: {
    canRequestAppReview: true,
    canViewReviewQueue: true,
    canStartAppReview: true,
    canApproveApp: true,
    canBlockApp: true,
    canManageSafetySettings: false,
  },
  district_admin: {
    canRequestAppReview: true,
    canViewReviewQueue: true,
    canStartAppReview: true,
    canApproveApp: true,
    canBlockApp: true,
    canManageSafetySettings: true,
  },
}

export function deriveTutorMeAIUserPermissions(role: TutorMeAIUserRole): TutorMeAIUserPermissions {
  return { ...ROLE_PERMISSION_MAP[role] }
}

export const TutorMeAIUserProfileRecordSchema = z.object({
  userId: IdentifierSchema,
  displayName: z.string().trim().min(1),
  email: z.string().trim().email().nullable(),
  role: TutorMeAIUserRoleSchema,
  metadata: JsonObjectSchema,
  createdAt: IsoDatetimeSchema,
  updatedAt: IsoDatetimeSchema,
  deletedAt: IsoDatetimeSchema.nullable(),
})

export type TutorMeAIUserProfileRecord = z.infer<typeof TutorMeAIUserProfileRecordSchema>

export const TutorMeAIReviewerAccessContextSchema = z.object({
  userId: IdentifierSchema,
  role: TutorMeAIUserRoleSchema,
  permissions: TutorMeAIUserPermissionsSchema,
})

export type TutorMeAIReviewerAccessContext = z.infer<typeof TutorMeAIReviewerAccessContextSchema>
