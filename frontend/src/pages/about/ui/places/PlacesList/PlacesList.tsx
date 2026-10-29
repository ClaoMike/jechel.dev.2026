import { DeleteButton } from '@/shared/ui/DeleteButton'
import { REMOVE_DETAIL } from '@/shared/ui/fields'
import { PencilIcon, TrashIcon } from '@/shared/ui/icons'
import { strings } from '@/shared/i18n'

export interface PlaceRow {
  key: string
  name: string
  /** "Manchester, England, United Kingdom". */
  label: string
  /** "Studied, Worked". */
  visits: string
  dots: { key: string; color: string }[]
  error?: string
  edit: () => void
  remove: () => void
}

/** The places on the map, as a list: each with its colours, what happened there, Edit and Remove. */
export function PlacesList({ places }: { places: PlaceRow[] }) {
  if (places.length === 0) return null
  return (
    <ul className="places-list" aria-label={strings.placesList.placesMap}>
      {places.map((place) => (
        <li key={place.key}>
          <span className="places-list-dots" aria-hidden="true">
            {place.dots.map((dot) => (
              <span key={dot.key} className="legend-swatch legend-swatch-round" style={{ background: dot.color }} />
            ))}
          </span>
          <span className="places-list-name">
            {place.label}
            <span className="muted"> · {place.visits}</span>
            {place.error && <span className="field-error"> {place.error}</span>}
          </span>
          <button type="button" className="icon-button" aria-label={strings.placesList.edit(place.name)} title={strings.common.edit2} onClick={place.edit}>
            <PencilIcon size={16} />
          </button>
          <DeleteButton what={place.name} action={strings.common.remove} detail={REMOVE_DETAIL} onDelete={place.remove}>
            <TrashIcon size={16} />
          </DeleteButton>
        </li>
      ))}
    </ul>
  )
}
