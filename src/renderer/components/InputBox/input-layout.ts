export const COMPACT_COMPOSER_BREAKPOINT = 560

export function shouldUseCompactComposerLayout(options: {
  isSmallScreen: boolean
  composerWidth: number | null
}): boolean {
  return options.isSmallScreen || (options.composerWidth !== null && options.composerWidth < COMPACT_COMPOSER_BREAKPOINT)
}
