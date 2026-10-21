import type { CSSProperties } from 'react'
import { RichText } from '../../RichText'

export interface PlaceCardProps {
  title: string
  /** Each thing done there: its colour, and its note (or its name, without one). */
  visits: { key: string; color: string; note: string; label: string }[]
  /** Where it sits over the map (by the pin). */
  style: CSSProperties
  /** The pointer moved onto the card: keep it up, to click its links. */
  keepOpen: () => void
  hideSoon: () => void
}

/** A place's details, by its pin: the place, then what happened there. */
export function PlaceCard({ title, visits, style, keepOpen, hideSoon }: PlaceCardProps) {
  return (
    <div className="world-map-card" style={style} onPointerEnter={keepOpen} onPointerLeave={hideSoon}>
      <strong>{title}</strong>
      <ul>
        {visits.map((visit) => (
          <li key={visit.key}>
            <span className="legend-swatch" style={{ background: visit.color }} aria-hidden="true" />
            <span>{visit.note ? <RichText text={visit.note} /> : visit.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
