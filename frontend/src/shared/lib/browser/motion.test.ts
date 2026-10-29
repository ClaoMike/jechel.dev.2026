import { describe, expect, it, vi } from 'vitest'
import { motionAllowed } from './motion'

describe('motionAllowed', () => {
  it('is false when the system asks for reduced motion (as in these tests), true otherwise', () => {
    expect(motionAllowed()).toBe(false)
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    expect(motionAllowed()).toBe(true)
  })

  it('is false in a browser that cannot tell', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(motionAllowed()).toBe(false)
  })
})
