import { describe, expect, it } from 'vitest'
import { isEmbeddedAppPath } from './root-layout-utils'

describe('isEmbeddedAppPath', () => {
  it('matches the embedded apps root and child routes', () => {
    expect(isEmbeddedAppPath('/embedded-apps')).toBe(true)
    expect(isEmbeddedAppPath('/embedded-apps/chess')).toBe(true)
    expect(isEmbeddedAppPath('/embedded-apps/catalog/classdojo')).toBe(true)
  })

  it('does not match normal app routes', () => {
    expect(isEmbeddedAppPath('/')).toBe(false)
    expect(isEmbeddedAppPath('/session/123')).toBe(false)
    expect(isEmbeddedAppPath('/settings/provider')).toBe(false)
  })
})
