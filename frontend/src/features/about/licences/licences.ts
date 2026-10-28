import type { Licence, LicenceCategory } from '../../../services/api'
import { strings } from '../../../strings'

export const LICENCE_CATEGORY_LABELS: Record<LicenceCategory, string> = {
  driving: strings.licences.driving,
  flying: strings.licences.flying,
  boating: strings.licences.boating,
  other: strings.licences.other,
}

type Offered = Pick<Licence, 'code' | 'name'>

/**
 * The licences the admin can switch on with one click. Driving uses the EU/UK categories,
 * flying the EASA/UK CAA licences, boating the common international and RYA certificates.
 * Anything else can be added by hand.
 */
export const OFFERED_LICENCES: Record<Exclude<LicenceCategory, 'other'>, Offered[]> = {
  driving: [
    { code: 'AM', name: strings.licences.moped },
    { code: 'A1', name: strings.licences.lightMotorcycle },
    { code: 'A2', name: strings.licences.mediumMotorcycle },
    { code: 'A', name: strings.licences.motorcycle },
    { code: 'B', name: strings.licences.car },
    { code: 'BE', name: strings.licences.carTrailer },
    { code: 'C1', name: strings.licences.mediumTruck },
    { code: 'C', name: strings.licences.truck },
    { code: 'CE', name: strings.licences.truckTrailer },
    { code: 'D1', name: strings.licences.minibus },
    { code: 'D', name: strings.licences.bus },
  ],
  flying: [
    { code: 'A1/A3', name: strings.licences.droneOpenCategory },
    { code: strings.licences.a2Cofc, name: strings.licences.droneA2Certificate },
    { code: 'SPL', name: strings.licences.gliderPilot },
    { code: 'LAPL', name: strings.licences.lightAircraftPilot },
    { code: 'PPL(A)', name: strings.licences.privatePilotAeroplanes },
    { code: 'PPL(H)', name: strings.licences.privatePilotHelicopters },
    { code: 'CPL', name: strings.licences.commercialPilot },
    { code: 'ATPL', name: strings.licences.airlineTransportPilot },
  ],
  boating: [
    { code: 'ICC', name: strings.licences.internationalCertificateCompetence },
    { code: 'PB2', name: strings.licences.powerboatLevel2 },
    { code: 'PWC', name: strings.licences.personalWatercraftJetSki },
    { code: 'SRC', name: strings.licences.vhfRadioOperator },
    { code: '', name: strings.licences.daySkipper },
    { code: '', name: strings.licences.coastalSkipper },
    { code: '', name: strings.licences.yachtmaster },
  ],
}

export const sameLicence = (a: Licence, b: Licence) => a.category === b.category && a.code === b.code && a.name === b.name

/** True when the licence is one of OFFERED_LICENCES (it then has a toggle, not a row of its own). */
export function isOffered(licence: Licence): boolean {
  return licence.category !== 'other' && OFFERED_LICENCES[licence.category].some((offered) => sameLicence(licence, { ...offered, category: licence.category }))
}

/** Offered licences in the catalogue's order, then the admin's own in the order added. */
export function inDisplayOrder(licences: Licence[]): Licence[] {
  const rank = (l: Licence) => (l.category === 'other' ? -1 : OFFERED_LICENCES[l.category].findIndex((o) => sameLicence(l, { ...o, category: l.category })))
  const offered = licences.filter(isOffered).sort((a, b) => rank(a) - rank(b))
  return [...offered, ...licences.filter((l) => !isOffered(l))]
}
