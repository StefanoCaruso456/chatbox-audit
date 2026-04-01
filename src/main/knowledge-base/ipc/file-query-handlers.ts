import { ipcMain } from 'electron'
import type { KnowledgeBaseFileChunkRequest } from '../../../shared/electron-types'
import { getDatabase } from '../db'
import { readChunks, searchKnowledgeBase } from '../file-loaders'
import {
  assertChunkRequestLimit,
  assertValidKnowledgeBaseId,
  assertValidPagination,
  log,
  mapKnowledgeBaseFileMetaRow,
  mapKnowledgeBaseFileRow,
  reportKnowledgeBaseIpcError,
} from './shared'

export function registerKnowledgeBaseFileQueryHandlers() {
  ipcMain.handle('kb:file:list', async (_event, kbId: number) => {
    try {
      log.debug(`ipcMain: kb:file:list, kbId=${kbId}`)
      assertValidKnowledgeBaseId(kbId)

      const db = getDatabase()
      const rs = await db.execute({
        sql: 'SELECT * FROM kb_file WHERE kb_id = ?',
        args: [kbId],
      })
      return rs.rows.map((row) => mapKnowledgeBaseFileRow(row as never))
    } catch (error) {
      reportKnowledgeBaseIpcError('file_list', `ipcMain: kb:file:list failed for kbId=${kbId}`, error, { kbId })
      throw error
    }
  })

  ipcMain.handle('kb:file:count', async (_event, kbId: number) => {
    try {
      assertValidKnowledgeBaseId(kbId)

      const db = getDatabase()
      const rs = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM kb_file WHERE kb_id = ?',
        args: [kbId],
      })
      return rs.rows[0].count as number
    } catch (error) {
      reportKnowledgeBaseIpcError('file_count', `ipcMain: kb:file:count failed for kbId=${kbId}`, error, { kbId })
      throw error
    }
  })

  ipcMain.handle('kb:file:list-paginated', async (_event, kbId: number, offset = 0, limit = 20) => {
    try {
      assertValidKnowledgeBaseId(kbId)
      assertValidPagination(offset, limit)

      const db = getDatabase()
      const rs = await db.execute({
        sql: 'SELECT * FROM kb_file WHERE kb_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        args: [kbId, limit, offset],
      })
      return rs.rows.map((row) => mapKnowledgeBaseFileRow(row as never))
    } catch (error) {
      reportKnowledgeBaseIpcError(
        'file_list_paginated',
        `ipcMain: kb:file:list-paginated failed for kbId=${kbId}`,
        error,
        {
          kbId,
          offset,
          limit,
        }
      )
      throw error
    }
  })

  ipcMain.handle('kb:file:get-metas', async (_event, kbId: number, fileIds: number[]) => {
    try {
      log.debug(`ipcMain: kb:file:get-metas, kbId=${kbId}, fileIds=${fileIds.join(',')}`)
      assertValidKnowledgeBaseId(kbId)

      if (!fileIds || fileIds.length === 0) {
        return []
      }
      if (fileIds.length > 100) {
        throw new Error('Too many file IDs requested (max 100)')
      }

      const db = getDatabase()
      const placeholders = fileIds.map(() => '?').join(',')
      const sql = `SELECT id, kb_id, filename, mime_type, file_size, chunk_count, total_chunks, status, created_at FROM kb_file WHERE kb_id = ? AND id IN (${placeholders})`
      const rs = await db.execute({
        sql,
        args: [kbId, ...fileIds],
      })
      return rs.rows.map((row) => mapKnowledgeBaseFileMetaRow(row as never))
    } catch (error) {
      reportKnowledgeBaseIpcError('file_get_metas', `ipcMain: kb:file:get-metas failed for kbId=${kbId}`, error, {
        kbId,
        fileIdsCount: fileIds?.length || 0,
      })
      throw error
    }
  })

  ipcMain.handle('kb:file:read-chunks', async (_event, kbId: number, chunks: KnowledgeBaseFileChunkRequest[]) => {
    try {
      log.debug(`ipcMain: kb:file:read-chunks, kbId=${kbId}, chunks=${chunks.length}`)
      assertValidKnowledgeBaseId(kbId)
      assertChunkRequestLimit(chunks)

      return await readChunks(kbId, chunks)
    } catch (error) {
      reportKnowledgeBaseIpcError('file_read_chunks', `ipcMain: kb:file:read-chunks failed for kbId=${kbId}`, error, {
        kbId,
        chunksCount: chunks?.length || 0,
      })
      throw error
    }
  })

  ipcMain.handle('kb:search', async (_event, kbId: number, query: string) => {
    try {
      log.debug(`ipcMain: kb:search, kbId=${kbId}, query=${query}`)
      assertValidKnowledgeBaseId(kbId)

      if (!query || !query.trim()) {
        throw new Error('Search query is required')
      }
      if (query.length > 1000) {
        throw new Error('Search query too long (max 1000 characters)')
      }

      return await searchKnowledgeBase(kbId, query.trim())
    } catch (error) {
      reportKnowledgeBaseIpcError('search', `ipcMain: kb:search failed for kbId=${kbId}, query=${query}`, error, {
        kbId,
        queryLength: query?.length || 0,
      })
      throw error
    }
  })
}
