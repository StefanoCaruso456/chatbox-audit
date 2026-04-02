import { describe, expect, it } from 'vitest'
import {
  DESKTOP_PLATFORM_CAPABILITIES,
  getAvailableDocumentParserTypes,
  getPreferredDocumentParserType,
  getSupportedDocumentParserType,
  supportsDocumentParserType,
  TEST_PLATFORM_CAPABILITIES,
  WEB_PLATFORM_CAPABILITIES,
} from './capabilities'

describe('platform capabilities', () => {
  it('exposes the expected parser types for desktop', () => {
    expect(getAvailableDocumentParserTypes(DESKTOP_PLATFORM_CAPABILITIES)).toEqual(['local', 'chatbox-ai', 'mineru'])
    expect(getPreferredDocumentParserType(DESKTOP_PLATFORM_CAPABILITIES)).toBe('local')
  })

  it('exposes the expected parser types for web-like platforms', () => {
    expect(getAvailableDocumentParserTypes(WEB_PLATFORM_CAPABILITIES)).toEqual(['local', 'chatbox-ai'])
    expect(getAvailableDocumentParserTypes(TEST_PLATFORM_CAPABILITIES)).toEqual(['local', 'chatbox-ai'])
    expect(getPreferredDocumentParserType(WEB_PLATFORM_CAPABILITIES)).toBe('local')
  })

  it('normalizes unsupported parser selections to a supported fallback', () => {
    expect(getSupportedDocumentParserType(WEB_PLATFORM_CAPABILITIES, 'mineru')).toBe('local')
    expect(getSupportedDocumentParserType(WEB_PLATFORM_CAPABILITIES, 'local')).toBe('local')
    expect(getSupportedDocumentParserType(DESKTOP_PLATFORM_CAPABILITIES, 'mineru')).toBe('mineru')
  })

  it('treats MinerU as unavailable without knowledge base support', () => {
    expect(supportsDocumentParserType(WEB_PLATFORM_CAPABILITIES, 'mineru')).toBe(false)
    expect(supportsDocumentParserType(DESKTOP_PLATFORM_CAPABILITIES, 'mineru')).toBe(true)
  })
})
