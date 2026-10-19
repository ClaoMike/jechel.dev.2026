import { describe, expect, it } from 'vitest'
import { currentMonth, fileNameOf, formatMegabytes, formatMonth, formatPeriod, isSafeUrl, isUpcoming } from './format'

const NOW = new Date(2026, 9, 19) // 19 October 2026

describe('About Me formatting', () => {
  it('writes a month as "Jan 2023"', () => {
    expect(formatMonth('2023-01-01')).toBe('Jan 2023')
    expect(formatMonth('2023-12-01T00:00:00Z')).toBe('Dec 2023')
  })

  it('knows the current month and what is still to come', () => {
    expect(currentMonth(NOW)).toBe('2026-10-01')
    expect(currentMonth(new Date(2026, 0, 31))).toBe('2026-01-01')
    expect(isUpcoming('2026-11-01', NOW)).toBe(true)
    expect(isUpcoming('2026-10-01', NOW)).toBe(false)
    expect(isUpcoming('2025-01-01', NOW)).toBe(false)
  })

  it('writes a period: both ends, an ongoing one, a single month, a future start', () => {
    expect(formatPeriod('2020-01-01', '2022-03-01', NOW)).toBe('Jan 2020 – Mar 2022')
    expect(formatPeriod('2020-01-01', null, NOW)).toBe('Jan 2020 – Present')
    expect(formatPeriod('2021-06-01', '2021-06-01', NOW)).toBe('Jun 2021')
    expect(formatPeriod('2030-03-01', null, NOW)).toBe('Starting Mar 2030')
    expect(formatPeriod('2030-03-01', '2031-01-01', NOW)).toBe('Mar 2030 – Jan 2031')
  })

  it('allows only http(s) links and paths on this site', () => {
    for (const ok of ['https://example.com', 'http://example.com/a?b=c', '/api/files/x.pdf', '  https://x.dev  ']) expect(isSafeUrl(ok), ok).toBe(true)
    for (const bad of ['', '   ', 'javascript:alert(1)', 'data:text/html,hi', '//evil.com', '/\\evil.com', 'ftp://x', 'example.com', 'mailto:a@b.c']) expect(isSafeUrl(bad), bad).toBe(false)
  })

  it("names a file by the end of its link, decoded; anything else as it is", () => {
    expect(fileNameOf('/api/files/papers/My%20CV.pdf')).toBe('My CV.pdf')
    expect(fileNameOf('/api/files/papers/plain.pdf')).toBe('plain.pdf')
    expect(fileNameOf('/api/files/bad%E0%A4%A.pdf')).toBe('bad%E0%A4%A.pdf')
    expect(fileNameOf('/')).toBe('/')
  })

  it('writes sizes in megabytes, with one decimal unless whole', () => {
    expect(formatMegabytes(20 * 1024 * 1024)).toBe('20 MB')
    expect(formatMegabytes(25_500_000)).toBe('24.3 MB')
    expect(formatMegabytes(0)).toBe('0 MB')
  })
})
