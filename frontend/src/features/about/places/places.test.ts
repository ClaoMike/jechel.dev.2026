import { describe, expect, it } from 'vitest'
import { placeLabel } from './placeLabel'
import { errorsFor } from './places'
import { MAP_HEIGHT, MAP_WIDTH, project } from './projection'

describe('places', () => {
  it('labels a place without repeating a region that is its own name (accents ignored)', () => {
    expect(placeLabel({ name: 'Manchester', region: 'England', country: 'United Kingdom' })).toBe('Manchester, England, United Kingdom')
    expect(placeLabel({ name: 'Bucuresti', region: 'Bucureşti', country: 'Romania' })).toBe('Bucuresti, Romania')
    expect(placeLabel({ name: 'Monaco', region: '', country: 'Monaco' })).toBe('Monaco, Monaco')
  })

  it("keeps one place's errors, without the places[i]. prefix", () => {
    expect(errorsFor({ 'places[1].visits[0].note': 'Too long.', 'places[0].name': 'x', places: 'list' }, 1)).toEqual({ 'visits[0].note': 'Too long.' })
    expect(errorsFor({}, 0)).toEqual({})
  })

  it('projects the world into the map box: west to east, north to south', () => {
    const [x0] = project(-180, 0)
    const [x1] = project(180, 0)
    expect(x0).toBeCloseTo(0, 5)
    expect(x1).toBeCloseTo(MAP_WIDTH, 5)
    const [, top] = project(0, 84)
    const [, bottom] = project(0, -58)
    expect(top).toBeCloseTo(0, 5)
    expect(bottom).toBeCloseTo(MAP_HEIGHT, 0)
    const [mx, my] = project(-2.24, 53.48)
    const [bx, by] = project(26.1, 44.43)
    expect(bx).toBeGreaterThan(mx)
    expect(by).toBeGreaterThan(my)
  })
})
