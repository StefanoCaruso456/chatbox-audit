import { describe, expect, it } from 'vitest'
import { isTrustedRendererNavigation, parseTrustedExternalUrl } from './security'

describe('parseTrustedExternalUrl', () => {
  it('accepts allowed external protocols', () => {
    expect(parseTrustedExternalUrl('https://chatboxai.app')?.toString()).toBe('https://chatboxai.app/')
    expect(parseTrustedExternalUrl('mailto:support@chatboxai.app')?.toString()).toBe('mailto:support@chatboxai.app')
  })

  it('rejects unsafe or malformed URLs', () => {
    expect(parseTrustedExternalUrl('javascript:alert(1)')).toBeNull()
    expect(parseTrustedExternalUrl('file:///etc/passwd')).toBeNull()
    expect(parseTrustedExternalUrl('not-a-url')).toBeNull()
  })
})

describe('isTrustedRendererNavigation', () => {
  it('allows local packaged renderer navigation', () => {
    expect(
      isTrustedRendererNavigation(
        'file:///Applications/Chatbox/index.html#/settings',
        'file:///Applications/Chatbox/index.html#/chat'
      )
    ).toBe(true)
  })

  it('allows navigation inside the trusted renderer origin', () => {
    expect(isTrustedRendererNavigation('http://localhost:1212/#/settings', 'http://localhost:1212')).toBe(true)
  })

  it('rejects navigation to other local files', () => {
    expect(
      isTrustedRendererNavigation(
        'file:///Applications/Chatbox/untrusted.html',
        'file:///Applications/Chatbox/index.html#/chat'
      )
    ).toBe(false)
  })

  it('rejects navigation to other origins', () => {
    expect(isTrustedRendererNavigation('https://evil.example/phish', 'http://localhost:1212')).toBe(false)
  })
})
