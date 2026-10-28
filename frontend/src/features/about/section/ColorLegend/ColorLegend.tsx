import { strings } from '../../../../strings'

export interface LegendItem {
  key: string
  label: string
  color: string
}

/** What each colour means, as swatches with labels; `round` for dots (map pins), and an optional hint after them. */
export function ColorLegend({ items, round = false, hint }: { items: LegendItem[]; round?: boolean; hint?: string }) {
  return (
    <ul className="legend" aria-label={strings.colorLegend.colours}>
      {items.map((item) => (
        <li key={item.key}>
          <span className={round ? 'legend-swatch legend-swatch-round' : 'legend-swatch'} style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
      {hint && <li className="muted world-map-hint">{hint}</li>}
    </ul>
  )
}
