import type { ToolInvocationRecord } from './types'

export interface ToolInvocationRepository {
  getByToolCallId(toolCallId: string): Promise<ToolInvocationRecord | undefined>
  list(): Promise<ToolInvocationRecord[]>
  save(record: ToolInvocationRecord): Promise<void>
}

export class InMemoryToolInvocationRepository implements ToolInvocationRepository {
  private readonly recordsByToolCallId = new Map<string, ToolInvocationRecord>()

  async getByToolCallId(toolCallId: string): Promise<ToolInvocationRecord | undefined> {
    const record = this.recordsByToolCallId.get(toolCallId)
    return record ? structuredClone(record) : undefined
  }

  async list(): Promise<ToolInvocationRecord[]> {
    return Array.from(this.recordsByToolCallId.values()).map((record) => structuredClone(record))
  }

  async save(record: ToolInvocationRecord): Promise<void> {
    this.recordsByToolCallId.set(record.toolCallId, structuredClone(record))
  }
}
