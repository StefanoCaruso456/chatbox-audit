/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  extractEntryBundlePathFromDocument,
  extractEntryBundlePathFromHtml,
  installBuildFreshnessWatcher,
  probeForNewerBuild,
  shouldInstallBuildFreshnessWatcher,
} from './build-freshness'

describe('build freshness helpers', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('finds the app entry bundle in the current document', () => {
    document.head.innerHTML = `
      <script async src="https://www.googletagmanager.com/gtag/js?id=123"></script>
      <script type="module" crossorigin src="/js/index.CVEn3IPh.js"></script>
    `

    expect(extractEntryBundlePathFromDocument(document)).toBe('/js/index.CVEn3IPh.js')
  })

  it('finds the app entry bundle in fetched html', () => {
    const html = `
      <html>
        <head>
          <script async src="https://cdn.example.com/analytics.js"></script>
          <script type="module" crossorigin src="/assets/index-BUILD123.js"></script>
        </head>
      </html>
    `

    expect(extractEntryBundlePathFromHtml(html, 'https://chatbox-audit.vercel.app/')).toBe('/assets/index-BUILD123.js')
  })

  it('reloads when the fetched html points to a newer entry bundle', async () => {
    document.head.innerHTML = `<script type="module" crossorigin src="/js/index.OLDHASH.js"></script>`
    const reload = vi.fn()
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://chatbox-audit.vercel.app/',
      text: async () => `<script type="module" crossorigin src="/js/index.NEWHASH.js"></script>`,
    })

    await expect(probeForNewerBuild({ doc: document, fetchImpl, reload })).resolves.toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload when the entry bundle matches', async () => {
    document.head.innerHTML = `<script type="module" crossorigin src="/js/index.SAMEHASH.js"></script>`
    const reload = vi.fn()
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://chatbox-audit.vercel.app/',
      text: async () => `<script type="module" crossorigin src="/js/index.SAMEHASH.js"></script>`,
    })

    await expect(probeForNewerBuild({ doc: document, fetchImpl, reload })).resolves.toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('skips nested iframes for the watcher install guard', () => {
    const topLevelWindow = window
    const iframeWindow = {
      top: {},
      location: {
        protocol: 'https:',
      },
    } as Window

    expect(shouldInstallBuildFreshnessWatcher(topLevelWindow)).toBe(true)
    expect(shouldInstallBuildFreshnessWatcher(iframeWindow)).toBe(false)
  })

  it('wires visibility and focus listeners for production freshness checks', () => {
    const addDocumentListener = vi.spyOn(document, 'addEventListener')
    const addWindowListener = vi.spyOn(window, 'addEventListener')
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener')
    const removeWindowListener = vi.spyOn(window, 'removeEventListener')

    const cleanup = installBuildFreshnessWatcher({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        url: 'https://chatbox-audit.vercel.app/',
        text: async () => '',
      }),
      reload: vi.fn(),
    })

    expect(addDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(addWindowListener).toHaveBeenCalledWith('focus', expect.any(Function))

    cleanup()

    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(removeWindowListener).toHaveBeenCalledWith('focus', expect.any(Function))
  })
})
