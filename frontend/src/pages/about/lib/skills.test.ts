import { describe, expect, it } from 'vitest'
import type { Skill } from '@/shared/api'
import { axisYears, chartRange, formatExperience, monthIndex, monthsUsed, sortByExperience } from './skills'

const NOW = new Date(2026, 9, 19)
const skill = (name: string, periods: Skill['periods']): Skill => ({ name, periods })

describe('skills', () => {
  it('counts months since year 0', () => {
    expect(monthIndex('2020-03-01')).toBe(2020 * 12 + 2)
  })

  it('counts months used up to now: overlaps once, the future not at all, ongoing up to this month', () => {
    expect(monthsUsed(skill('a', [{ start: '2020-01-01', end: '2020-12-01', uses: ['work'] }]), NOW)).toBe(12)
    expect(
      monthsUsed(
        skill('b', [
          { start: '2020-01-01', end: '2020-12-01', uses: ['work'] },
          { start: '2020-06-01', end: '2021-05-01', uses: ['personal'] },
        ]),
        NOW,
      ),
    ).toBe(17)
    expect(monthsUsed(skill('c', [{ start: '2026-01-01', end: null, uses: ['work'] }]), NOW)).toBe(10)
    expect(monthsUsed(skill('d', [{ start: '2027-01-01', end: null, uses: ['work'] }]), NOW)).toBe(0)
    expect(monthsUsed(skill('e', []), NOW)).toBe(0)
  })

  it('writes experience in months under a year, then in rounded years', () => {
    expect(formatExperience(1)).toBe('1 month')
    expect(formatExperience(0)).toBe('0 months')
    expect(formatExperience(11)).toBe('11 months')
    expect(formatExperience(12)).toBe('1 year')
    expect(formatExperience(17)).toBe('1 year')
    expect(formatExperience(18)).toBe('2 years')
    expect(formatExperience(72)).toBe('6 years')
  })

  it('spans the chart from the earliest January to the end of this year (or the latest end)', () => {
    expect(chartRange([], NOW)).toEqual({ from: 2026 * 12, to: 2027 * 12 })
    expect(chartRange([skill('a', [{ start: '2018-09-01', end: '2020-01-01', uses: ['work'] }])], NOW)).toEqual({ from: 2018 * 12, to: 2027 * 12 })
    expect(chartRange([skill('a', [{ start: '2025-03-01', end: '2029-02-01', uses: ['work'] }])], NOW)).toEqual({ from: 2025 * 12, to: 2030 * 12 })
  })

  it('labels at most 8 years on the axis, stepping by 1, 2, 5 or 10', () => {
    expect(axisYears({ from: 2020 * 12, to: 2027 * 12 })).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027])
    expect(axisYears({ from: 2010 * 12, to: 2027 * 12 })).toEqual([2010, 2015, 2020, 2025])
    expect(axisYears({ from: 1990 * 12, to: 2027 * 12 })).toEqual([1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025])
    expect(axisYears({ from: 1950 * 12, to: 2027 * 12 })).toEqual([1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020])
    expect(axisYears({ from: 2014 * 12, to: 2027 * 12 })).toEqual([2014, 2016, 2018, 2020, 2022, 2024, 2026])
  })

  it('sorts by experience, most first, then by name', () => {
    const skills = [
      skill('Zig', [{ start: '2025-01-01', end: null, uses: ['personal'] }]),
      skill('C#', [{ start: '2018-01-01', end: null, uses: ['work'] }]),
      skill('Ada', [{ start: '2025-01-01', end: null, uses: ['personal'] }]),
    ]
    expect(sortByExperience(skills, NOW).map((s) => s.name)).toEqual(['C#', 'Ada', 'Zig'])
  })
})
