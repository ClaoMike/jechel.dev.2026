import { useState, type KeyboardEvent } from 'react'
import type { FieldErrors } from '../../../../components/fields'
import { VISIT_KINDS, type AboutColors, type Place, type PlaceVisit, type VisitKind } from '../../../../services/api'
import { VISIT_LABELS } from '../../legend'
import { placeLabel } from '../placeLabel'
import type { Editing } from '../places'

export interface PlacePopupProps {
  editing: Editing
  colors: AboutColors['places']
  errors: FieldErrors
  onApply: (place: Place) => void
  /** Only for a place already on the map. */
  onRemove?: () => void
  onCancel: () => void
}

const NOTE_PLACEHOLDERS: Record<VisitKind, string> = { studied: 'BSc Computer Science at …', worked: 'Software Engineer at …', visited: 'Holiday, 2023' }

/** Ticks for worked / studied / visited, each with an optional note. */
export function usePlacePopupViewModel({ editing, colors, errors, onApply, onCancel }: PlacePopupProps) {
  const [visits, setVisits] = useState<PlaceVisit[]>(editing.place.visits)
  const [error, setError] = useState<string | null>(null)

  const toggle = (kind: VisitKind, on: boolean) => {
    setError(null)
    // Kept in legend order, like the API stores them.
    setVisits(VISIT_KINDS.flatMap((k) => (k === kind ? (on ? [{ kind, note: '' }] : []) : visits.filter((v) => v.kind === k))))
  }

  return {
    title: placeLabel(editing.place),
    visits: VISIT_KINDS.map((kind) => {
      const index = visits.findIndex((v) => v.kind === kind)
      const visit = visits[index]
      return {
        key: kind,
        label: VISIT_LABELS[kind],
        color: colors[kind],
        ticked: !!visit,
        toggle: (on: boolean) => toggle(kind, on),
        note: visit ? { label: `${VISIT_LABELS[kind]}: note (optional)`, value: visit.note, placeholder: NOTE_PLACEHOLDERS[kind], error: errors[`visits[${index}].note`] } : null,
        setNote: (note: string) => setVisits(visits.map((v) => (v.kind === kind ? { ...v, note } : v))),
      }
    }),
    error: error ?? errors.visits,
    applyLabel: editing.kind === 'new' ? 'Add to map' : 'Update place',
    removeWhat: `${editing.place.name} from the map`,
    apply: () => {
      if (visits.length === 0) {
        setError('Tick at least one: worked, studied or visited.')
        return
      }
      onApply({ ...editing.place, visits })
    },
    onKeyDown: (e: KeyboardEvent) => e.key === 'Escape' && onCancel(),
  }
}
