import type { BucketSize, VisitDetails, VisitEvent } from '../../services/api'
import { formatDateTime } from '../../utils/formatDate'
import { strings } from '../../strings'

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

const whole = new Intl.NumberFormat()

/** 1284 → "1,284"; from 10,000 on, short: 12,900 → "12.9K". */
export function formatCount(value: number): string {
  return value < 10_000 ? whole.format(value) : compact.format(value)
}

/** A clean axis: 0 to a round maximum in four whole steps (1, 2, 5, 10, 20, 50…). */
export function axisScale(maxValue: number): { max: number; ticks: number[] } {
  const raw = Math.max(1, maxValue) / 4
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(
    1,
    [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw)!,
  )
  return { max: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) }
}

/** 0.4167 → "42%". */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

/** 0 → "0s", 65 → "1m 05s", 3720 → "1h 02m". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return strings.analyticsFormat.minutesSeconds(minutes, String(seconds % 60).padStart(2, '0'))
  return strings.analyticsFormat.hoursMinutes(Math.floor(minutes / 60), String(minutes % 60).padStart(2, '0'))
}

/** Time since the visit started, as on a video: "+0:04", "+12:30", "+1:02:03". */
export function formatOffset(fromIso: string, toIso: string): string {
  const total = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `+${h}:${String(m).padStart(2, '0')}:${s}` : `+${m}:${s}`
}

/** What one column covers, for "Visitors per …". */
export const BUCKET_NAMES: Record<BucketSize, string> = { '5m': strings.analyticsFormat.n5Minutes, hour: 'hour', day: 'day', month: 'month', year: 'year' }

const BUCKET_MS: Partial<Record<BucketSize, number>> = { '5m': 5 * 60_000, hour: 3_600_000 }

/**
 * A column's start, short for the axis ("14:05", "12 Oct", "Oct 26", "2026") or in full for the
 * tooltip ("14:05–14:10", "Mon 12 Oct", "October 2026"). Minutes and hours are in the viewer's time
 * zone; days, months and years are the API's UTC ones. `fewDays` names the weekday instead (7 days).
 */
export function formatBucket(start: string, size: BucketSize, style: 'axis' | 'full', fewDays = false): string {
  const date = new Date(start)
  const format = (options: Intl.DateTimeFormatOptions, utc = true) => new Intl.DateTimeFormat(undefined, utc ? { ...options, timeZone: 'UTC' } : options).format(date)
  const time = (d: Date) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d)

  switch (size) {
    case '5m':
    case 'hour': {
      if (style === 'axis') return time(date)
      const range = `${time(date)}–${time(new Date(date.getTime() + BUCKET_MS[size]!))}`
      return size === 'hour' ? strings.analyticsFormat.dayAndHours(format({ weekday: 'short', day: 'numeric', month: 'short' }, false), range) : range
    }
    case 'day':
      return style === 'full' ? format({ weekday: 'short', day: 'numeric', month: 'short' }) : format(fewDays ? { weekday: 'short' } : { day: 'numeric', month: 'short' })
    case 'month':
      return format(style === 'full' ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' })
    case 'year':
      return format({ year: 'numeric' })
  }
}

/** One line per event, as the timeline and the reproduction steps say it. */
export function describeEvent(event: VisitEvent): string {
  switch (event.type) {
    case 'pageview':
      return strings.analyticsFormat.opened(event.path)
    case 'click':
      return strings.analyticsFormat.clicked(event.label ?? '?', event.detail?.href, event.detail?.checked)
    case 'key':
      return strings.analyticsFormat.pressed(event.label)
    case 'change':
      return strings.analyticsFormat.changed(event.label ?? '?', event.detail?.value, event.detail?.files)
    case 'submit':
      return strings.analyticsFormat.sentForm(event.label ?? '?', event.detail?.via === 'Enter')
    case 'scroll':
      return strings.analyticsFormat.scrolledDownPage(event.label)
    case 'tab':
      return event.label === 'Back' ? strings.analyticsFormat.cameBackTab : strings.analyticsFormat.switchedAwayHidTab
    case 'event':
      return `${event.label}${
        event.detail
          ? ` (${Object.entries(event.detail)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')})`
          : ''
      }`
    case 'error':
      return strings.analyticsFormat.error(event.label ?? strings.analyticsFormat.unknownError)
    case 'leave':
      return strings.analyticsFormat.leftSiteClosedTab
  }
}

const regions = new Intl.DisplayNames(['en-GB'], { type: 'region' })

/** "GB" → "United Kingdom"; anything that isn't a known code ("Unknown") stays as it is. */
export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code
  try {
    return regions.of(code) ?? code
  } catch {
    return code
  }
}

/** "vice", or "vice → dark" when the visit switched. */
export function describeTheme(visit: { theme: string | null; lastTheme: string | null }): string {
  const start = visit.theme ?? 'unknown'
  return visit.lastTheme && visit.lastTheme !== visit.theme ? `${start} → ${visit.lastTheme}` : start
}

/** "desktop · Chrome · macOS". */
export function describeDevice(visit: { device: string; browser: string; operatingSystem: string }): string {
  return `${visit.device} · ${visit.browser} · ${visit.operatingSystem}`
}

/**
 * The visit as plain text to paste into an issue or a chat with an AI: the setup to recreate
 * (browser, sizes, theme, where it started), then every step with its time, errors with their stacks.
 */
export function reproductionSteps(visit: VisitDetails): string {
  const lines = [
    strings.analyticsFormat.visit(visit.id, formatDateTime(visit.startedAt)),
    '',
    strings.analyticsFormat.setup,
    strings.analyticsFormat.device(describeDevice(visit)),
    strings.analyticsFormat.viewportScreen(visit.viewportWidth, visit.viewportHeight, visit.screenWidth, visit.screenHeight),
    strings.analyticsFormat.theme(describeTheme(visit)),
    strings.analyticsFormat.languageTimeZone(visit.language ?? 'unknown', visit.timeZone ?? 'unknown'),
    `- Started on: ${visit.entryPath}${visit.referrer ? ` (from ${visit.referrer})` : ''}`,
    strings.analyticsFormat.userAgent(visit.userAgent),
    '',
    strings.analyticsFormat.steps,
  ]
  visit.events.forEach((event, index) => {
    lines.push(`${index + 1}. [${formatOffset(visit.startedAt, event.occurredAt)}] ${describeEvent(event)}${event.type === 'pageview' ? '' : `  (on ${event.path})`}`)
    if (event.type === 'error' && event.detail) {
      for (const [key, value] of Object.entries(event.detail)) {
        lines.push(`     ${key}: ${value.replace(/\n/g, '\n       ')}`)
      }
    }
  })
  return lines.join('\n')
}
