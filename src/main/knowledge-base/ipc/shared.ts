import type { Client } from '@libsql/client'
import type { KnowledgeBaseFileChunkRequest, KnowledgeBaseFileMetaSummary } from '../../../shared/electron-types'
import type { KnowledgeBase, KnowledgeBaseFile } from '../../../shared/types'
import type { DocumentParserConfig } from '../../../shared/types/settings'
import { sentry } from '../../adapters/sentry'
import { getLogger } from '../../util'
import { getVectorStore, parseSQLiteTimestamp } from '../db'

export const log = getLogger('knowledge-base:ipc-handlers')

type ScopeExtras = Record<string, unknown>

interface KnowledgeBaseRow {
  id: number
  name: string
  embedding_model: string
  rerank_model: string
  vision_model?: string | null
  provider_mode?: KnowledgeBase['providerMode'] | null
  document_parser?: string | null
  created_at: string
}

interface KnowledgeBaseFileRow {
  id: number
  kb_id: number
  filename: string
  filepath: string
  mime_type: string
  file_size?: number | null
  chunk_count?: number | null
  total_chunks?: number | null
  status: string
  error?: string | null
  created_at: string
  parsed_remotely?: number | null
  parser_type?: KnowledgeBaseFile['parser_type'] | null
}

interface KnowledgeBaseFileMetaRow {
  id: number
  kb_id: number
  filename: string
  mime_type: string
  file_size?: number | null
  chunk_count?: number | null
  total_chunks?: number | null
  status: string
  created_at: string
}

type VectorStoreClientCarrier = { turso: Client }

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export function reportKnowledgeBaseIpcError(operation: string, message: string, error: unknown, extras?: ScopeExtras) {
  log.error(message, error)
  sentry.withScope((scope) => {
    scope.setTag('component', 'knowledge-base-ipc')
    scope.setTag('operation', operation)

    if (extras) {
      Object.entries(extras).forEach(([key, value]) => {
        if (value !== undefined) {
          scope.setExtra(key, value)
        }
      })
    }

    sentry.captureException(error)
  })
}

export function assertValidKnowledgeBaseId(kbId: number) {
  if (!Number.isInteger(kbId) || kbId <= 0) {
    throw new Error('Invalid knowledge base ID')
  }
}

export function assertValidFileId(fileId: number) {
  if (!Number.isInteger(fileId) || fileId <= 0) {
    throw new Error('Invalid file ID')
  }
}

export function assertValidPagination(offset: number, limit: number) {
  if (offset < 0 || limit <= 0 || limit > 100) {
    throw new Error('Invalid pagination parameters')
  }
}

export function assertChunkRequestLimit(chunks: KnowledgeBaseFileChunkRequest[]) {
  if (!Array.isArray(chunks)) {
    throw new Error('Invalid chunks parameter')
  }
  if (chunks.length > 200) {
    throw new Error('Too many chunks requested (max 200)')
  }
}

export function parseDocumentParser(documentParser?: string | null): DocumentParserConfig | undefined {
  if (!documentParser) {
    return undefined
  }
  return JSON.parse(documentParser) as DocumentParserConfig
}

export function mapKnowledgeBaseRow(row: KnowledgeBaseRow): KnowledgeBase {
  return {
    id: row.id,
    name: row.name,
    embeddingModel: row.embedding_model,
    rerankModel: row.rerank_model,
    visionModel: row.vision_model || undefined,
    providerMode: row.provider_mode || undefined,
    documentParser: parseDocumentParser(row.document_parser),
    createdAt: row.created_at ? parseSQLiteTimestamp(row.created_at) : Date.now(),
  }
}

export function mapKnowledgeBaseFileRow(row: KnowledgeBaseFileRow): KnowledgeBaseFile {
  return {
    id: row.id,
    kb_id: row.kb_id,
    filename: row.filename,
    filepath: row.filepath,
    mime_type: row.mime_type,
    file_size: row.file_size || 0,
    chunk_count: row.chunk_count || 0,
    total_chunks: row.total_chunks || 0,
    status: row.status,
    error: row.error as string,
    createdAt: parseSQLiteTimestamp(row.created_at),
    parsed_remotely: row.parsed_remotely || 0,
    parser_type: row.parser_type || 'local',
  }
}

export function mapKnowledgeBaseFileMetaRow(row: KnowledgeBaseFileMetaRow): KnowledgeBaseFileMetaSummary {
  return {
    id: row.id,
    kbId: row.kb_id,
    filename: row.filename,
    mimeType: row.mime_type,
    fileSize: row.file_size || 0,
    chunkCount: row.chunk_count || 0,
    totalChunks: row.total_chunks || 0,
    status: row.status,
    createdAt: parseSQLiteTimestamp(row.created_at),
  }
}

export function getVectorStoreClient(): Client {
  return (getVectorStore() as unknown as VectorStoreClientCarrier).turso
}
