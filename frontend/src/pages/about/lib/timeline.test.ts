import { describe, expect, it } from 'vitest'
import { EDUCATION, EXPERIENCE, newEntry, toItemView } from './timeline'

const NOW = new Date(2026, 9, 19)

describe('timelines', () => {
  it('maps experience and education to entries and back', () => {
    const role = { title: 'Engineer', company: 'Acme', location: 'Leeds', start: '2020-01-01', end: null, bullets: ['x'] }
    const entry = EXPERIENCE.toEntry(role)
    expect(entry.organization).toBe('Acme')
    expect(EXPERIENCE.fromEntry(entry)).toEqual(role)
    expect(EXPERIENCE.fromEntry({ ...entry, bullets: undefined })).toEqual({ ...role, bullets: [] })
    const course = { title: 'BSc', institution: 'Uni', location: '', start: '2018-09-01', end: '2021-06-01' }
    expect(EDUCATION.fromEntry(EDUCATION.toEntry(course))).toEqual(course)
  })

  it('shows an entry: where, when, whether it is still to come, and its bullets', () => {
    expect(toItemView({ title: 'Engineer', organization: 'Acme', location: 'Leeds', start: '2020-01-01', end: null, bullets: ['x'] }, NOW)).toEqual({
      title: 'Engineer',
      meta: ['Acme', 'Leeds'],
      upcoming: false,
      period: 'Jan 2020 – Present',
      dateTime: '2020-01',
      bullets: ['x'],
    })
    expect(toItemView({ title: 'Next job', organization: 'Globex', location: '', start: '2027-02-01', end: null }, NOW)).toMatchObject({
      meta: ['Globex'],
      upcoming: true,
      period: 'Starting Feb 2027',
      bullets: [],
    })
  })

  it('starts a new entry this month, ongoing, with an empty bullet when the section has bullets', () => {
    expect(newEntry(true)).toMatchObject({ title: '', end: null, bullets: [''] })
    expect(newEntry(false)).not.toHaveProperty('bullets')
    expect(newEntry(false).start).toMatch(/^\d{4}-\d{2}-01$/)
  })
})
