import type { JsonObject } from '@shared/contracts/v1'
import type { ToolInvocationRepository } from './repository'
import type {
  CancelToolInvocationRequest,
  CompleteToolInvocationRequest,
  FailToolInvocationRequest,
  ListToolInvocationsFilter,
  QueueToolInvocationRequest,
  StartToolInvocationRequest,
  TimeoutToolInvocationRequest,
  ToolInvocationErrorCode,
  ToolInvocationFailure,
  ToolInvocationMetadata,
  ToolInvocationRecord,
  ToolInvocationResult,
  ToolInvocationStatus,
  ToolInvocationTransitionEntry,
} from './types'

export interface ToolInvocationLoggingServiceOptions {
  now?: () => string
}

export class ToolInvocationLoggingService {
  private readonly now: () => string

  constructor(
    private readonly repository: ToolInvocationRepository,
    options: ToolInvocationLoggingServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  async queueInvocation(request: QueueToolInvocationRequest): Promise<ToolInvocationResult<ToolInvocationRecord>> {
    const normalizedPayload = this.normalizePayload(request.requestPayloadJson)
    if (!normalizedPayload.ok) {
      return normalizedPayload
    }

    const existing = await this.repository.getByToolCallId(request.toolCallId)
    if (existing) {
      return this.failure('duplicate-tool-call', `Tool call "${request.toolCallId}" already exists.`)
    }

    const queuedAt = request.queuedAt ?? this.now()
    const record: ToolInvocationRecord = {
      toolCallId: request.toolCallId,
      conversationId: request.conversationId,
      appSessionId: request.appSessionId,
      userId: request.userId,
      appId: request.appId,
      appVersionId: request.appVersionId,
      requestMessageId: request.requestMessageId,
      correlationId: request.correlationId,
      toolName: request.toolName,
      invocationMode: request.invocationMode,
      authRequirement: request.authRequirement,
      status: 'queued',
      requestPayloadJson: normalizedPayload.value,
      queuedAt,
      metadata: this.withTransitionLog({}, {
        status: 'queued',
        at: queuedAt,
      }, request.metadata),
    }

    await this.repository.save(record)
    return { ok: true, value: record }
  }

  async startInvocation(request: StartToolInvocationRequest): Promise<ToolInvocationResult<ToolInvocationRecord>> {
    return this.transitionInvocation(request.toolCallId, 'running', (record) => {
      const startedAt = request.startedAt ?? this.now()

      if (record.status === 'running' && record.startedAt) {
        return {
          ...record,
          metadata: this.withTransitionLog(record.metadata, {
            status: 'running',
            at: request.startedAt ?? record.startedAt,
            note: 'start invocation requested after the invocation was already running.',
          }, request.metadata),
        }
      }

      return {
        ...record,
        status: 'running',
        startedAt,
        metadata: this.withTransitionLog(record.metadata, {
          status: 'running',
          at: startedAt,
        }, request.metadata),
      }
    })
  }

  async completeInvocation(request: CompleteToolInvocationRequest): Promise<ToolInvocationResult<ToolInvocationRecord>> {
    const normalizedResponse = this.normalizePayload(request.responsePayloadJson)
    if (!normalizedResponse.ok) {
      return normalizedResponse
    }

    return this.transitionInvocation(request.toolCallId, 'succeeded', (record) => {
      const completedAt = request.completedAt ?? this.now()
      const startedAt = record.startedAt ?? completedAt

      return {
        ...record,
        status: 'succeeded',
        responsePayloadJson: normalizedResponse.value,
        resultSummary: request.resultSummary,
        startedAt,
        completedAt,
        latencyMs: this.resolveLatencyMs(startedAt, completedAt, request.latencyMs),
        metadata: this.withTransitionLog(record.metadata, {
          status: 'succeeded',
          at: completedAt,
        }, request.metadata),
      }
    })
  }

  async failInvocation(request: FailToolInvocationRequest): Promise<ToolInvocationResult<ToolInvocationRecord>> {
    const normalizedError = this.normalizePayload(request.errorPayloadJson)
    if (!normalizedError.ok) {
      return normalizedError
    }

    return this.transitionInvocation(request.toolCallId, 'failed', (record) => {
      const completedAt = request.completedAt ?? this.now()
      const startedAt = record.startedAt ?? completedAt

      return {
        ...record,
        status: 'failed',
        errorPayloadJson: normalizedError.value,
        resultSummary: request.resultSummary ?? 'Tool invocation failed.',
        startedAt,
        completedAt,
        latencyMs: this.resolveLatencyMs(startedAt, completedAt, request.latencyMs),
        metadata: this.withTransitionLog(record.metadata, {
          status: 'failed',
          at: completedAt,
        }, request.metadata),
      }
    })
  }

  async cancelInvocation(request: CancelToolInvocationRequest): Promise<ToolInvocationResult<ToolInvocationRecord>> {
    return this.transitionInvocation(request.toolCallId, 'cancelled', (record) => {
      const completedAt = request.completedAt ?? this.now()
      const startedAt = record.startedAt ?? completedAt

      return {
        ...record,
        status: 'cancelled',
        resultSummary: request.resultSummary ?? 'Tool invocation was cancelled.',
        startedAt,
        completedAt,
        latencyMs: this.resolveLatencyMs(startedAt, completedAt, request.latencyMs),
        metadata: this.withTransitionLog(record.metadata, {
          status: 'cancelled',
          at: completedAt,
        }, request.metadata),
      }
    })
  }

  async timeoutInvocation(request: TimeoutToolInvocationRequest): Promise<ToolInvocationResult<ToolInvocationRecord>> {
    return this.transitionInvocation(request.toolCallId, 'timed-out', (record) => {
      const completedAt = request.completedAt ?? this.now()
      const startedAt = record.startedAt ?? completedAt

      return {
        ...record,
        status: 'timed-out',
        resultSummary: request.resultSummary ?? 'Tool invocation timed out.',
        startedAt,
        completedAt,
        latencyMs: this.resolveLatencyMs(startedAt, completedAt, request.latencyMs),
        metadata: this.withTransitionLog(record.metadata, {
          status: 'timed-out',
          at: completedAt,
        }, request.metadata),
      }
    })
  }

  async getInvocation(toolCallId: string): Promise<ToolInvocationResult<ToolInvocationRecord>> {
    const record = await this.repository.getByToolCallId(toolCallId)
    if (!record) {
      return this.failure('not-found', `Tool call "${toolCallId}" was not found.`)
    }

    return { ok: true, value: record }
  }

  async listInvocations(filter: ListToolInvocationsFilter = {}): Promise<ToolInvocationRecord[]> {
    const records = await this.repository.list()
    return this.filterAndSort(records, filter)
  }

  async listByConversation(conversationId: string): Promise<ToolInvocationRecord[]> {
    return this.listInvocations({ conversationId })
  }

  async listBySession(appSessionId: string): Promise<ToolInvocationRecord[]> {
    return this.listInvocations({ appSessionId })
  }

  async listByStatus(status: ToolInvocationStatus): Promise<ToolInvocationRecord[]> {
    return this.listInvocations({ status })
  }

  async listByAppTool(appId: string, toolName: string): Promise<ToolInvocationRecord[]> {
    return this.listInvocations({ appId, toolName })
  }

  private async transitionInvocation(
    toolCallId: string,
    terminalStatus: ToolInvocationStatus,
    transform: (record: ToolInvocationRecord) => ToolInvocationRecord
  ): Promise<ToolInvocationResult<ToolInvocationRecord>> {
    const existing = await this.repository.getByToolCallId(toolCallId)
    if (!existing) {
      return this.failure('not-found', `Tool call "${toolCallId}" was not found.`)
    }

    if (existing.status !== 'queued' && existing.status !== 'running') {
      return this.failure(
        'invalid-transition',
        `Tool call "${toolCallId}" cannot transition from "${existing.status}" to "${terminalStatus}".`
      )
    }

    const updated = transform(existing)
    if (updated.status !== terminalStatus) {
      return this.failure('invalid-transition', `Transition for tool call "${toolCallId}" did not end in "${terminalStatus}".`)
    }

    await this.repository.save(updated)
    return { ok: true, value: updated }
  }

  private filterAndSort(records: ToolInvocationRecord[], filter: ListToolInvocationsFilter): ToolInvocationRecord[] {
    return records
      .filter((record) => {
        if (filter.conversationId && record.conversationId !== filter.conversationId) {
          return false
        }

        if (filter.appSessionId && record.appSessionId !== filter.appSessionId) {
          return false
        }

        if (filter.userId && record.userId !== filter.userId) {
          return false
        }

        if (filter.appId && record.appId !== filter.appId) {
          return false
        }

        if (filter.toolName && record.toolName !== filter.toolName) {
          return false
        }

        if (filter.status && record.status !== filter.status) {
          return false
        }

        return true
      })
      .sort((left, right) => this.sortTimestamp(right) - this.sortTimestamp(left))
  }

  private sortTimestamp(record: ToolInvocationRecord): number {
    return new Date(record.startedAt ?? record.completedAt ?? record.queuedAt).getTime()
  }

  private resolveLatencyMs(startedAt: string, completedAt: string, providedLatencyMs?: number): number {
    if (typeof providedLatencyMs === 'number') {
      return providedLatencyMs
    }

    return Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
  }

  private normalizePayload(payload: JsonObject): ToolInvocationResult<JsonObject> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return this.failure('invalid-payload', 'Invocation payloads must be JSON objects.')
    }

    return { ok: true, value: payload }
  }

  private withTransitionLog(
    baseMetadata: ToolInvocationMetadata,
    entry: ToolInvocationTransitionEntry,
    overrideMetadata?: ToolInvocationMetadata
  ): ToolInvocationMetadata {
    const transitionLog = Array.isArray(baseMetadata.transitionLog) ? baseMetadata.transitionLog : []
    return {
      ...baseMetadata,
      ...(overrideMetadata ?? {}),
      transitionLog: [...transitionLog, entry],
    }
  }

  private failure(code: ToolInvocationErrorCode, message: string, details?: string[]): ToolInvocationFailure {
    return {
      ok: false,
      code,
      message,
      details,
    }
  }
}
