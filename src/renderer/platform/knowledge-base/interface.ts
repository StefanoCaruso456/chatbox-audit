import type {
  KnowledgeBaseCreateParams,
  KnowledgeBaseFileChunk,
  KnowledgeBaseFileChunkRequest,
  KnowledgeBaseFileMetaSummary,
  KnowledgeBaseUpdateParams,
  SimpleSuccessResult,
} from '@shared/electron-types'
import type { FileMeta, KnowledgeBase, KnowledgeBaseFile, KnowledgeBaseSearchResult } from '@shared/types'

export interface KnowledgeBaseController {
  list(): Promise<KnowledgeBase[]>
  create(createParams: KnowledgeBaseCreateParams): Promise<void>
  delete(id: number): Promise<void>
  listFiles(kbId: number): Promise<KnowledgeBaseFile[]>
  countFiles(kbId: number): Promise<number>
  listFilesPaginated(kbId: number, offset?: number, limit?: number): Promise<KnowledgeBaseFile[]>
  uploadFile(kbId: number, file: FileMeta): Promise<void>
  deleteFile(fileId: number): Promise<void>
  retryFile(fileId: number, useRemoteParsing?: boolean): Promise<void>
  pauseFile(fileId: number): Promise<void>
  resumeFile(fileId: number): Promise<void>
  search(kbId: number, query: string): Promise<KnowledgeBaseSearchResult[]>
  update(updateParams: KnowledgeBaseUpdateParams): Promise<void>
  getFilesMeta(kbId: number, fileIds: number[]): Promise<KnowledgeBaseFileMetaSummary[]>
  readFileChunks(kbId: number, chunks: KnowledgeBaseFileChunkRequest[]): Promise<KnowledgeBaseFileChunk[]>
  testMineruConnection(apiToken: string): Promise<SimpleSuccessResult>
}
