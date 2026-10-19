/** A ring around a city being added, so it stands out on the map. Decorative. */
export function PinHighlight({ at, radius }: { at: [number, number]; radius: number }) {
  return (
    <g transform={`translate(${at[0]} ${at[1]})`} className="world-map-highlight" aria-hidden="true">
      <circle r={radius * 2} />
      <circle r={radius * 0.6} />
    </g>
  )
}
