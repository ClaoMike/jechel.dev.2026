import type { Place } from '../../../services/api'

/** "Manchester, England, United Kingdom", without repeating a region that's the city's own name. */
export function placeLabel(place: Pick<Place, 'name' | 'region' | 'country'>): string {
  return [place.name, fold(place.region) !== fold(place.name) ? place.region : '', place.country].filter(Boolean).join(', ')
}

/** Lower case without accents: "Bucureşti" and "Bucuresti" are the same region. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

const collator = new Intl.Collator('en', { sensitivity: 'base' })

/** For sorting labels alphabetically: "Århus" next to "Aachen", "bath" before "Cardiff". Ties fall back to plain order. */
export function compareLabels(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)
}
