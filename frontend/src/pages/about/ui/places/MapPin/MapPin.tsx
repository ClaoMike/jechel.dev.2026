/** A dot in one colour, or split into equal slices clockwise from the top; and its outline. */
export function MapPin({ colors, radius }: { colors: string[]; radius: number }) {
  const outlineWidth = radius * 0.35
  if (colors.length <= 1) return <circle r={radius} fill={colors[0] ?? 'currentColor'} className="world-map-pin-outline" strokeWidth={outlineWidth} />

  const step = (2 * Math.PI) / colors.length
  const point = (angle: number) => `${radius * Math.sin(angle)} ${-radius * Math.cos(angle)}`
  return (
    <>
      {colors.map((color, i) => (
        <path key={i} d={`M0 0L${point(i * step)}A${radius} ${radius} 0 0 1 ${point((i + 1) * step)}Z`} fill={color} />
      ))}
      <circle r={radius} fill="none" className="world-map-pin-outline" strokeWidth={outlineWidth} />
    </>
  )
}
