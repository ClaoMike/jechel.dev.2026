/** The pin as one disc, or equal slices clockwise from the top, one per colour; and its outline. */
export function useMapPinViewModel({ colors, radius }: { colors: string[]; radius: number }) {
  const step = (2 * Math.PI) / Math.max(1, colors.length)
  const point = (angle: number) => `${radius * Math.sin(angle)} ${-radius * Math.cos(angle)}`
  return {
    fill: colors.length <= 1 ? (colors[0] ?? 'currentColor') : null,
    slices: colors.length > 1 ? colors.map((color, i) => ({ key: i, color, d: `M0 0L${point(i * step)}A${radius} ${radius} 0 0 1 ${point((i + 1) * step)}Z` })) : [],
    outlineWidth: radius * 0.35,
  }
}
