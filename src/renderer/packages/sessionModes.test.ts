import { describe, expect, it } from 'vitest'
import { defaultSessionsForEN } from '@/packages/initial_data'
import { isUnmodifiedBuiltInPresetSession } from '@/packages/sessionModes'

describe('sessionModes', () => {
  it('recognizes untouched built-in preset sessions', () => {
    const translatorPreset = defaultSessionsForEN.find((session) => session.name === 'Translator (Example)')

    expect(translatorPreset).toBeDefined()
    expect(isUnmodifiedBuiltInPresetSession(translatorPreset!)).toBe(true)
  })

  it('treats edited preset sessions as user conversations', () => {
    const translatorPreset = defaultSessionsForEN.find((session) => session.name === 'Translator (Example)')

    expect(translatorPreset).toBeDefined()
    expect(
      isUnmodifiedBuiltInPresetSession({
        ...translatorPreset!,
        name: 'Translator',
      })
    ).toBe(false)
  })
})
