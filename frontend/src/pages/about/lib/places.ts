import type { AboutColors, Place } from '@/shared/api'
import type { FieldErrors } from '@/shared/ui/fields'

/** The section's value: the places and the colour of each kind of visit. */
export interface PlacesValue {
  places: Place[]
  colors: AboutColors['places']
}

/** What the popup is editing: a city from the search, or a place already on the map. */
export type Editing = { kind: 'new'; place: Place } | { kind: 'existing'; index: number; place: Place }

/** The API's errors for one place, keyed without the "places[i]." prefix. */
export function errorsFor(errors: FieldErrors, index: number): FieldErrors {
  const prefix = `places[${index}].`
  return Object.fromEntries(Object.entries(errors).flatMap(([key, message]) => (key.startsWith(prefix) ? [[key.slice(prefix.length), message]] : [])))
}
