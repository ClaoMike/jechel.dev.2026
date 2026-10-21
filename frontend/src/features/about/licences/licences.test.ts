import { describe, expect, it } from 'vitest'
import type { Licence } from '../../../services/api'
import { isOffered, OFFERED_LICENCES, sameLicence } from './licences'
import { inDisplayOrder } from './LicencesSection/LicencesSection.viewModel'

const car: Licence = { category: 'driving', code: 'B', name: 'Car' }

describe('licences', () => {
  it('compares licences by kind, code and name', () => {
    expect(sameLicence(car, { ...car })).toBe(true)
    expect(sameLicence(car, { ...car, code: 'BE' })).toBe(false)
    expect(sameLicence(car, { ...car, category: 'flying' })).toBe(false)
  })

  it('knows which licences are offered as toggles', () => {
    expect(isOffered(car)).toBe(true)
    expect(isOffered({ category: 'boating', code: '', name: 'Day Skipper' })).toBe(true)
    expect(isOffered({ category: 'driving', code: 'T', name: 'Tractor' })).toBe(false)
    expect(isOffered({ category: 'other', code: 'B', name: 'Car' })).toBe(false)
    expect(OFFERED_LICENCES.driving.length).toBeGreaterThan(5)
  })

  it("shows offered licences in the catalogue's order, then the admin's own as added", () => {
    const own: Licence = { category: 'driving', code: 'T', name: 'Tractor' }
    const moped: Licence = { category: 'driving', code: 'AM', name: 'Moped' }
    expect(inDisplayOrder([own, car, moped])).toEqual([moped, car, own])
  })
})
