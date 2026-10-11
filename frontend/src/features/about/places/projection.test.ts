import { geoNaturalEarth1 } from 'd3-geo'
import { describe, expect, it } from 'vitest'
import { D3_TRANSLATE, MAP_HEIGHT, MAP_WIDTH, project, SCALE } from './projection'
import { WORLD_DOTS } from './worldDots'

describe('project', () => {
  // The dots were drawn with d3-geo; pins use this copy of its formula, so they must agree.
  const d3 = geoNaturalEarth1().scale(SCALE).translate(D3_TRANSLATE)

  it.each([
    [-2.237, 53.481],
    [26.106, 44.432],
    [-74, 40.7],
    [151.2, -33.87],
    [0, 0],
    [-179.9, 80],
  ])('matches d3-geo at %f, %f', (longitude, latitude) => {
    const [x, y] = project(longitude, latitude)
    const [dx, dy] = d3([longitude, latitude])!
    expect(x).toBeCloseTo(dx, 6)
    expect(y).toBeCloseTo(dy, 6)
  })

  it('fits the world into the map box', () => {
    expect(project(-180, 0)[0]).toBeCloseTo(0, 6)
    expect(project(180, 0)[0]).toBeCloseTo(MAP_WIDTH, 6)
    expect(project(0, 84)[1]).toBeCloseTo(0, 6)
    expect(project(0, -58)[1]).toBeCloseTo(MAP_HEIGHT, 0)
  })
})

describe('WORLD_DOTS', () => {
  it('are x, y pairs inside the map', () => {
    expect(WORLD_DOTS.length % 2).toBe(0)
    for (let i = 0; i < WORLD_DOTS.length; i += 2) {
      expect(WORLD_DOTS[i]).toBeGreaterThanOrEqual(0)
      expect(WORLD_DOTS[i]).toBeLessThanOrEqual(MAP_WIDTH)
      expect(WORLD_DOTS[i + 1]).toBeLessThanOrEqual(MAP_HEIGHT)
    }
  })
})
