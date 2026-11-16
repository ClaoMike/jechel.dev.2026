/**
 * The world map's projection: Natural Earth (the same formula as d3-geo's geoNaturalEarth1),
 * scaled to a MAP_WIDTH-wide box and cropped to the inhabited latitudes. Shared by the
 * script that draws the dots (scripts/build-world-dots.ts) and the pins drawn on top, so
 * both always line up.
 */

export const MAP_WIDTH = 1000
/** Antarctica and the far north are cropped off. */
export const NORTH = 84
export const SOUTH = -58

const RADIANS = Math.PI / 180

/** Natural Earth I, unscaled, in radians (d3-geo's naturalEarth1Raw). */
function naturalEarth(lambda: number, phi: number): [number, number] {
  const phi2 = phi * phi
  const phi4 = phi2 * phi2
  return [
    lambda * (0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4))),
    phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4))),
  ]
}

/** Pixels per unit of the raw projection: the whole longitude range fills MAP_WIDTH. */
export const SCALE = MAP_WIDTH / (2 * naturalEarth(Math.PI, 0)[0])
const TOP = naturalEarth(0, NORTH * RADIANS)[1]
export const MAP_HEIGHT = Math.round(SCALE * (TOP - naturalEarth(0, SOUTH * RADIANS)[1]))

/** [x, y] in the map's box (y grows downwards) for a longitude and latitude in degrees. */
export function project(longitude: number, latitude: number): [number, number] {
  const [x, y] = naturalEarth(longitude * RADIANS, latitude * RADIANS)
  return [MAP_WIDTH / 2 + SCALE * x, SCALE * (TOP - y)]
}

/** The same projection set up in d3-geo terms, for the build script: scale and translate. */
export const D3_TRANSLATE: [number, number] = [MAP_WIDTH / 2, SCALE * TOP]
