import type { Licence, LicenceCategory } from '../../../services/api'

export const LICENCE_CATEGORY_LABELS: Record<LicenceCategory, string> = {
  driving: 'Driving',
  flying: 'Flying',
  boating: 'Boating',
  other: 'Other',
}

type Offered = Pick<Licence, 'code' | 'name'>

/**
 * The licences the admin can switch on with one click. Driving uses the EU/UK categories,
 * flying the EASA/UK CAA licences, boating the common international and RYA certificates.
 * Anything else can be added by hand.
 */
export const OFFERED_LICENCES: Record<Exclude<LicenceCategory, 'other'>, Offered[]> = {
  driving: [
    { code: 'AM', name: 'Moped' },
    { code: 'A1', name: 'Light motorcycle' },
    { code: 'A2', name: 'Medium motorcycle' },
    { code: 'A', name: 'Motorcycle' },
    { code: 'B', name: 'Car' },
    { code: 'BE', name: 'Car with trailer' },
    { code: 'C1', name: 'Medium truck' },
    { code: 'C', name: 'Truck' },
    { code: 'CE', name: 'Truck with trailer' },
    { code: 'D1', name: 'Minibus' },
    { code: 'D', name: 'Bus' },
  ],
  flying: [
    { code: 'A1/A3', name: 'Drone (open category)' },
    { code: 'A2 CofC', name: 'Drone (A2 certificate)' },
    { code: 'SPL', name: 'Glider pilot' },
    { code: 'LAPL', name: 'Light aircraft pilot' },
    { code: 'PPL(A)', name: 'Private pilot, aeroplanes' },
    { code: 'PPL(H)', name: 'Private pilot, helicopters' },
    { code: 'CPL', name: 'Commercial pilot' },
    { code: 'ATPL', name: 'Airline transport pilot' },
  ],
  boating: [
    { code: 'ICC', name: 'International Certificate of Competence' },
    { code: 'PB2', name: 'Powerboat Level 2' },
    { code: 'PWC', name: 'Personal watercraft (jet ski)' },
    { code: 'SRC', name: 'VHF radio operator' },
    { code: '', name: 'Day Skipper' },
    { code: '', name: 'Coastal Skipper' },
    { code: '', name: 'Yachtmaster' },
  ],
}

export const sameLicence = (a: Licence, b: Licence) => a.category === b.category && a.code === b.code && a.name === b.name

/** True when the licence is one of OFFERED_LICENCES (it then has a toggle, not a row of its own). */
export function isOffered(licence: Licence): boolean {
  return licence.category !== 'other' && OFFERED_LICENCES[licence.category].some((offered) => sameLicence(licence, { ...offered, category: licence.category }))
}
