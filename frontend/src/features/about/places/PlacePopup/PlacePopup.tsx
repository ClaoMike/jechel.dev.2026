import { useState } from 'react'
import { DeleteButton } from '../../../../components/DeleteButton/DeleteButton'
import { REMOVE_DETAIL, TextField, type FieldErrors } from '../../../../components/fields'
import { CloseIcon } from '../../../../components/icons/icons'
import { VISIT_KINDS, type AboutColors, type Place, type PlaceVisit, type VisitKind } from '../../../../services/api'
import { VISIT_LABELS } from '../../legend'
import { placeLabel } from '../placeLabel'
import type { Editing } from '../places'
import { strings } from '../../../../strings'

export interface PlacePopupProps {
  editing: Editing
  colors: AboutColors['places']
  errors: FieldErrors
  onApply: (place: Place) => void
  /** Only for a place already on the map. */
  onRemove?: () => void
  onCancel: () => void
}

const NOTE_PLACEHOLDERS: Record<VisitKind, string> = {
  studied: strings.placePopup.bscComputerScience,
  worked: strings.placePopup.softwareEngineer,
  visited: strings.placePopup.holiday2023,
}

/** Over the map: ticks for worked / studied / visited, each with an optional note that may hold links. */
export function PlacePopup({ editing, colors, errors, onApply, onRemove, onCancel }: PlacePopupProps) {
  const [visits, setVisits] = useState<PlaceVisit[]>(editing.place.visits)
  const [error, setError] = useState<string | null>(null)
  const title = placeLabel(editing.place)

  function toggle(kind: VisitKind, on: boolean) {
    setError(null)
    // Kept in legend order, like the API stores them.
    setVisits(VISIT_KINDS.flatMap((k) => (k === kind ? (on ? [{ kind, note: '' }] : []) : visits.filter((v) => v.kind === k))))
  }

  function apply() {
    if (visits.length === 0) {
      setError(strings.placePopup.tickLeastOneWorked)
      return
    }
    onApply({ ...editing.place, visits })
  }

  return (
    <div className="place-popup" role="dialog" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className="place-popup-header">
        <strong>{title}</strong>
        <button type="button" className="icon-button" aria-label={strings.common.close} onClick={onCancel}>
          <CloseIcon size={16} />
        </button>
      </div>
      {VISIT_KINDS.map((kind) => {
        const index = visits.findIndex((v) => v.kind === kind)
        const visit = visits[index]
        return (
          <div key={kind} className="place-popup-visit">
            <label className="checkbox-field">
              <input type="checkbox" checked={!!visit} onChange={(e) => toggle(kind, e.target.checked)} />
              <span className="legend-swatch legend-swatch-round" style={{ background: colors[kind] }} aria-hidden="true" />
              {VISIT_LABELS[kind]}
            </label>
            {visit && (
              <TextField
                label={strings.placePopup.noteOptional(VISIT_LABELS[kind])}
                value={visit.note}
                onChange={(note) => setVisits(visits.map((v) => (v.kind === kind ? { ...v, note } : v)))}
                error={errors[`visits[${index}].note`]}
                placeholder={NOTE_PLACEHOLDERS[kind]}
                allowLinks
              />
            )}
          </div>
        )
      })}
      {(error ?? errors.visits) && <p className="field-error">{error ?? errors.visits}</p>}
      <div className="place-popup-actions">
        <button type="button" className="button button-small" onClick={apply}>
          {editing.kind === 'new' ? strings.placePopup.addMap : strings.placePopup.updatePlace}
        </button>
        {onRemove && (
          <DeleteButton
            what={strings.placePopup.map(editing.place.name)}
            action={strings.common.remove}
            detail={REMOVE_DETAIL}
            onDelete={onRemove}
            className="button button-secondary button-small"
            label={strings.placePopup.removeMap}
          >
            {strings.placePopup.removeMap}
          </DeleteButton>
        )}
      </div>
      <p className="muted editor-note">{strings.placePopup.changesShowPageOnce}</p>
    </div>
  )
}
