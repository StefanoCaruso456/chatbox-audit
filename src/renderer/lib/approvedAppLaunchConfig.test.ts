import { describe, expect, it } from 'vitest'
import { getLaunchUrlValidationMessage, getPreviewReferrerPolicy, normalizeLaunchUrl, normalizeMiroLaunchUrl } from './approvedAppLaunchConfig'

describe('approvedAppLaunchConfig helpers', () => {
  it('converts a Miro board URL into a live-embed URL with ChatBridge-safe defaults', () => {
    expect(normalizeMiroLaunchUrl('https://miro.com/app/board/uXjVOD9zD_k=/')).toBe(
      'https://miro.com/app/live-embed/uXjVOD9zD_k=/?autoplay=true&usePostAuth=true',
    )
  })

  it('accepts a Miro iframe snippet and keeps useful live-embed query params', () => {
    const iframeHtml =
      '<iframe class="miro-embedded-board" src="https://miro.com/app/live-embed/uXjVOD9zD_k=/?moveToWidget=3458764513820540217"></iframe>'

    expect(normalizeMiroLaunchUrl(iframeHtml)).toBe(
      'https://miro.com/app/live-embed/uXjVOD9zD_k=/?moveToWidget=3458764513820540217&autoplay=true&usePostAuth=true',
    )
  })

  it('rejects generic Miro URLs that are not board or live-embed links', () => {
    expect(normalizeLaunchUrl({ id: 'miro' }, 'https://miro.com/')).toBe('')
    expect(getLaunchUrlValidationMessage({ id: 'miro', name: 'Miro' }, 'https://miro.com/')).toBe(
      'Paste a Miro board URL, Miro live-embed URL, or Miro iframe snippet.',
    )
  })

  it('uses a Miro-compatible iframe referrer policy', () => {
    expect(getPreviewReferrerPolicy({ id: 'miro' })).toBe('no-referrer-when-downgrade')
    expect(getPreviewReferrerPolicy({ id: 'padlet' })).toBe('strict-origin-when-cross-origin')
  })
})
