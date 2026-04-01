import type { ZodError } from 'zod'

export interface ContractValidationSuccess<T> {
  success: true
  data: T
}

export interface ContractValidationFailure {
  success: false
  errors: string[]
}

export type ContractValidationResult<T> = ContractValidationSuccess<T> | ContractValidationFailure

export function formatContractErrors(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
    return `${path}: ${issue.message}`
  })
}

export function toValidationResult<T>(
  result: { success: true; data: T } | { success: false; error: ZodError }
): ContractValidationResult<T> {
  if (result.success) {
    return {
      success: true,
      data: result.data,
    }
  }

  return {
    success: false,
    errors: formatContractErrors(result.error),
  }
}
