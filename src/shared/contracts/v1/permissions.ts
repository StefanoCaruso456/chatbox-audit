import { z } from 'zod'

export const AppPermissionSchema = z.enum([
  'conversation:read-summary',
  'conversation:write-summary',
  'session:read',
  'session:write',
  'tool:invoke',
  'user:read-profile',
  'oauth:connect',
])

export type AppPermission = z.infer<typeof AppPermissionSchema>

export const AppPermissionsSchema = z.array(AppPermissionSchema).superRefine((permissions, ctx) => {
  const uniquePermissions = new Set(permissions)
  if (uniquePermissions.size !== permissions.length) {
    ctx.addIssue({
      code: 'custom',
      message: 'Permissions must be unique',
    })
  }
})

export type AppPermissions = z.infer<typeof AppPermissionsSchema>
