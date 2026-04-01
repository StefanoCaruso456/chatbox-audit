import { z } from 'zod'
import { AppPermissionsSchema } from '../permissions'
import { IdentifierSchema, JsonValueSchema, NonEmptyStringSchema } from '../shared'
import { toValidationResult } from '../validation'

export const ToolAuthRequirementSchema = z.enum(['none', 'platform-session', 'app-oauth'])
export type ToolAuthRequirement = z.infer<typeof ToolAuthRequirementSchema>

export const ToolInvocationModeSchema = z.enum(['platform-proxy', 'embedded-bridge'])
export type ToolInvocationMode = z.infer<typeof ToolInvocationModeSchema>

export const ToolJsonScalarTypeSchema = z.enum(['string', 'number', 'integer', 'boolean', 'null'])
export const ToolJsonContainerTypeSchema = z.enum(['object', 'array'])
export const ToolJsonTypeSchema = z.union([ToolJsonScalarTypeSchema, ToolJsonContainerTypeSchema])
export type ToolJsonType = z.infer<typeof ToolJsonTypeSchema>

export const ToolJsonSchemaSchema: z.ZodType<ToolJsonSchema> = z.lazy(() =>
  z
    .object({
      type: ToolJsonTypeSchema.optional(),
      title: NonEmptyStringSchema.optional(),
      description: z.string().optional(),
      properties: z.record(z.string(), ToolJsonSchemaSchema).optional(),
      items: z.union([ToolJsonSchemaSchema, z.array(ToolJsonSchemaSchema)]).optional(),
      required: z.array(NonEmptyStringSchema).optional(),
      enum: z.array(JsonValueSchema).optional(),
      additionalProperties: z.union([z.boolean(), ToolJsonSchemaSchema]).optional(),
      nullable: z.boolean().optional(),
      default: JsonValueSchema.optional(),
      examples: z.array(JsonValueSchema).optional(),
    })
    .superRefine((value, ctx) => {
      if (value.type === 'object' && !value.properties) {
        ctx.addIssue({
          code: 'custom',
          message: 'Object schemas must define properties',
          path: ['properties'],
        })
      }

      if (value.type !== 'object' && value.properties) {
        ctx.addIssue({
          code: 'custom',
          message: 'Only object schemas may define properties',
          path: ['properties'],
        })
      }

      if (value.required && !value.properties) {
        ctx.addIssue({
          code: 'custom',
          message: 'Required fields need an object properties map',
          path: ['required'],
        })
      }

      if (value.type === 'array' && !value.items) {
        ctx.addIssue({
          code: 'custom',
          message: 'Array schemas must define items',
          path: ['items'],
        })
      }

      if (value.type !== 'array' && value.items) {
        ctx.addIssue({
          code: 'custom',
          message: 'Only array schemas may define items',
          path: ['items'],
        })
      }
    })
) as z.ZodType<ToolJsonSchema>

export type ToolJsonSchema = {
  type?: ToolJsonType
  title?: string
  description?: string
  properties?: Record<string, ToolJsonSchema>
  items?: ToolJsonSchema | ToolJsonSchema[]
  required?: string[]
  enum?: z.infer<typeof JsonValueSchema>[]
  additionalProperties?: boolean | ToolJsonSchema
  nullable?: boolean
  default?: z.infer<typeof JsonValueSchema>
  examples?: z.infer<typeof JsonValueSchema>[]
}

export const ToolSchemaSchema = z.object({
  name: IdentifierSchema,
  displayName: NonEmptyStringSchema.optional(),
  description: NonEmptyStringSchema,
  inputSchema: ToolJsonSchemaSchema,
  outputSchema: ToolJsonSchemaSchema.optional(),
  authRequirement: ToolAuthRequirementSchema,
  timeoutMs: z.number().int().min(1_000).max(300_000),
  idempotent: z.boolean(),
  invocationMode: ToolInvocationModeSchema,
  requiredPermissions: AppPermissionsSchema.optional(),
})

export type ToolSchema = z.infer<typeof ToolSchemaSchema>

export function parseToolSchema(input: unknown): ToolSchema {
  return ToolSchemaSchema.parse(input)
}

export function validateToolSchema(input: unknown) {
  return toValidationResult(ToolSchemaSchema.safeParse(input))
}
