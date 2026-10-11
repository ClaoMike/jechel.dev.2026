import { describe, expect, it } from 'vitest'
import { placeLabel } from './placeLabel'

describe('placeLabel', () => {
  it('names the city, region and country', () => {
    expect(placeLabel({ name: 'Manchester', region: 'England', country: 'United Kingdom' })).toBe('Manchester, England, United Kingdom')
  })

  it("doesn't repeat a region named like the city, accents aside", () => {
    expect(placeLabel({ name: 'Zurich', region: 'Zürich', country: 'Switzerland' })).toBe('Zurich, Switzerland')
  })

  it('skips an empty region', () => {
    expect(placeLabel({ name: 'Monaco', region: '', country: 'Monaco' })).toBe('Monaco, Monaco')
  })
})
