import { describe, expect, it } from 'vitest'
import type { VisitDetails } from '../../services/api'
import { describeEvent, formatBucket, formatCount, formatDuration, formatOffset, formatPercent, reproductionSteps } from './format'

describe('formatting', () => {
  it('formats durations, offsets, counts and shares', () => {
    expect([0, 9, 65, 3720].map(formatDuration)).toEqual(['0s', '9s', '1m 05s', '1h 02m'])
    expect(formatOffset('2026-10-12T10:00:00Z', '2026-10-12T10:00:04Z')).toBe('+0:04')
    expect(formatOffset('2026-10-12T10:00:00Z', '2026-10-12T11:02:03Z')).toBe('+1:02:03')
    expect(formatCount(999)).toBe('999')
    expect(formatCount(1284)).toBe('1,284')
    expect(formatCount(12_900)).toMatch(/^12[.,]9\s?K$/)
    expect(formatPercent(0.4167)).toBe('42%')
  })

  it('says what each event was', () => {
    const base = { seq: 1, occurredAt: '2026-10-12T10:00:00Z', path: '/apps', label: null, detail: null }
    expect(describeEvent({ ...base, type: 'pageview' })).toBe('Opened /apps')
    expect(describeEvent({ ...base, type: 'click', label: 'Next', detail: { href: '/apps?page=2' } })).toBe('Clicked “Next” (/apps?page=2)')
    expect(describeEvent({ ...base, type: 'click', label: 'I agree', detail: { checked: 'true' } })).toBe('Clicked “I agree” → ticked')
    expect(describeEvent({ ...base, type: 'event', label: 'Contact form invalid', detail: { fields: 'email' } })).toBe('Contact form invalid (fields: email)')
    expect(describeEvent({ ...base, type: 'error', label: 'TypeError: boom' })).toBe('ERROR: TypeError: boom')
  })
})

describe('formatBucket', () => {
  it('labels days, months and years in UTC, short on the axis and in full in the tooltip', () => {
    // Just after midnight UTC: still the 11th in the Americas, which must not show.
    expect(formatBucket('2026-10-12T00:00:00Z', 'day', 'full')).toMatch(/12/)
    expect(formatBucket('2026-10-12T00:00:00Z', 'day', 'axis', true)).toBe(new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(new Date('2026-10-12T00:00:00Z')))
    expect(formatBucket('2026-10-01T00:00:00Z', 'month', 'full')).toMatch(/2026/)
    expect(formatBucket('2026-01-01T00:00:00Z', 'year', 'axis')).toBe('2026')
  })

  it('gives minutes and hours as a span', () => {
    expect(formatBucket('2026-10-12T14:05:00Z', '5m', 'full')).toMatch(/^.+–.+$/)
    expect(formatBucket('2026-10-12T14:00:00Z', 'hour', 'full')).toMatch(/, .+–.+$/)
  })
})

describe('reproductionSteps', () => {
  const visit: VisitDetails = {
    id: 'v1',
    startedAt: '2026-10-12T10:00:00Z',
    lastSeenAt: '2026-10-12T10:00:09Z',
    entryPath: '/',
    referrer: 'www.linkedin.com/feed',
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    userAgent: 'Mozilla/5.0 (iPhone…)',
    device: 'mobile',
    browser: 'Safari',
    operatingSystem: 'iOS',
    country: null,
    language: 'en-GB',
    timeZone: 'Europe/London',
    screenWidth: 393,
    screenHeight: 852,
    viewportWidth: 393,
    viewportHeight: 660,
    theme: 'vice',
    lastTheme: 'dark',
    events: [
      { seq: 1, occurredAt: '2026-10-12T10:00:00Z', type: 'pageview', path: '/', label: null, detail: null },
      { seq: 2, occurredAt: '2026-10-12T10:00:04Z', type: 'click', path: '/', label: 'Apps', detail: { href: '/apps' } },
      { seq: 3, occurredAt: '2026-10-12T10:00:09Z', type: 'error', path: '/apps', label: 'TypeError: boom', detail: { stack: 'TypeError: boom\nat AppsPage' } },
    ],
  }

  it('gives the setup, then numbered, timed steps with the error stack', () => {
    const text = reproductionSteps(visit)

    expect(text).toContain('- Device: mobile · Safari · iOS')
    expect(text).toContain('- Viewport: 393×660 (screen 393×852)')
    expect(text).toContain('- Theme: vice → dark')
    expect(text).toContain('- Started on: / (from www.linkedin.com/feed)')
    expect(text).toContain('1. [+0:00] Opened /')
    expect(text).toContain('2. [+0:04] Clicked “Apps” (/apps)  (on /)')
    expect(text).toContain('3. [+0:09] ERROR: TypeError: boom  (on /apps)')
    expect(text).toContain('     stack: TypeError: boom\n       at AppsPage')
  })
})
