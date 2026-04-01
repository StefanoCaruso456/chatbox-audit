import { ipcMain } from 'electron'
import type { FileMeta } from '../../../shared/types'
import { getDatabase, withTransaction } from '../db'
import {
  assertValidFileId,
  assertValidKnowledgeBaseId,
  getErrorMessage,
  getVectorStoreClient,
  log,
  reportKnowledgeBaseIpcError,
} from './shared'

export function registerKnowledgeBaseFileMutationHandlers() {
  ipcMain.handle('kb:file:upload', async (_event, kbId: number, file: FileMeta): Promise<{ id: number }> => {
    try {
      log.debug(`ipcMain: kb:file:upload, kbId=${kbId}, file=${JSON.stringify(file)}`)
      assertValidKnowledgeBaseId(kbId)

      if (!file || !file.name || !file.path || !file.type) {
        throw new Error('Invalid file metadata')
      }
      if (file.size < 0 || file.size > 100 * 1024 * 1024) {
        throw new Error('Invalid file size')
      }

      const db = getDatabase()

      const kbExists = await db.execute('SELECT id FROM knowledge_base WHERE id = ?', [kbId])
      if (!kbExists.rows[0]) {
        throw new Error(`Knowledge base ${kbId} not found`)
      }

      log.info(
        `[IPC] Creating file record: kbId=${kbId}, filename=${file.name}, filepath=${file.path}, mimeType=${file.type}, size=${file.size}`
      )
      const rs = await db.execute({
        sql: 'INSERT INTO kb_file (kb_id, filename, filepath, mime_type, file_size) VALUES (?, ?, ?, ?, ?)',
        args: [kbId, file.name, file.path, file.type, file.size],
      })
      const id = rs.lastInsertRowid
      if (!id) {
        throw new Error('File upload failed - no ID returned')
      }

      log.info(`[IPC] File created: id=${id}, kbId=${kbId}, filename=${file.name}`)
      return { id: Number(id) }
    } catch (error) {
      reportKnowledgeBaseIpcError(
        'file_upload',
        `ipcMain: kb:file:upload failed for kbId=${kbId}, filename=${file?.name}`,
        error,
        {
          kbId,
          filename: file?.name,
          fileSize: file?.size,
          mimeType: file?.type,
        }
      )
      throw error
    }
  })

  ipcMain.handle('kb:file:retry', async (_event, fileId: number, useRemoteParsing = false) => {
    try {
      log.debug(`ipcMain: kb:file:retry, fileId=${fileId}, useRemoteParsing=${useRemoteParsing}`)
      assertValidFileId(fileId)

      const db = getDatabase()
      const rs = await db.execute({
        sql: 'SELECT * FROM kb_file WHERE id = ?',
        args: [fileId],
      })
      const file = rs.rows[0]
      if (!file) {
        throw new Error('File not found')
      }
      if (file.status !== 'failed') {
        throw new Error('Only failed files can be retried')
      }

      await db.execute({
        sql: 'UPDATE kb_file SET status = ?, error = NULL, chunk_count = 0, total_chunks = 0, processing_started_at = NULL, use_remote_parsing = ? WHERE id = ?',
        args: ['pending', useRemoteParsing ? 1 : 0, fileId],
      })

      log.info(
        `[IPC] File retry request created: ${file.filename} (id=${fileId}, useRemoteParsing=${useRemoteParsing})`
      )
      return { success: true }
    } catch (error) {
      reportKnowledgeBaseIpcError('file_retry', `ipcMain: kb:file:retry failed for fileId=${fileId}`, error, {
        fileId,
        useRemoteParsing,
      })
      throw error
    }
  })

  ipcMain.handle('kb:file:pause', async (_event, fileId: number) => {
    try {
      log.debug(`ipcMain: kb:file:pause, fileId=${fileId}`)
      assertValidFileId(fileId)

      const db = getDatabase()
      const rs = await db.execute({
        sql: 'SELECT * FROM kb_file WHERE id = ?',
        args: [fileId],
      })
      const file = rs.rows[0]
      if (!file) {
        throw new Error('File not found')
      }
      if (file.status !== 'processing') {
        throw new Error('Only processing files can be paused')
      }

      await db.execute({
        sql: 'UPDATE kb_file SET status = ?, processing_started_at = NULL WHERE id = ?',
        args: ['paused', fileId],
      })

      log.info(`[IPC] File paused: ${file.filename} (id=${fileId})`)
      return { success: true }
    } catch (error) {
      reportKnowledgeBaseIpcError('file_pause', `ipcMain: kb:file:pause failed for fileId=${fileId}`, error, {
        fileId,
      })
      throw error
    }
  })

  ipcMain.handle('kb:file:resume', async (_event, fileId: number) => {
    try {
      log.debug(`ipcMain: kb:file:resume, fileId=${fileId}`)
      assertValidFileId(fileId)

      const db = getDatabase()
      const rs = await db.execute({
        sql: 'SELECT * FROM kb_file WHERE id = ?',
        args: [fileId],
      })
      const file = rs.rows[0]
      if (!file) {
        throw new Error('File not found')
      }
      if (file.status !== 'paused') {
        throw new Error('Only paused files can be resumed')
      }

      await db.execute({
        sql: 'UPDATE kb_file SET status = ?, error = NULL WHERE id = ?',
        args: ['pending', fileId],
      })

      log.info(`[IPC] File resume request created: ${file.filename} (id=${fileId})`)
      return { success: true }
    } catch (error) {
      reportKnowledgeBaseIpcError('file_resume', `ipcMain: kb:file:resume failed for fileId=${fileId}`, error, {
        fileId,
      })
      throw error
    }
  })

  ipcMain.handle('kb:file:delete', async (_event, fileId: number) => {
    try {
      log.debug(`ipcMain: kb:file:delete, fileId=${fileId}`)
      assertValidFileId(fileId)

      return await withTransaction(async () => {
        const db = getDatabase()
        const vectorClient = getVectorStoreClient()

        const rs = await db.execute({
          sql: 'SELECT * FROM kb_file WHERE id = ?',
          args: [fileId],
        })
        const file = rs.rows[0]
        if (!file) {
          throw new Error('File not found')
        }

        const indexName = `kb_${file.kb_id}`

        log.info(`[IPC] Deleting vectors: fileId=${fileId}, indexName=${indexName}`)

        try {
          const countResult = await vectorClient.execute({
            sql: `SELECT COUNT(*) as count FROM ${indexName} WHERE json_extract(metadata, '$.fileId') = ?`,
            args: [fileId],
          })
          const vectorCount = Number(countResult.rows[0]?.count || 0)
          log.info(`[IPC] Found ${vectorCount} vectors to delete`)

          if (vectorCount > 0) {
            const deleteResult = await vectorClient.execute({
              sql: `DELETE FROM ${indexName} WHERE json_extract(metadata, '$.fileId') = ?`,
              args: [fileId],
            })
            const rowsDeleted = Number(deleteResult.rowsAffected || 0)
            log.info(`[IPC] Deleted ${rowsDeleted} vectors`)
          } else {
            log.info('[IPC] No vectors to delete')
          }
        } catch (vectorDeleteError) {
          reportKnowledgeBaseIpcError(
            'file_delete_vectors',
            `[IPC] Failed to delete vectors: fileId=${fileId}`,
            vectorDeleteError,
            {
              fileId,
              indexName,
            }
          )
        }

        const res = await db.execute({
          sql: 'DELETE FROM kb_file WHERE id = ?',
          args: [fileId],
        })
        log.info(`[IPC] Deleted file record: fileId=${fileId}, affected rows=${res.rowsAffected ?? 'unknown'}`)

        return { success: true }
      })
    } catch (error) {
      reportKnowledgeBaseIpcError('file_delete', `ipcMain: kb:file:delete failed for fileId=${fileId}`, error, {
        fileId,
      })
      return { success: false, error: getErrorMessage(error) }
    }
  })
}
