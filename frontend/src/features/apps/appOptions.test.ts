import { describe, expect, it } from 'vitest'
import { hasPlatform, PLATFORM_PRESETS, STORE_SUGGESTIONS } from './appOptions'

describe('app options', () => {
  it('finds a platform whatever its case and spaces', () => {
    expect(hasPlatform(['iOS', 'Web'], 'ios')).toBe(true)
    expect(hasPlatform(['iOS'], '  IOS ')).toBe(true)
    expect(hasPlatform(['iOS'], 'Android')).toBe(false)
  })

  it('offers the common platforms and stores', () => {
    expect(PLATFORM_PRESETS).toContain('Steam Deck')
    expect(STORE_SUGGESTIONS).toContain('Google Play')
  })
})
