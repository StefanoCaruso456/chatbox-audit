import type { DocumentParserType } from '@shared/types/settings'
import type { PlatformCapabilities, PlatformType } from './interfaces'

export type PlatformCapabilityKey = keyof PlatformCapabilities

const DISABLED_PLATFORM_CAPABILITIES: PlatformCapabilities = {
  mcp: false,
  knowledgeBase: false,
  advancedLocalDocumentParsing: false,
  mineruDocumentParsing: false,
  appUpdateInstall: false,
  navigationEvents: false,
  windowControls: false,
}

export const WEB_PLATFORM_CAPABILITIES: PlatformCapabilities = Object.freeze({
  ...DISABLED_PLATFORM_CAPABILITIES,
})

export const DESKTOP_PLATFORM_CAPABILITIES: PlatformCapabilities = Object.freeze({
  ...DISABLED_PLATFORM_CAPABILITIES,
  mcp: true,
  knowledgeBase: true,
  advancedLocalDocumentParsing: true,
  mineruDocumentParsing: true,
  appUpdateInstall: true,
  navigationEvents: true,
  windowControls: true,
})

export const TEST_PLATFORM_CAPABILITIES: PlatformCapabilities = WEB_PLATFORM_CAPABILITIES

export const PLATFORM_CAPABILITIES_BY_TYPE: Record<PlatformType, PlatformCapabilities> = {
  web: WEB_PLATFORM_CAPABILITIES,
  mobile: WEB_PLATFORM_CAPABILITIES,
  desktop: DESKTOP_PLATFORM_CAPABILITIES,
}

const DOCUMENT_PARSER_TYPE_ORDER: DocumentParserType[] = ['none', 'local', 'chatbox-ai', 'mineru']

export function supportsDocumentParserType(
  capabilities: PlatformCapabilities,
  documentParserType: DocumentParserType
): boolean {
  switch (documentParserType) {
    case 'none':
      return !capabilities.advancedLocalDocumentParsing
    case 'local':
      return capabilities.advancedLocalDocumentParsing
    case 'chatbox-ai':
      return true
    case 'mineru':
      return capabilities.knowledgeBase && capabilities.mineruDocumentParsing
    default:
      return false
  }
}

export function getAvailableDocumentParserTypes(capabilities: PlatformCapabilities): DocumentParserType[] {
  return DOCUMENT_PARSER_TYPE_ORDER.filter((documentParserType) =>
    supportsDocumentParserType(capabilities, documentParserType)
  )
}

export function getPreferredDocumentParserType(capabilities: PlatformCapabilities): DocumentParserType {
  return capabilities.advancedLocalDocumentParsing ? 'local' : 'none'
}

export function getSupportedDocumentParserType(
  capabilities: PlatformCapabilities,
  requestedType?: DocumentParserType
): DocumentParserType {
  if (requestedType && supportsDocumentParserType(capabilities, requestedType)) {
    return requestedType
  }

  const preferredType = getPreferredDocumentParserType(capabilities)
  if (supportsDocumentParserType(capabilities, preferredType)) {
    return preferredType
  }

  return 'chatbox-ai'
}
