import { describe, expect, it } from 'vitest'
import { splitBackground } from './legend'

describe('colour backgrounds', () => {
  it('is transparent with no colour and a plain fill with one', () => {
    expect(splitBackground([], 'bands')).toBe('transparent')
    expect(splitBackground(['#111111'], 'slices')).toBe('#111111')
  })

  it('splits several colours into equal bands or slices', () => {
    expect(splitBackground(['#111111', '#222222'], 'bands')).toBe('linear-gradient(to bottom, #111111 0% 50%, #222222 50% 100%)')
    expect(splitBackground(['#a', '#b', '#c'], 'slices')).toMatch(/^conic-gradient\(#a 0% 33\.3+\d*%, #b 33\.3+\d*% 66\.6+\d*%, #c 66\.6+\d*% 100%\)$/)
  })
})
