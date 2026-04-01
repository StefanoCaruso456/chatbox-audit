import type { StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import type {
  Config,
  FileMeta,
  KnowledgeBase,
  KnowledgeBaseFile,
  KnowledgeBaseProviderMode,
  KnowledgeBaseSearchResult,
  Settings,
} from './types'
import type { DocumentParserConfig } from './types/settings'

export interface DesktopParsedFilePayload {
  filePath: string
}

export interface DesktopParsedFileResult {
  text?: string
  isSupported: boolean
}

export interface DesktopParsedUrlResult {
  key: string
  title: string
}

export interface KnowledgeBaseCreateParams {
  name: string
  embeddingModel: string
  rerankModel: string
  visionModel?: string
  documentParser?: DocumentParserConfig
  providerMode?: KnowledgeBaseProviderMode
}

export interface KnowledgeBaseUpdateParams {
  id: number
  name?: string
  rerankModel?: string
  visionModel?: string
}

export interface KnowledgeBaseFileMetaSummary {
  id: number
  kbId: number
  filename: string
  mimeType: string
  fileSize: number
  chunkCount: number
  totalChunks: number
  status: string
  createdAt: number
}

export interface KnowledgeBaseFileChunkRequest {
  fileId: number
  chunkIndex: number
}

export interface KnowledgeBaseFileChunk {
  fileId: number
  filename: string
  chunkIndex: number
  text: string
}

export interface MineruParseFileParams {
  filePath: string
  filename: string
  mimeType: string
  apiToken: string
}

export interface MineruParseFileResult {
  success: boolean
  content?: string
  error?: string
  cancelled?: boolean
}

export interface SimpleSuccessResult {
  success: boolean
  error?: string
}

export interface LicenseActivationResult {
  valid: boolean
  instanceId: string
  error: string
}

export interface TrackingEventPayload {
  name: string
  params: Record<string, string>
}

export interface AppLogPayload {
  level: string
  message: string
}

export type WindowTheme = 'dark' | 'light'

export interface ElectronInvokeChannelMap {
  getStoreValue: {
    args: [key: string]
    return: unknown
  }
  setStoreValue: {
    args: [key: string, dataJson: string]
    return: undefined
  }
  delStoreValue: {
    args: [key: string]
    return: undefined
  }
  getAllStoreValues: {
    args: []
    return: string
  }
  getAllStoreKeys: {
    args: []
    return: string[]
  }
  setAllStoreValues: {
    args: [dataJson: string]
    return: undefined
  }
  getStoreBlob: {
    args: [key: string]
    return: string | null
  }
  setStoreBlob: {
    args: [key: string, value: string]
    return: undefined
  }
  delStoreBlob: {
    args: [key: string]
    return: undefined
  }
  listStoreBlobKeys: {
    args: []
    return: string[]
  }
  getVersion: {
    args: []
    return: string
  }
  getPlatform: {
    args: []
    return: string
  }
  getArch: {
    args: []
    return: string
  }
  getHostname: {
    args: []
    return: string
  }
  getDeviceName: {
    args: []
    return: string
  }
  getLocale: {
    args: []
    return: string
  }
  openLink: {
    args: [url: string]
    return: undefined
  }
  ensureShortcutConfig: {
    args: [configJson: string]
    return: undefined
  }
  shouldUseDarkColors: {
    args: []
    return: boolean
  }
  ensureProxy: {
    args: [configJson: string]
    return: undefined
  }
  relaunch: {
    args: []
    return: undefined
  }
  analysticTrackingEvent: {
    args: [dataJson: string]
    return: undefined
  }
  getConfig: {
    args: []
    return: Config
  }
  getSettings: {
    args: []
    return: Settings
  }
  shouldShowAboutDialogWhenStartUp: {
    args: []
    return: boolean
  }
  appLog: {
    args: [dataJson: string]
    return: undefined
  }
  exportLogs: {
    args: []
    return: string
  }
  clearLogs: {
    args: []
    return: undefined
  }
  ensureAutoLaunch: {
    args: [enable: boolean]
    return: undefined
  }
  parseFileLocally: {
    args: [dataJson: string]
    return: string
  }
  parseUrl: {
    args: [url: string]
    return: string
  }
  isFullscreen: {
    args: []
    return: boolean
  }
  setFullscreen: {
    args: [enable: boolean]
    return: undefined
  }
  'install-update': {
    args: []
    return: undefined
  }
  'switch-theme': {
    args: [theme: WindowTheme]
    return: undefined
  }
  'window:minimize': {
    args: []
    return: undefined
  }
  'window:maximize': {
    args: []
    return: undefined
  }
  'window:unmaximize': {
    args: []
    return: undefined
  }
  'window:close': {
    args: []
    return: undefined
  }
  'window:is-maximized': {
    args: []
    return: boolean
  }
  'kb:list': {
    args: []
    return: KnowledgeBase[]
  }
  'kb:create': {
    args: [params: KnowledgeBaseCreateParams]
    return: { id: number; name: string }
  }
  'kb:update': {
    args: [params: KnowledgeBaseUpdateParams]
    return: number
  }
  'kb:delete': {
    args: [kbId: number]
    return: SimpleSuccessResult
  }
  'kb:file:list': {
    args: [kbId: number]
    return: KnowledgeBaseFile[]
  }
  'kb:file:count': {
    args: [kbId: number]
    return: number
  }
  'kb:file:list-paginated': {
    args: [kbId: number, offset?: number, limit?: number]
    return: KnowledgeBaseFile[]
  }
  'kb:file:get-metas': {
    args: [kbId: number, fileIds: number[]]
    return: KnowledgeBaseFileMetaSummary[]
  }
  'kb:file:read-chunks': {
    args: [kbId: number, chunks: KnowledgeBaseFileChunkRequest[]]
    return: KnowledgeBaseFileChunk[]
  }
  'kb:file:upload': {
    args: [kbId: number, file: FileMeta]
    return: { id: number }
  }
  'kb:search': {
    args: [kbId: number, query: string]
    return: KnowledgeBaseSearchResult[]
  }
  'kb:file:retry': {
    args: [fileId: number, useRemoteParsing?: boolean]
    return: SimpleSuccessResult
  }
  'kb:file:pause': {
    args: [fileId: number]
    return: SimpleSuccessResult
  }
  'kb:file:resume': {
    args: [fileId: number]
    return: SimpleSuccessResult
  }
  'kb:file:delete': {
    args: [fileId: number]
    return: SimpleSuccessResult
  }
  'parser:test-mineru': {
    args: [apiToken: string]
    return: SimpleSuccessResult
  }
  'parser:parse-file-with-mineru': {
    args: [params: MineruParseFileParams]
    return: MineruParseFileResult
  }
  'parser:cancel-mineru-parse': {
    args: [filePath: string]
    return: SimpleSuccessResult
  }
  'mcp:stdio-transport:create': {
    args: [serverParams: StdioServerParameters]
    return: string
  }
  'mcp:stdio-transport:start': {
    args: [transportId: string]
    return: undefined
  }
  'mcp:stdio-transport:send': {
    args: [transportId: string, message: JSONRPCMessage]
    return: undefined
  }
  'mcp:stdio-transport:close': {
    args: [transportId: string]
    return: undefined
  }
}

export type ElectronInvokeChannel = keyof ElectronInvokeChannelMap

export interface ElectronMcpStdioTransportEventMap {
  onclose: [stderrMessage: string]
  onerror: [error: Error]
  onmessage: [message: JSONRPCMessage]
}

export type ElectronMcpStdioTransportEvent = keyof ElectronMcpStdioTransportEventMap

export interface ElectronIPC {
  invoke<Channel extends ElectronInvokeChannel>(
    channel: Channel,
    ...args: ElectronInvokeChannelMap[Channel]['args']
  ): Promise<ElectronInvokeChannelMap[Channel]['return']>
  onSystemThemeChange: (callback: () => void) => () => void
  onWindowMaximizedChanged: (callback: (windowMaximized: boolean) => void) => () => void
  onWindowShow: (callback: () => void) => () => void
  onWindowFocused: (callback: () => void) => () => void
  onUpdateDownloaded: (callback: () => void) => () => void
  addMcpStdioTransportEventListener<Event extends ElectronMcpStdioTransportEvent>(
    transportId: string,
    event: Event,
    callback?: (...args: ElectronMcpStdioTransportEventMap[Event]) => void
  ): () => void
  onNavigate: (callback: (path: string) => void) => () => void
}
