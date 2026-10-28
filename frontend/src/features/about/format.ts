import { strings } from '../../strings'

const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** "2023-01-01" → "Jan 2023" (in the viewer's locale). */
export function formatMonth(date: string): string {
  return monthFormat.format(new Date(`${date.slice(0, 10)}T00:00:00Z`))
}

/** The first of the current month, "YYYY-MM-01". */
export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

/** True when the item starts after the current month. */
export function isUpcoming(start: string, now = new Date()): boolean {
  return start.slice(0, 7) > currentMonth(now).slice(0, 7)
}

/** "Jan 2020 – Mar 2022", "Jan 2020 – Present", or "Starting Mar 2030" for an open-ended future start. */
export function formatPeriod(start: string, end: string | null, now = new Date()): string {
  if (end === null) return isUpcoming(start, now) ? strings.aboutFormat.starting(formatMonth(start)) : strings.aboutFormat.present(formatMonth(start))
  if (start.slice(0, 7) === end.slice(0, 7)) return formatMonth(start)
  return `${formatMonth(start)} – ${formatMonth(end)}`
}

/**
 * Same rule as the API (AboutRules.IsSafeUrl): an http(s) URL or a path on this site. Checked
 * again before rendering a link, so a bad value can never become a javascript: href.
 */
export function isSafeUrl(url: string): boolean {
  const value = url.trim()
  if (!value) return false
  if (value.startsWith('/')) return !value.startsWith('//') && !value.startsWith('/\\')
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/** "/api/files/…/My%20CV.pdf" → "My CV.pdf"; any other link is shown as it is. */
export function fileNameOf(url: string): string {
  const last = url.split('/').at(-1) ?? url
  try {
    return decodeURIComponent(last) || url
  } catch {
    return last
  }
}

/** 20971520 → "20 MB", 25500000 → "24.3 MB". */
export function formatMegabytes(bytes: number): string {
  const megabytes = bytes / 1024 / 1024
  return strings.aboutFormat.mb(Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1))
}
