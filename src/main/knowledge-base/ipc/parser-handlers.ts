import { ipcMain } from 'electron'
import type { MineruParseFileParams, MineruParseFileResult, SimpleSuccessResult } from '../../../shared/electron-types'
import { MineruParser, testMineruConnection } from '../parsers'
import { getErrorMessage, log, reportKnowledgeBaseIpcError } from './shared'

const activeMineruParseTasks = new Map<string, AbortController>()

function isMineruCancellationError(error: unknown): boolean {
  return error instanceof Error && (('code' in error && error.code === 'CANCELLED') || error.name === 'AbortError')
}

export function registerKnowledgeBaseParserHandlers() {
  ipcMain.handle('parser:test-mineru', async (_event, apiToken: string): Promise<SimpleSuccessResult> => {
    try {
      log.debug('ipcMain: parser:test-mineru')

      if (!apiToken || !apiToken.trim()) {
        return { success: false, error: 'API token is required' }
      }

      return await testMineruConnection(apiToken.trim())
    } catch (error) {
      log.error('ipcMain: parser:test-mineru failed', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle(
    'parser:parse-file-with-mineru',
    async (_event, params: MineruParseFileParams): Promise<MineruParseFileResult> => {
      const { filePath, filename, mimeType, apiToken } = params

      try {
        log.info(`ipcMain: parser:parse-file-with-mineru, filename=${filename}, mimeType=${mimeType}`)

        if (!filePath || !filePath.trim()) {
          return { success: false, error: 'File path is required' }
        }
        if (!apiToken || !apiToken.trim()) {
          return { success: false, error: 'API token is required' }
        }

        const abortController = new AbortController()
        activeMineruParseTasks.set(filePath, abortController)

        try {
          const parser = new MineruParser(apiToken.trim())
          const content = await parser.parse(
            filePath,
            {
              fileId: Date.now(),
              filename,
              mimeType,
            },
            abortController.signal
          )

          log.info(`ipcMain: parser:parse-file-with-mineru completed, content length=${content.length}`)
          return { success: true, content }
        } finally {
          activeMineruParseTasks.delete(filePath)
        }
      } catch (error) {
        if (isMineruCancellationError(error)) {
          log.info(`ipcMain: parser:parse-file-with-mineru cancelled, filename=${filename}`)
          return { success: false, cancelled: true, error: 'Operation cancelled' }
        }

        reportKnowledgeBaseIpcError('parse_file_with_mineru', 'ipcMain: parser:parse-file-with-mineru failed', error, {
          filename,
          mimeType,
        })
        return { success: false, error: getErrorMessage(error) }
      }
    }
  )

  ipcMain.handle('parser:cancel-mineru-parse', (_event, filePath: string): SimpleSuccessResult => {
    try {
      log.info(`ipcMain: parser:cancel-mineru-parse, filePath=${filePath}`)

      const controller = activeMineruParseTasks.get(filePath)
      if (controller) {
        controller.abort()
        activeMineruParseTasks.delete(filePath)
        log.info(`ipcMain: parser:cancel-mineru-parse succeeded, filePath=${filePath}`)
        return { success: true }
      }

      log.debug(`ipcMain: parser:cancel-mineru-parse - no active task found for filePath=${filePath}`)
      return { success: true }
    } catch (error) {
      log.error('ipcMain: parser:cancel-mineru-parse failed', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })
}
