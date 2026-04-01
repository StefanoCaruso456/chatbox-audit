import { ipcMain } from 'electron'
import type {
  KnowledgeBaseCreateParams,
  KnowledgeBaseUpdateParams,
  SimpleSuccessResult,
} from '../../../shared/electron-types'
import { getDatabase, getVectorStore, withTransaction } from '../db'
import {
  assertValidKnowledgeBaseId,
  getErrorMessage,
  log,
  mapKnowledgeBaseRow,
  reportKnowledgeBaseIpcError,
} from './shared'

export function registerKnowledgeBaseCrudHandlers() {
  ipcMain.handle('kb:list', async () => {
    try {
      log.debug('ipcMain: kb:list')
      const db = getDatabase()
      const rs = await db.execute('SELECT * FROM knowledge_base')
      return rs.rows.map((row) => mapKnowledgeBaseRow(row as never))
    } catch (error) {
      reportKnowledgeBaseIpcError('kb_list', 'ipcMain: kb:list failed', error)
      throw error
    }
  })

  ipcMain.handle('kb:create', async (_event, params: KnowledgeBaseCreateParams) => {
    const { name, embeddingModel, rerankModel, visionModel, documentParser, providerMode } = params

    try {
      log.info(
        `ipcMain: kb:create, name=${name}, embeddingModel=${embeddingModel}, rerankModel=${rerankModel}, visionModel=${visionModel}, documentParser=${documentParser?.type || 'default'}, providerMode=${providerMode || 'not specified'}`
      )

      if (!name || !name.trim()) {
        throw new Error('Knowledge base name is required')
      }
      if (!embeddingModel || !embeddingModel.trim()) {
        throw new Error('Embedding model is required')
      }

      const db = getDatabase()
      const documentParserJson = documentParser ? JSON.stringify(documentParser) : null
      const rs = await db.execute({
        sql: 'INSERT INTO knowledge_base (name, embedding_model, rerank_model, vision_model, document_parser, provider_mode) VALUES (?, ?, ?, ?, ?, ?)',
        args: [
          name.trim(),
          embeddingModel,
          rerankModel || null,
          visionModel || null,
          documentParserJson,
          providerMode || null,
        ],
      })
      const id = rs.lastInsertRowid

      if (!id) {
        throw new Error('Failed to create knowledge base')
      }

      log.info(`[IPC] Knowledge base created successfully: id=${id}, name=${name}`)
      return { id: Number(id), name: name.trim() }
    } catch (error) {
      reportKnowledgeBaseIpcError('kb_create', `ipcMain: kb:create failed for name=${name}`, error, {
        name,
        embeddingModel,
        rerankModel,
        visionModel,
        documentParser: documentParser?.type,
      })
      throw error
    }
  })

  ipcMain.handle('kb:update', async (_event, params: KnowledgeBaseUpdateParams) => {
    const { id, name, rerankModel, visionModel } = params

    try {
      log.info(`ipcMain: kb:update, id=${id}, name=${name}, rerankModel=${rerankModel}, visionModel=${visionModel}`)

      assertValidKnowledgeBaseId(id)

      if (!name && rerankModel === undefined && visionModel === undefined) {
        return 0
      }

      const db = getDatabase()
      let sql = 'UPDATE knowledge_base SET '
      const args: (string | number)[] = []

      if (name !== undefined) {
        if (!name.trim()) {
          throw new Error('Knowledge base name cannot be empty')
        }
        sql += 'name = ?'
        args.push(name.trim())
      }
      if (rerankModel !== undefined) {
        if (args.length > 0) {
          sql += ', '
        }
        sql += 'rerank_model = ?'
        args.push(rerankModel ?? '')
      }
      if (visionModel !== undefined) {
        if (args.length > 0) {
          sql += ', '
        }
        sql += 'vision_model = ?'
        args.push(visionModel ?? '')
      }
      sql += ' WHERE id = ?'
      args.push(id)

      const rs = await db.execute(sql, args)
      log.info(`[IPC] Knowledge base updated: id=${id}, affected rows=${rs.rowsAffected ?? 'unknown'}`)
      return rs.rowsAffected
    } catch (error) {
      reportKnowledgeBaseIpcError('kb_update', `ipcMain: kb:update failed for id=${id}`, error, {
        kbId: id,
        name,
        rerankModel,
        visionModel,
      })
      throw error
    }
  })

  ipcMain.handle('kb:delete', async (_event, kbId: number): Promise<SimpleSuccessResult> => {
    try {
      log.info(`ipcMain: kb:delete, kbId=${kbId}`)
      assertValidKnowledgeBaseId(kbId)

      await withTransaction(async () => {
        const db = getDatabase()
        const vectorStore = getVectorStore()

        const kbExists = await db.execute('SELECT id FROM knowledge_base WHERE id = ?', [kbId])
        if (!kbExists.rows[0]) {
          throw new Error(`Knowledge base ${kbId} not found`)
        }

        await db.execute({
          sql: 'DELETE FROM kb_file WHERE kb_id = ?',
          args: [kbId],
        })
        log.info(`[IPC] Deleted file records for kbId=${kbId}`)

        await db.execute({
          sql: 'DELETE FROM knowledge_base WHERE id = ?',
          args: [kbId],
        })
        log.info(`[IPC] Deleted knowledge base record for kbId=${kbId}`)

        await vectorStore.deleteIndex({ indexName: `kb_${kbId}` })
        log.info(`[IPC] Deleted vector index for kbId=${kbId}`)
      })

      return { success: true }
    } catch (error) {
      reportKnowledgeBaseIpcError('kb_delete', `ipcMain: kb:delete failed for kbId=${kbId}`, error, {
        kbId,
      })
      return { success: false, error: getErrorMessage(error) }
    }
  })
}
