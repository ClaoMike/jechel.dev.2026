import { useEffect, useId, useState } from 'react'
import { CloseIcon, PencilIcon, SearchIcon, TrashIcon } from '../../../components/icons'
import { api, VISIT_KINDS, type AboutColors, type City, type Place, type PlaceVisit, type VisitKind } from '../../../services/api'
import { EditableSection } from '../EditableSection'
import { ColorField, TextField, type EditorProps, type FieldErrors } from '../fields'
import { VISIT_LABELS } from '../legend'
import { removeAt, replaceAt } from '../list'
import { placeLabel } from './placeLabel'
import { WorldMap } from './WorldMap'

export interface PlacesValue {
  places: Place[]
  colors: AboutColors['places']
}

/** "Where I've been": a dotted world map with a pin for every city the admin has added. */
export function PlacesSection({ value, canEdit, onSave }: { value: PlacesValue; canEdit: boolean; onSave: (value: PlacesValue) => Promise<void> }) {
  return (
    <EditableSection title="Where I've been" value={value} canEdit={canEdit} onSave={onSave} editor={(props) => <PlacesEditor {...props} />}>
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

/** What the popup is editing: a city from the search, or a place already on the map. */
type Editing = { kind: 'new'; place: Place } | { kind: 'existing'; index: number; place: Place }

function PlacesEditor({ value, onChange, errors }: EditorProps<PlacesValue>) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const setPlaces = (places: Place[]) => onChange({ ...value, places })

  function pick(city: City) {
    const index = value.places.findIndex((p) => p.id === city.id)
    if (index >= 0) {
      setEditing({ kind: 'existing', index, place: value.places[index] })
      return
    }
    const { population: _population, ...place } = city
    setEditing({ kind: 'new', place: { ...place, visits: [{ kind: 'visited', note: '' }] } })
  }

  function apply(place: Place) {
    if (!editing) return
    setPlaces(editing.kind === 'new' ? [...value.places, place] : replaceAt(value.places, editing.index, place))
    setEditing(null)
  }

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

      <CitySearch onPick={pick} />

      <div className="places-editor-map">
        <WorldMap
          places={value.places}
          colors={value.colors}
          highlight={editing ? { longitude: editing.place.longitude, latitude: editing.place.latitude, label: editing.place.name } : null}
          onSelect={(index) => setEditing({ kind: 'existing', index, place: value.places[index] })}
        />
        {editing && (
          <PlacePopup
            key={`${editing.kind}-${editing.place.id}`}
            editing={editing}
            colors={value.colors}
            errors={editing.kind === 'existing' ? errorsFor(errors, editing.index) : {}}
            onApply={apply}
            onRemove={editing.kind === 'existing' ? () => (setPlaces(removeAt(value.places, editing.index)), setEditing(null)) : undefined}
            onCancel={() => setEditing(null)}
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
                <button type="button" className="icon-button" aria-label={`Edit ${place.name}`} title="Edit" onClick={() => setEditing({ kind: 'existing', index: i, place })}>
                  <PencilIcon size={16} />
                </button>
                <button type="button" className="icon-button icon-button-danger" aria-label={`Remove ${place.name}`} title="Remove" onClick={() => setPlaces(removeAt(value.places, i))}>
                  <TrashIcon size={16} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {errors.places && <p className="field-error">{errors.places}</p>}
    </div>
  )
}

/** The API's errors for one place, keyed without the "places[i]." prefix. */
function errorsFor(errors: FieldErrors, index: number): FieldErrors {
  const prefix = `places[${index}].`
  return Object.fromEntries(Object.entries(errors).flatMap(([key, message]) => (key.startsWith(prefix) ? [[key.slice(prefix.length), message]] : [])))
}

/** Type a city's name; pick one of the matches (largest first) to place it on the map. */
function CitySearch({ onPick }: { onPick: (city: City) => void }) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'error' } | { status: 'done'; cities: City[] }>({ status: 'idle' })

  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) return
    const controller = new AbortController()
    // Waits until typing pauses, so each key press doesn't send a request.
    const timer = window.setTimeout(() => {
      setState({ status: 'loading' })
      api.places
        .searchCities(text, controller.signal)
        .then((cities) => setState({ status: 'done', cities }))
        .catch(() => {
          if (!controller.signal.aborted) setState({ status: 'error' })
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const results = query.trim().length >= 2 && state.status === 'done' ? state.cities : null

  return (
    <div className="city-search">
      <div className="field">
        <label htmlFor={id}>Add a city</label>
        <div className="city-search-input">
          <SearchIcon size={16} />
          <input
            id={id}
            type="search"
            value={query}
            placeholder="Manchester, or Manchester, England"
            autoComplete="off"
            aria-describedby={`${id}-hint`}
            onChange={(e) => setQuery(e.target.value)}
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
      {state.status === 'loading' && <p className="muted city-search-status">Searching…</p>}
      {state.status === 'error' && query.trim().length >= 2 && <p className="field-error">The search isn't working right now. Please try again.</p>}
      {results && results.length === 0 && <p className="muted city-search-status">No places found.</p>}
      {results && results.length > 0 && (
        <ul className="city-search-results" aria-label="Matching places">
          {results.map((city) => (
            <li key={city.id}>
              <button
                type="button"
                className="link-button"
                aria-label={placeLabel(city)}
                onClick={() => {
                  onPick(city)
                  setQuery('')
                }}
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
  const [visits, setVisits] = useState<PlaceVisit[]>(editing.place.visits)
  const [error, setError] = useState<string | null>(null)
  const noteOf = (kind: VisitKind) => visits.find((v) => v.kind === kind)

  function toggle(kind: VisitKind, on: boolean) {
    setError(null)
    // Kept in legend order, like the API stores them.
    setVisits(VISIT_KINDS.flatMap((k) => (k === kind ? (on ? [{ kind, note: '' }] : []) : visits.filter((v) => v.kind === k))))
  }

  function apply() {
    if (visits.length === 0) {
      setError('Tick at least one: worked, studied or visited.')
      return
    }
    onApply({ ...editing.place, visits })
  }

  return (
    <div className="place-popup" role="dialog" aria-label={placeLabel(editing.place)} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className="place-popup-header">
        <strong>{placeLabel(editing.place)}</strong>
        <button type="button" className="icon-button" aria-label="Close" onClick={onCancel}>
          <CloseIcon size={16} />
        </button>
      </div>
      {VISIT_KINDS.map((kind) => {
        const visit = noteOf(kind)
        const index = visits.findIndex((v) => v.kind === kind)
        return (
          <div key={kind} className="place-popup-visit">
            <label className="checkbox-field">
              <input type="checkbox" checked={!!visit} onChange={(e) => toggle(kind, e.target.checked)} />
              <span className="legend-swatch legend-swatch-round" style={{ background: colors[kind] }} aria-hidden="true" />
              {VISIT_LABELS[kind]}
            </label>
            {visit && (
              <TextField
                label={`${VISIT_LABELS[kind]}: note (optional)`}
                value={visit.note}
                onChange={(note) => setVisits(visits.map((v) => (v.kind === kind ? { ...v, note } : v)))}
                error={errors[`visits[${index}].note`]}
                placeholder={kind === 'studied' ? 'BSc Computer Science at …' : kind === 'worked' ? 'Software Engineer at …' : 'Holiday, 2023'}
                allowLinks
              />
            )}
          </div>
        )
      })}
      {(error ?? errors.visits) && <p className="field-error">{error ?? errors.visits}</p>}
      <div className="place-popup-actions">
        <button type="button" className="button button-small" onClick={apply}>
          {editing.kind === 'new' ? 'Add to map' : 'Update place'}
        </button>
        {onRemove && (
          <button type="button" className="button button-secondary button-small" onClick={onRemove}>
            Remove from map
          </button>
        )}
      </div>
      <p className="muted editor-note">Changes show on the page once you save this section.</p>
    </div>
  )
}
