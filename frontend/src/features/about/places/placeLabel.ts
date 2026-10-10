import type { Place } from '../../../services/api'

/** "Manchester, England, United Kingdom", without repeating a region that's the city's own name. */
export function placeLabel(place: Pick<Place, 'name' | 'region' | 'country'>): string {
  return [place.name, fold(place.region) !== fold(place.name) ? place.region : '', place.country].filter(Boolean).join(', ')
}

/** Lower case without accents: "Bucureşti" and "Bucuresti" are the same region. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}
