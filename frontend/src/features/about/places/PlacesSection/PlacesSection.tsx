import { DeleteButton } from '../../../../components/DeleteButton/DeleteButton'
import { CloseIcon, PencilIcon, SearchIcon, TrashIcon } from '../../../../components/icons/icons'
import { VISIT_KINDS, type AboutColors, type City, type Place } from '../../../../services/api'
import { EditableSection } from '../../EditableSection/EditableSection'
import { ColorField, REMOVE_DETAIL, TextField, type EditorProps, type FieldErrors } from '../../fields/fields'
import { VISIT_LABELS } from '../../legend'
import { placeLabel } from '../placeLabel'
import { errorsFor, useCitySearchViewModel, usePlacePopupViewModel, usePlacesEditorViewModel, type Editing } from './PlacesSection.viewModel'
import { WorldMap } from '../WorldMap/WorldMap'

export interface PlacesValue {
  places: Place[]
  colors: AboutColors['places']
}

/** "Where I've been": a dotted world map with a pin for every city the admin has added. */
export function PlacesSection({ value, canEdit, onSave }: { value: PlacesValue; canEdit: boolean; onSave: (value: PlacesValue) => Promise<void> }) {
  return (
    <EditableSection title="Where I've been" errorKeys={['places', 'colors.places']} value={value} canEdit={canEdit} onSave={onSave} editor={(props) => <PlacesEditor {...props} />}>
      <Legend colors={value.colors} />
      <WorldMap places={value.places} colors={value.colors} />
      {value.places.length === 0 && <p className="muted">No places yet.</p>}
    </EditableSection>
  )
}

function Legend({ colors }: { colors: AboutColors['places'] }) {
  return (
    <ul className="legend" aria-label="Colours">
      {VISIT_KINDS.map((kind) => (
        <li key={kind}>
          <span className="legend-swatch legend-swatch-round" style={{ background: colors[kind] }} aria-hidden="true" />
          {VISIT_LABELS[kind]}
        </li>
      ))}
      <li className="muted world-map-hint">Pinch or Ctrl + scroll to zoom</li>
    </ul>
  )
}

function PlacesEditor({ value, onChange, errors }: EditorProps<PlacesValue>) {
  const vm = usePlacesEditorViewModel(value.places, (places) => onChange({ ...value, places }))
  const { editing } = vm

  return (
    <div className="editor-list">
      <fieldset className="editor-item">
        <legend>Colours</legend>
        <div className="color-row">
          {VISIT_KINDS.map((kind) => (
            <ColorField
              key={kind}
              label={VISIT_LABELS[kind]}
              value={value.colors[kind]}
              onChange={(color) => onChange({ ...value, colors: { ...value.colors, [kind]: color } })}
              error={errors[`colors.places.${kind}`]}
            />
          ))}
        </div>
      </fieldset>

      <CitySearch onPick={vm.pick} />

      <div className="places-editor-map">
        <WorldMap
          places={value.places}
          colors={value.colors}
          highlight={editing ? { longitude: editing.place.longitude, latitude: editing.place.latitude, label: editing.place.name } : null}
          onSelect={vm.select}
        />
        {editing && (
          <PlacePopup
            key={`${editing.kind}-${editing.place.id}`}
            editing={editing}
            colors={value.colors}
            errors={editing.kind === 'existing' ? errorsFor(errors, editing.index) : {}}
            onApply={vm.apply}
            onRemove={editing.kind === 'existing' ? vm.removeEditing : undefined}
            onCancel={vm.cancel}
          />
        )}
      </div>

      {value.places.length > 0 && (
        <ul className="places-list" aria-label="Places on the map">
          {value.places.map((place, i) => {
            const placeErrors = Object.values(errorsFor(errors, i))
            return (
              <li key={`${place.id}-${i}`}>
                <span className="places-list-dots" aria-hidden="true">
                  {place.visits.map((v) => (
                    <span key={v.kind} className="legend-swatch legend-swatch-round" style={{ background: value.colors[v.kind] }} />
                  ))}
                </span>
                <span className="places-list-name">
                  {placeLabel(place)}
                  <span className="muted"> · {place.visits.map((v) => VISIT_LABELS[v.kind]).join(', ')}</span>
                  {placeErrors.length > 0 && <span className="field-error"> {placeErrors[0]}</span>}
                </span>
                <button type="button" className="icon-button" aria-label={`Edit ${place.name}`} title="Edit" onClick={() => vm.select(i)}>
                  <PencilIcon size={16} />
                </button>
                <DeleteButton what={place.name} action="Remove" detail={REMOVE_DETAIL} onDelete={() => vm.remove(i)}>
                  <TrashIcon size={16} />
                </DeleteButton>
              </li>
            )
          })}
        </ul>
      )}
      {errors.places && <p className="field-error">{errors.places}</p>}
    </div>
  )
}

