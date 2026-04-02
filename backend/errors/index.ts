export type BackendErrorDomain = 'api' | 'registry' | 'conversation' | 'app-session' | 'tool-invocation'

export interface BackendSuccess<T> {
  ok: true
  value: T
}

export interface BackendFailureResult<Code extends string, Domain extends BackendErrorDomain> {
  ok: false
  domain: Domain
  code: Code
  message: string
  details?: string[]
  retryable?: boolean
}

export type BackendResult<T, Code extends string, Domain extends BackendErrorDomain> =
  | BackendSuccess<T>
  | BackendFailureResult<Code, Domain>

export interface BackendFailureOptions {
  details?: string[]
  retryable?: boolean
}

export interface BackendApiErrorBody<Code extends string = string, Domain extends BackendErrorDomain = BackendErrorDomain> {
  ok: false
  error: {
    domain: Domain
    code: Code
    message: string
    details?: string[]
    retryable?: boolean
  }
}

export function failureResult<Code extends string, Domain extends BackendErrorDomain>(
  domain: Domain,
  code: Code,
  message: string,
  options: BackendFailureOptions = {}
): BackendFailureResult<Code, Domain> {
  return {
    ok: false,
    domain,
    code,
    message,
    details: options.details,
    retryable: options.retryable ?? false,
  }
}

export function toApiErrorBody<Code extends string, Domain extends BackendErrorDomain>(
  error:
    | BackendFailureResult<Code, Domain>
    | Omit<BackendFailureResult<Code, Domain>, 'ok'>
): BackendApiErrorBody<Code, Domain> {
  return {
    ok: false,
    error: {
      domain: error.domain,
      code: error.code,
      message: error.message,
      details: error.details,
      retryable: error.retryable,
    },
  }
}
