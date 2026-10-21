/** Engagement: what features/analytics records about visits, and the admin's Engagement tab. */

import { API_BASE_URL, type Page, get, http, post } from '../http'

export const VISIT_EVENT_TYPES = ['pageview', 'click', 'key', 'change', 'submit', 'event', 'scroll', 'tab', 'error', 'leave'] as const
export type VisitEventType = (typeof VISIT_EVENT_TYPES)[number]

/** Where and on what a visit started. Sizes are CSS pixels. */
export interface VisitInfo {
  path: string
  referrer: string
  language: string
  timeZone: string
  screenWidth: number
  screenHeight: number
  viewportWidth: number
  viewportHeight: number
  /** The theme the visit started in. */
  theme: string
  /** The theme on show now (the last batch's is the one the visit ended in). */
  currentTheme: string
}

export interface VisitEventInput {
  /** Counter within the visit, from 1: the API stores each number once. */
  seq: number
  type: VisitEventType
  path: string
  /** The button's text, the error message, the event's name. */
  label?: string
  /** More about it, e.g. an error's stack or a link's address. Strings only. */
  detail?: Record<string, string>
  /** How long ago it happened when sent; the API dates it with its own clock. */
  ageMs: number
}

export interface VisitBatch {
  sessionId: string
  session: VisitInfo
  events: VisitEventInput[]
}

export interface NamedCount {
  name: string
  count: number
}

/** Last hour, last 24 hours, 7 / 30 / 90 days, 12 months, 60 months, everything. */
export const ANALYTICS_RANGES = ['1h', '24h', '7d', '30d', '90d', '1y', '5y', 'all'] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]

/** How much time one column of the chart covers. */
export type BucketSize = '5m' | 'hour' | 'day' | 'month' | 'year'

/** One column of the chart. Visits count when they started; page views and errors when they happened. */
export interface SeriesPoint {
  /** ISO 8601, UTC: the column's start. */
  start: string
  visitors: number
  sessions: number
  pageViews: number
  errors: number
}

export interface AnalyticsSummary {
  range: AnalyticsRange
  bucketSize: BucketSize
  /** ISO 8601: where the period starts (the first column's start). */
  from: string
  totals: {
    /** Unique per day, added up. */
    visitors: number
    sessions: number
    pageViews: number
    averageSessionSeconds: number
    /** 0 to 1: visits that saw one page and did nothing else. */
    bounceRate: number
    errors: number
  }
  /** Oldest first; the last is the current, partial one. */
  series: SeriesPoint[]
  topPages: NamedCount[]
  referrers: NamedCount[]
  devices: NamedCount[]
  browsers: NamedCount[]
  timeZones: NamedCount[]
  /** Two-letter codes (Cloudflare's), or "Unknown". */
  countries: NamedCount[]
  topClicks: NamedCount[]
  topErrors: NamedCount[]
  /** The theme visits ended in: what visitors prefer (first-time visitors start in Vice). */
  themes: NamedCount[]
  /** "vice → dark": switches made during visits. */
  themeSwitches: NamedCount[]
  /** What the site reported, e.g. "Message sent" (theme changes have their own list). */
  siteEvents: NamedCount[]
}

export interface VisitSummary {
  id: string
  /** ISO 8601 timestamp. */
  startedAt: string
  durationSeconds: number
  pageViews: number
  eventCount: number
  errorCount: number
  entryPath: string
  referrerHost: string | null
  device: string
  browser: string
  operatingSystem: string
  timeZone: string | null
  /** The theme the visit started in, and the one it ended in. */
  theme: string | null
  lastTheme: string | null
}

export interface VisitEvent {
  seq: number
  /** ISO 8601 timestamp. */
  occurredAt: string
  type: VisitEventType
  path: string
  label: string | null
  detail: Record<string, string> | null
}

export interface VisitDetails {
  id: string
  startedAt: string
  lastSeenAt: string
  entryPath: string
  referrer: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  userAgent: string
  device: string
  browser: string
  operatingSystem: string
  country: string | null
  language: string | null
  timeZone: string | null
  screenWidth: number
  screenHeight: number
  viewportWidth: number
  viewportHeight: number
  theme: string | null
  lastTheme: string | null
  /** In the order they happened. */
  events: VisitEvent[]
}

export const analyticsEndpoints = {
  /** Public. Records a batch of the visit's events (the API ignores the signed-in admin). */
  async send(batch: VisitBatch): Promise<void> {
    await post('/api/analytics/events', batch)
  },

  /**
   * Public. The same, for a closing tab: the browser sends it even after the page is gone.
   * False when it couldn't be queued (no sendBeacon, or too big).
   */
  beacon(batch: VisitBatch): boolean {
    if (typeof navigator.sendBeacon !== 'function') return false
    const body = new Blob([JSON.stringify(batch)], { type: 'application/json' })
    return navigator.sendBeacon(`${API_BASE_URL}/api/analytics/events`, body)
  },

  /** Admin only. The period up to now, split into the chart's columns. */
  summary(range: AnalyticsRange, signal?: AbortSignal): Promise<AnalyticsSummary> {
    return get<AnalyticsSummary>('/api/analytics/summary', { params: { range }, signal })
  },

  /** Admin only. Newest first; `errorsOnly` keeps the visits that hit an error. */
  listSessions(page = 1, pageSize = 20, errorsOnly = false, signal?: AbortSignal): Promise<Page<VisitSummary>> {
    return get<Page<VisitSummary>>('/api/analytics/sessions', { params: { page, pageSize, errorsOnly }, signal })
  },

  /** Admin only. The visit with every event in order. */
  getSession(id: string, signal?: AbortSignal): Promise<VisitDetails> {
    return get<VisitDetails>(`/api/analytics/sessions/${id}`, { signal })
  },

  /** Admin only. For good. */
  async deleteSession(id: string): Promise<void> {
    await http.delete(`/api/analytics/sessions/${id}`)
  },
}
