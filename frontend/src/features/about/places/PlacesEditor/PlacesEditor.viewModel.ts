import { useState } from 'react'
import type { EditorProps } from '../../../../components/fields'
import { VISIT_KINDS, type City, type Place } from '../../../../services/api'
import { VISIT_LABELS } from '../../legend'
import { removeAt, replaceAt } from '../../list'
import { compareLabels, placeLabel } from '../placeLabel'
import { errorsFor, type Editing } from '../places'
import type { PlacesValue } from '../PlacesSection/PlacesSection.viewModel'

/**
 * The colours, the places (as a list and on the map), and the place being edited in the popup: a
 * city just picked from the search, or one already on the map (picked from either). The list is
 * alphabetical. Nothing is saved until the section is.
 */
export function usePlacesEditorViewModel({ value, onChange, errors }: EditorProps<PlacesValue>) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const places = value.places
  const setPlaces = (next: Place[]) => onChange({ ...value, places: next })
  const select = (index: number) => setEditing({ kind: 'existing', index, place: places[index] })

  return {
    colors: VISIT_KINDS.map((kind) => ({
      key: kind,
      label: VISIT_LABELS[kind],
      value: value.colors[kind],
      onChange: (color: string) => onChange({ ...value, colors: { ...value.colors, [kind]: color } }),
      error: errors[`colors.places.${kind}`],
    })),
    pick: (city: City) => {
      const index = places.findIndex((p) => p.id === city.id)
      if (index >= 0) {
        select(index)
        return
      }
      const { population: _population, ...place } = city
      setEditing({ kind: 'new', place: { ...place, visits: [{ kind: 'visited', note: '' }] } })
    },
    select,
    highlight: editing ? { longitude: editing.place.longitude, latitude: editing.place.latitude, label: editing.place.name } : null,
    popup: editing && {
      key: `${editing.kind}-${editing.place.id}`,
      editing,
      colors: value.colors,
      errors: editing.kind === 'existing' ? errorsFor(errors, editing.index) : {},
      onApply: (place: Place) => {
        setPlaces(editing.kind === 'new' ? [...places, place] : replaceAt(places, editing.index, place))
        setEditing(null)
      },
      onRemove:
        editing.kind === 'existing'
          ? () => {
              setPlaces(removeAt(places, editing.index))
              setEditing(null)
            }
          : undefined,
      onCancel: () => setEditing(null),
    },
    // Alphabetical by label; each row keeps its place's index for editing, removing and its errors.
    list: places
      .map((place, i) => ({ place, i, label: placeLabel(place) }))
      .sort((a, b) => compareLabels(a.label, b.label))
      .map(({ place, i, label }) => ({
        key: `${place.id}-${i}`,
        name: place.name,
        label,
        visits: place.visits.map((v) => VISIT_LABELS[v.kind]).join(', '),
        dots: place.visits.map((v) => ({ key: v.kind, color: value.colors[v.kind] })),
        error: Object.values(errorsFor(errors, i))[0],
        edit: () => select(i),
        remove: () => {
          setPlaces(removeAt(places, i))
          // The popup's place keeps pointing at the same place (or closes, if that's the one removed).
          setEditing((current) => (current?.kind !== 'existing' || current.index < i ? current : current.index === i ? null : { ...current, index: current.index - 1 }))
        },
      })),
    listError: errors.places,
  }
}
