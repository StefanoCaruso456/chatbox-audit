import { describe, expect, it } from 'vitest'
import { COMPACT_COMPOSER_BREAKPOINT, shouldUseCompactComposerLayout } from './input-layout'

describe('shouldUseCompactComposerLayout', () => {
  it('always uses compact mode on small screens', () => {
    expect(shouldUseCompactComposerLayout({ isSmallScreen: true, composerWidth: 900 })).toBe(true)
  })

  it('uses compact mode when the composer shrinks below the breakpoint', () => {
    expect(
      shouldUseCompactComposerLayout({
        isSmallScreen: false,
        composerWidth: COMPACT_COMPOSER_BREAKPOINT - 1,
      })
    ).toBe(true)
  })

  it('keeps desktop mode when there is enough width', () => {
    expect(
      shouldUseCompactComposerLayout({
        isSmallScreen: false,
        composerWidth: COMPACT_COMPOSER_BREAKPOINT,
      })
    ).toBe(false)
  })
})
