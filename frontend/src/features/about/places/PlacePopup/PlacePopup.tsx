import { DeleteButton } from '../../../../components/DeleteButton/DeleteButton'
import { REMOVE_DETAIL, TextField } from '../../../../components/fields'
import { CloseIcon } from '../../../../components/icons/icons'
import { usePlacePopupViewModel, type PlacePopupProps } from './PlacePopup.viewModel'

/** Over the map: ticks for worked / studied / visited, each with an optional note that may hold links. */
export function PlacePopup(props: PlacePopupProps) {
  const { onRemove, onCancel } = props
  const vm = usePlacePopupViewModel(props)

  return (
    <div className="place-popup" role="dialog" aria-label={vm.title} onKeyDown={vm.onKeyDown}>
      <div className="place-popup-header">
        <strong>{vm.title}</strong>
        <button type="button" className="icon-button" aria-label="Close" onClick={onCancel}>
          <CloseIcon size={16} />
        </button>
      </div>
      {vm.visits.map((visit) => (
        <div key={visit.key} className="place-popup-visit">
          <label className="checkbox-field">
            <input type="checkbox" checked={visit.ticked} onChange={(e) => visit.toggle(e.target.checked)} />
            <span className="legend-swatch legend-swatch-round" style={{ background: visit.color }} aria-hidden="true" />
            {visit.label}
          </label>
          {visit.note && <TextField label={visit.note.label} value={visit.note.value} onChange={visit.setNote} error={visit.note.error} placeholder={visit.note.placeholder} allowLinks />}
        </div>
      ))}
      {vm.error && <p className="field-error">{vm.error}</p>}
      <div className="place-popup-actions">
        <button type="button" className="button button-small" onClick={vm.apply}>
          {vm.applyLabel}
        </button>
        {onRemove && (
          <DeleteButton what={vm.removeWhat} action="Remove" detail={REMOVE_DETAIL} onDelete={onRemove} className="button button-secondary button-small" label="Remove from map">
            Remove from map
          </DeleteButton>
        )}
      </div>
      <p className="muted editor-note">Changes show on the page once you save this section.</p>
    </div>
  )
}