/** Type a city's name; pick one of the matches (largest first) to place it on the map. */
function CitySearch({ onPick }: { onPick: (city: City) => void }) {
  const vm = useCitySearchViewModel(onPick)
  const { id, results } = vm

  return (
    <div className="city-search">
      <div className="field">
        <label htmlFor={id}>Add a city</label>
        <div className="city-search-input">
          <SearchIcon size={16} />
          <input
            id={id}
            type="search"
            value={vm.query}
            placeholder="Manchester, or Manchester, England"
            autoComplete="off"
            aria-describedby={`${id}-hint`}
            onChange={(e) => vm.setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          />
        </div>
        <p className="field-hint" id={`${id}-hint`}>
          <span>
            Any place with 1,000+ people. City data:{' '}
            <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">
              GeoNames
            </a>
            .
          </span>
        </p>
      </div>
      {vm.searching && <p className="muted city-search-status">Searching…</p>}
      {vm.failed && <p className="field-error">The search isn't working right now. Please try again.</p>}
      {results && results.length === 0 && <p className="muted city-search-status">No places found.</p>}
      {results && results.length > 0 && (
        <ul className="city-search-results" aria-label="Matching places">
          {results.map((city) => (
            <li key={city.id}>
              <button
                type="button"
                className="link-button"
                aria-label={placeLabel(city)}
                onClick={() => vm.pick(city)}
              >
                <strong>{city.name}</strong>
                <span className="muted"> {[city.region !== city.name ? city.region : '', city.country].filter(Boolean).join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface PlacePopupProps {
  editing: Editing
  colors: AboutColors['places']
  errors: FieldErrors
  onApply: (place: Place) => void
  /** Only for a place already on the map. */
  onRemove?: () => void
  onCancel: () => void
}

/** Ticks for worked / studied / visited, each with an optional note that may hold links. */
function PlacePopup({ editing, colors, errors, onApply, onRemove, onCancel }: PlacePopupProps) {
  const vm = usePlacePopupViewModel(editing, onApply)

  return (
    <div className="place-popup" role="dialog" aria-label={placeLabel(editing.place)} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className="place-popup-header">
        <strong>{placeLabel(editing.place)}</strong>
        <button type="button" className="icon-button" aria-label="Close" onClick={onCancel}>
          <CloseIcon size={16} />
        </button>
      </div>
      {vm.visits.map(({ kind, visit, index }) => (
        <div key={kind} className="place-popup-visit">
          <label className="checkbox-field">
            <input type="checkbox" checked={!!visit} onChange={(e) => vm.toggle(kind, e.target.checked)} />
            <span className="legend-swatch legend-swatch-round" style={{ background: colors[kind] }} aria-hidden="true" />
            {VISIT_LABELS[kind]}
          </label>
          {visit && (
            <TextField
              label={`${VISIT_LABELS[kind]}: note (optional)`}
              value={visit.note}
              onChange={(note) => vm.setNote(kind, note)}
              error={errors[`visits[${index}].note`]}
              placeholder={kind === 'studied' ? 'BSc Computer Science at …' : kind === 'worked' ? 'Software Engineer at …' : 'Holiday, 2023'}
              allowLinks
            />
          )}
        </div>
      ))}
      {(vm.error ?? errors.visits) && <p className="field-error">{vm.error ?? errors.visits}</p>}
      <div className="place-popup-actions">
        <button type="button" className="button button-small" onClick={vm.apply}>
          {editing.kind === 'new' ? 'Add to map' : 'Update place'}
        </button>
        {onRemove && (
          <DeleteButton
            what={`${editing.place.name} from the map`}
            action="Remove"
            detail={REMOVE_DETAIL}
            onDelete={onRemove}
            className="button button-secondary button-small"
            label="Remove from map"
          >
            Remove from map
          </DeleteButton>
        )}
      </div>
      <p className="muted editor-note">Changes show on the page once you save this section.</p>
    </div>
  )
}
