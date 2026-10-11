import { describe, expect, it } from 'vitest'
import { currentMonth, formatMonth, formatPeriod, isSafeUrl, isUpcoming, fileNameOf } from './format'

const NOW = new Date(2026, 9, 8) // 8 Oct 2026, local time

describe('formatPeriod', () => {
  it('shows a start and an end', () => {
    expect(formatPeriod('2019-06-01', '2022-12-01', NOW)).toBe(`${formatMonth('2019-06-01')} – ${formatMonth('2022-12-01')}`)
  })

  it('shows "Present" for an ongoing role that has started', () => {
    expect(formatPeriod('2023-01-01', null, NOW)).toBe(`${formatMonth('2023-01-01')} – Present`)
  })

  it('shows "Starting" for an ongoing role that starts in the future', () => {
    expect(formatPeriod('2027-03-01', null, NOW)).toBe(`Starting ${formatMonth('2027-03-01')}`)
  })

  it('shows one month when start and end are the same month', () => {
    expect(formatPeriod('2020-06-01', '2020-06-01', NOW)).toBe(formatMonth('2020-06-01'))
  })
})

describe('dates', () => {
  it('formats a month without shifting it across time zones', () => {
    expect(formatMonth('2023-01-01')).toMatch(/2023/)
    expect(formatMonth('2023-01-01')).not.toMatch(/2022/)
  })

  it('knows the current month and what is upcoming', () => {
    expect(currentMonth(NOW)).toBe('2026-10-01')
    expect(isUpcoming('2026-10-01', NOW)).toBe(false)
    expect(isUpcoming('2026-11-01', NOW)).toBe(true)
  })
})

describe('isSafeUrl', () => {
  it.each([
    ['https://github.com/someone', true],
    ['http://example.com', true],
    ['/resume.pdf', true],
    ['', false],
    ['javascript:alert(1)', false],
    ['data:text/html,hi', false],
    ['//evil.example.com', false],
    ['github.com', false],
  ])('%s → %s', (url, safe) => {
    expect(isSafeUrl(url)).toBe(safe)
  })
})

describe('fileNameOf', () => {
  it.each([
    ['/api/files/22222222-2222-2222-2222-222222222222/My%20CV.pdf', 'My CV.pdf'],
    ['/resume.pdf', 'resume.pdf'],
    ['/api/files/x/bad%E0%A4%A', 'bad%E0%A4%A'],
  ])('%s → %s', (url, name) => {
    expect(fileNameOf(url)).toBe(name)
  })
})
