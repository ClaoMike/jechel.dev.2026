import { LICENCE_CATEGORIES, type Licence } from '../../../../services/api'
import { isOffered, LICENCE_CATEGORY_LABELS, OFFERED_LICENCES, sameLicence } from '../licences'

/** Offered licences in the catalogue's order, then the admin's own in the order added. */
export function inDisplayOrder(licences: Licence[]): Licence[] {
  const rank = (l: Licence) => (l.category === 'other' ? -1 : OFFERED_LICENCES[l.category].findIndex((o) => sameLicence(l, { ...o, category: l.category })))
  const offered = licences.filter(isOffered).sort((a, b) => rank(a) - rank(b))
  return [...offered, ...licences.filter((l) => !isOffered(l))]
}

/** The licences grouped by kind, in display order, leaving out kinds with none. */
export function useLicencesSectionViewModel(value: Licence[]) {
  return {
    groups: LICENCE_CATEGORIES.map((category) => ({ category, label: LICENCE_CATEGORY_LABELS[category], licences: inDisplayOrder(value.filter((l) => l.category === category)) })).filter(
      (group) => group.licences.length > 0,
    ),
  }
}
