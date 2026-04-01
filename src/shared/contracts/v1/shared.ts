import { z } from 'zod'

export const ContractVersionSchema = z.literal('v1')
export type ContractVersion = z.infer<typeof ContractVersionSchema>

export const NonEmptyStringSchema = z.string().trim().min(1)

export const SlugSchema = NonEmptyStringSchema.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: 'Must be lowercase kebab-case',
})

export const IdentifierSchema = NonEmptyStringSchema.regex(/^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/, {
  message: 'Must use lowercase letters, numbers, and . _ : - separators',
})

export const SemverSchema = NonEmptyStringSchema.regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i, {
  message: 'Must be a semantic version like 1.0.0',
})

export const IsoDatetimeSchema = z.string().datetime({ offset: true })

export const OriginSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value)
      return (url.pathname === '' || url.pathname === '/') && !url.search && !url.hash
    } catch {
      return false
    }
  }, 'Must be a valid origin without a path, query, or hash')

export const JsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
export type JsonPrimitive = z.infer<typeof JsonPrimitiveSchema>

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([JsonPrimitiveSchema, z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)])
) as z.ZodType<JsonValue>

export const JsonObjectSchema: z.ZodType<Record<string, JsonValue>> = z.record(z.string(), JsonValueSchema)
export type JsonObject = z.infer<typeof JsonObjectSchema>

export function normalizeOrigin(value: string): string {
  return new URL(value).origin
}
