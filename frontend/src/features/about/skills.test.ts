import { describe, expect, it } from 'vitest'
import type { Skill } from '../../services/api'
import { axisYears, chartRange, formatExperience, monthsUsed } from './skills'

const NOW = new Date(2026, 9, 10) // October 2026

const skill = (...periods: [string, string | null][]): Skill => ({ name: 'S', periods: periods.map(([start, end]) => ({ start, end, uses: ['work'] })) })

describe('monthsUsed', () => {
  it('counts both the first and the last month', () => {
    expect(monthsUsed(skill(['2020-01-01', '2020-12-01']), NOW)).toBe(12)
  })

  it('counts an ongoing period up to this month', () => {
    expect(monthsUsed(skill(['2026-01-01', null]), NOW)).toBe(10)
  })

  it('counts overlapping periods once', () => {
    expect(monthsUsed(skill(['2020-01-01', '2020-12-01'], ['2020-07-01', '2021-06-01']), NOW)).toBe(18)
  })

  it('adds up separate periods', () => {
    expect(monthsUsed(skill(['2015-01-01', '2015-06-01'], ['2020-01-01', '2020-06-01']), NOW)).toBe(12)
  })

  it('ignores the future', () => {
    expect(monthsUsed(skill(['2030-01-01', null]), NOW)).toBe(0)
    expect(monthsUsed(skill(['2026-01-01', '2030-12-01']), NOW)).toBe(10)
  })
})

describe('formatExperience', () => {
  it.each([
    [0, '0 months'],
    [1, '1 month'],
    [11, '11 months'],
    [12, '1 year'],
    [17, '1 year'],
    [18, '2 years'],
    [121, '10 years'],
  ])('%i months → %s', (months, text) => {
    expect(formatExperience(months)).toBe(text)
  })
})

describe('chartRange and axisYears', () => {
  it('runs from the first start year to the end of this year', () => {
    const range = chartRange([skill(['2016-10-01', null]), skill(['2019-03-01', '2020-01-01'])], NOW)

    expect(range).toEqual({ from: 2016 * 12, to: 2027 * 12 })
    expect(axisYears(range)).toEqual([2016, 2018, 2020, 2022, 2024, 2026])
  })

  it('reaches a period that ends after this year', () => {
    expect(chartRange([skill(['2025-01-01', '2028-05-01'])], NOW).to).toBe(2029 * 12)
  })

  it('labels every year when there are few', () => {
    expect(axisYears({ from: 2023 * 12, to: 2027 * 12 })).toEqual([2023, 2024, 2025, 2026, 2027])
  })

  it('shows this year when there is nothing to chart', () => {
    expect(chartRange([], NOW)).toEqual({ from: 2026 * 12, to: 2027 * 12 })
  })
})
