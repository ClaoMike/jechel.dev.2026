import { describe, expect, it } from 'vitest'
import { FLAG_CHOICES, flagName, flagUrl, guessFlag } from './flags'

describe('flags', () => {
  it('finds a flag by its code, whatever its case, and nothing for an unknown one', () => {
    expect(flagUrl('RO')).toMatch(/ro\.svg/)
    expect(flagUrl('ro')).toBe(flagUrl('RO'))
    expect(flagUrl('EU')).toMatch(/eu\.svg/)
    expect(flagUrl('ZZ')).toBeUndefined()
    expect(flagUrl('')).toBeUndefined()
  })

  it('names flags in English', () => {
    expect(flagName('RO')).toBe('Romania')
    expect(flagName('gb')).toBe('United Kingdom')
    expect(flagName('EU')).toBe('European Union')
  })

  it('offers every place by name, alphabetically, without flag-icons extras', () => {
    expect(FLAG_CHOICES.length).toBeGreaterThan(200)
    expect(FLAG_CHOICES.find((c) => c.code === 'RO')?.name).toBe('Romania')
    const names = FLAG_CHOICES.map((c) => c.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(FLAG_CHOICES.every((c) => c.name !== c.code)).toBe(true)
  })

  it('guesses a flag from the words of a label', () => {
    expect(guessFlag('Romanian citizenship')).toBe('RO')
    expect(guessFlag('EU citizenship')).toBe('EU')
    expect(guessFlag('UK Settled Status')).toBe('GB')
    expect(guessFlag('Danish residence')).toBe('DK')
    expect(guessFlag('US green card')).toBe('US')
    expect(guessFlag('Something else')).toBe('')
    expect(guessFlag('Russian')).toBe('')
  })
})
