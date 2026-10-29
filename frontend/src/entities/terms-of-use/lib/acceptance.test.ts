import { describe, expect, it, vi } from 'vitest'
import { TERMS } from '@/test/fixtures/site'
import { acceptedVersion, rememberAcceptance, termsVersion } from './acceptance'

describe('accepting the terms', () => {
  it('versions the terms by when they last changed', () => {
    expect(termsVersion(TERMS)).toBe(TERMS.updatedAt)
    expect(termsVersion({ ...TERMS, updatedAt: null })).toBe('default')
    expect(termsVersion(null)).toBe('unknown')
  })

  it('remembers the version accepted in this browser', () => {
    expect(acceptedVersion()).toBeNull()
    rememberAcceptance('2026-01-01')
    expect(acceptedVersion()).toBe('2026-01-01')
  })

  it('works without storage (private mode): nothing is remembered, nothing breaks', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => rememberAcceptance('x')).not.toThrow()
    expect(acceptedVersion()).toBeNull()
  })
})
