import { useEffect, useId, useState } from 'react'
import { VISIT_KINDS, type City, type Place, type PlaceVisit, type VisitKind } from '../../../../services/api'
import { useSearchCitiesQuery } from '../../../../store/api/aboutApi'
import type { FieldErrors } from '../../../../utils/saveErrors'
import { removeAt, replaceAt } from '../../list'

/** What the popup is editing: a city from the search, or a place already on the map. */
export type Editing = { kind: 'new'; place: Place } | { kind: 'existing'; index: number; place: Place }

/** The API's errors for one place, keyed without the "places[i]." prefix. */
export function errorsFor(errors: FieldErrors, index: number): FieldErrors {
  const prefix = `places[${index}].`
  return Object.fromEntries(Object.entries(errors).flatMap(([key, message]) => (key.startsWith(prefix) ? [[key.slice(prefix.length), message]] : [])))
}

/** The place being edited in the popup: a city just picked (or one already on the map), applied or removed. */
export function usePlacesEditorViewModel(places: Place[], setPlaces: (places: Place[]) => void) {
  const [editing, setEditing] = useState<Editing | null>(null)

  return {
    editing,
    pick: (city: City) => {
      const index = places.findIndex((p) => p.id === city.id)
      if (index >= 0) {
        setEditing({ kind: 'existing', index, place: places[index] })
        return
      }
      const { population: _population, ...place } = city
      setEditing({ kind: 'new', place: { ...place, visits: [{ kind: 'visited', note: '' }] } })
    },
    select: (index: number) => setEditing({ kind: 'existing', index, place: places[index] }),
    apply: (place: Place) => {
      if (!editing) return
      setPlaces(editing.kind === 'new' ? [...places, place] : replaceAt(places, editing.index, place))
      setEditing(null)
    },
    remove: (index: number) => setPlaces(removeAt(places, index)),
    removeEditing: () => {
      if (editing?.kind !== 'existing') return
      setPlaces(removeAt(places, editing.index))
      setEditing(null)
    },
    cancel: () => setEditing(null),
  }
}

/** Waits until typing pauses, so each key press doesn't send a request. */
const SEARCH_DELAY_MS = 250

/** Cities whose name starts with what's typed (2 letters or more), largest first, from the store. */
export function useCitySearchViewModel(onPick: (city: City) => void) {
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState('')
  const text = query.trim()
  const active = text.length >= 2

  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => setSearched(text), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [text, active])

  const search = useSearchCitiesQuery(searched, { skip: !active || searched.length < 2 })
  const results = active && searched === text && !search.isFetching && !search.isError ? (search.currentData ?? null) : null

  return {
    id: useId(),
    query,
    setQuery,
    searching: active && search.isFetching,
    failed: active && search.isError && !search.isFetching,
    results,
    pick: (city: City) => {
      onPick(city)
      setQuery('')
    },
  }
}

/** Ticks for worked / studied / visited, each with an optional note. */
export function usePlacePopupViewModel(editing: Editing, onApply: (place: Place) => void) {
  const [visits, setVisits] = useState<PlaceVisit[]>(editing.place.visits)
  const [error, setError] = useState<string | null>(null)

  return {
    visits: VISIT_KINDS.map((kind) => ({ kind, visit: visits.find((v) => v.kind === kind), index: visits.findIndex((v) => v.kind === kind) })),
    error,
    toggle: (kind: VisitKind, on: boolean) => {
      setError(null)
      // Kept in legend order, like the API stores them.
      setVisits(VISIT_KINDS.flatMap((k) => (k === kind ? (on ? [{ kind, note: '' }] : []) : visits.filter((v) => v.kind === k))))
    },
    setNote: (kind: VisitKind, note: string) => setVisits(visits.map((v) => (v.kind === kind ? { ...v, note } : v))),
    apply: () => {
      if (visits.length === 0) {
        setError('Tick at least one: worked, studied or visited.')
        return
      }
      onApply({ ...editing.place, visits })
    },
  }
}
