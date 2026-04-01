import type {
  ElectronIPC,
  KnowledgeBaseCreateParams,
  KnowledgeBaseFileChunk,
  KnowledgeBaseFileChunkRequest,
  KnowledgeBaseFileMetaSummary,
  KnowledgeBaseUpdateParams,
  SimpleSuccessResult,
} from '@shared/electron-types'
import type { FileMeta } from '@shared/types'
import type { KnowledgeBaseController } from './interface'

class DesktopKnowledgeBaseController implements KnowledgeBaseController {
  constructor(private ipc: ElectronIPC) {}

  async list() {
    const knowledgeBases = await this.ipc.invoke('kb:list')
    return knowledgeBases
  }

  async create(createParams: KnowledgeBaseCreateParams) {
    await this.ipc.invoke('kb:create', createParams)
  }

  async delete(id: number) {
    await this.ipc.invoke('kb:delete', id)
  }

  async listFiles(kbId: number) {
    const files = await this.ipc.invoke('kb:file:list', kbId)
    return files
  }

  async countFiles(kbId: number) {
    return await this.ipc.invoke('kb:file:count', kbId)
  }

  async listFilesPaginated(kbId: number, offset = 0, limit = 20) {
    return await this.ipc.invoke('kb:file:list-paginated', kbId, offset, limit)
  }

  async uploadFile(kbId: number, file: FileMeta) {
    await this.ipc.invoke('kb:file:upload', kbId, file)
  }

  async deleteFile(fileId: number) {
    await this.ipc.invoke('kb:file:delete', fileId)
  }

  async retryFile(fileId: number, useRemoteParsing = false) {
    await this.ipc.invoke('kb:file:retry', fileId, useRemoteParsing)
  }

  async pauseFile(fileId: number) {
    await this.ipc.invoke('kb:file:pause', fileId)
  }

  async resumeFile(fileId: number) {
    await this.ipc.invoke('kb:file:resume', fileId)
  }

  async search(kbId: number, query: string) {
    const results = await this.ipc.invoke('kb:search', kbId, query)
    return results
  }

  async update(updateParams: KnowledgeBaseUpdateParams) {
    await this.ipc.invoke('kb:update', updateParams)
  }

  getFilesMeta(kbId: number, fileIds: number[]): Promise<KnowledgeBaseFileMetaSummary[]> {
    return this.ipc.invoke('kb:file:get-metas', kbId, fileIds)
  }

  readFileChunks(kbId: number, chunks: KnowledgeBaseFileChunkRequest[]): Promise<KnowledgeBaseFileChunk[]> {
    return this.ipc.invoke('kb:file:read-chunks', kbId, chunks)
  }

  testMineruConnection(apiToken: string): Promise<SimpleSuccessResult> {
    return this.ipc.invoke('parser:test-mineru', apiToken)
  }
}

export default DesktopKnowledgeBaseController
