import { describe, expect, it } from 'vitest'
import type { VisitEvent } from '../../services/api'
import { VISIT } from '../../test/fixtures/analytics'
import {
  axisScale,
  countryName,
  describeDevice,
  describeEvent,
  describeTheme,
  formatBucket,
  formatCount,
  formatDuration,
  formatOffset,
  formatPercent,
  reproductionSteps,
} from './format'

const event = (type: VisitEvent['type'], label: string | null = null, detail: Record<string, string> | null = null): VisitEvent => ({
  seq: 1,
  occurredAt: '2026-10-21T09:30:00Z',
  type,
  path: '/apps',
  label,
  detail,
})

describe('numbers', () => {
  it('counts in full up to 10,000, then short', () => {
    expect([0, 999, 1284, 9999].map(formatCount)).toEqual(['0', '999', '1,284', '9,999'])
    expect(formatCount(12_900)).toBe('12.9k')
    expect(formatCount(1_250_000)).toBe('1.3m')
  })

  it('makes an axis of four round steps', () => {
    expect(axisScale(0)).toEqual({ max: 4, ticks: [0, 1, 2, 3, 4] })
    expect(axisScale(7)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] })
    expect(axisScale(42)).toEqual({ max: 80, ticks: [0, 20, 40, 60, 80] })
    expect(axisScale(1_000)).toEqual({ max: 2_000, ticks: [0, 500, 1_000, 1_500, 2_000] })
  })

  it('writes shares and lengths', () => {
    expect(formatPercent(0.4167)).toBe('42%')
    expect([0, 59, 65, 3720, -4].map(formatDuration)).toEqual(['0s', '59s', '1m 05s', '1h 02m', '0s'])
    expect(formatOffset('2026-10-21T09:30:00Z', '2026-10-21T09:30:04Z')).toBe('+0:04')
    expect(formatOffset('2026-10-21T09:30:00Z', '2026-10-21T10:32:03Z')).toBe('+1:02:03')
    expect(formatOffset('2026-10-21T09:30:00Z', '2026-10-21T09:29:00Z')).toBe('+0:00')
  })

  it('names columns on the axis and in full', () => {
    expect(formatBucket('2026-10-21T00:00:00Z', 'day', 'full')).toMatch(/Wed.*21.*Oct/)
    expect(formatBucket('2026-10-21T00:00:00Z', 'day', 'axis', true)).toMatch(/Wed/)
    expect(formatBucket('2026-10-01T00:00:00Z', 'month', 'full')).toMatch(/October.*2026/)
    expect(formatBucket('2026-01-01T00:00:00Z', 'year', 'axis')).toBe('2026')
    expect(formatBucket('2026-10-21T14:05:00Z', '5m', 'full')).toMatch(/–/)
    // Minutes and hours on the axis: just the time (the viewer's, here London's BST).
    expect(formatBucket('2026-10-21T14:05:00Z', '5m', 'axis')).toBe('15:05')
    expect(formatBucket('2026-10-21T14:00:00Z', 'hour', 'axis')).toBe('15:00')
    // An hour in full names its day too.
    expect(formatBucket('2026-10-21T14:00:00Z', 'hour', 'full')).toMatch(/^Wed.*21.*Oct.*15:00–16:00$/)
  })
})

describe('words', () => {
  it('names countries, and leaves anything else as it is', () => {
    expect(countryName('GB')).toBe('United Kingdom')
    expect(countryName('RO')).toBe('Romania')
    expect(countryName('Unknown')).toBe('Unknown')
    expect(countryName('gb')).toBe('gb')
  })

  it('says the theme a visit was in, and where it ended', () => {
    expect(describeTheme({ theme: 'vice', lastTheme: 'vice' })).toBe('vice')
    expect(describeTheme({ theme: 'vice', lastTheme: 'light' })).toBe('vice → light')
    expect(describeTheme({ theme: null, lastTheme: null })).toBe('unknown')
    expect(describeDevice({ device: 'desktop', browser: 'Chrome', operatingSystem: 'macOS' })).toBe('desktop · Chrome · macOS')
  })

  it('tells every kind of step', () => {
    expect(describeEvent(event('pageview'))).toBe('Opened /apps')
    expect(describeEvent(event('click', 'I agree', { element: 'input', checked: 'false' }))).toBe('Clicked “I agree” → unticked')
    expect(describeEvent(event('click', null))).toBe('Clicked “?”')
    expect(describeEvent(event('change', 'Photo file', { element: 'input[type=file]', files: '1' }))).toBe('Changed “Photo file” → 1 file')
    expect(describeEvent(event('change', 'Papers', { element: 'input[type=file]', files: '3' }))).toBe('Changed “Papers” → 3 files')
    expect(describeEvent(event('submit', 'Get updates', { via: 'button' }))).toBe('Sent the form “Get updates”')
    expect(describeEvent(event('event', 'Message sent'))).toBe('Message sent')
    expect(describeEvent(event('error', null))).toBe('ERROR: Unknown error')
  })

  it('writes a visit as steps to reproduce: the setup, then each step, an error with its details', () => {
    const text = reproductionSteps(VISIT)
    const lines = text.split('\n')
    expect(lines[2]).toBe('Setup')
    expect(lines).toContain('- Viewport: 390×664 (screen 390×844)')
    expect(lines).toContain('- Theme: vice → dark')
    expect(lines).toContain('- Language: en-GB, time zone: Europe/London')
    expect(lines).toContain('1. [+0:00] Opened /apps')
    expect(lines).toContain('2. [+0:03] Terms accepted  (on /apps)')
    expect(lines).toContain('     status: 503')
    expect(lines.at(-1)).toBe('16. [+2:05] Left the site (closed the tab or went elsewhere)  (on /contact)')
  })
})
