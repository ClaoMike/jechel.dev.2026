import type { AnalyticsSummary, Page, VisitDetails, VisitSummary } from '../../services/api'

/** A week of numbers, as the API sends them for the Engagement tab. */
export const SUMMARY: AnalyticsSummary = {
  range: '7d',
  bucketSize: 'day',
  from: '2026-10-15T00:00:00Z',
  totals: { visitors: 42, sessions: 57, pageViews: 171, averageSessionSeconds: 95, bounceRate: 0.35, errors: 3 },
  series: Array.from({ length: 7 }, (_, i) => ({ start: `2026-10-${15 + i}T00:00:00Z`, visitors: i + 3, sessions: i + 5, pageViews: 2 * i + 10, errors: i === 5 ? 3 : 0 })),
  topPages: [
    { name: '/', count: 60 },
    { name: '/apps', count: 41 },
    { name: '/about', count: 30 },
  ],
  referrers: [
    { name: 'Direct', count: 30 },
    { name: 'github.com', count: 12 },
  ],
  devices: [
    { name: 'desktop', count: 40 },
    { name: 'mobile', count: 17 },
  ],
  browsers: [
    { name: 'Chrome', count: 35 },
    { name: 'Safari', count: 22 },
  ],
  timeZones: [{ name: 'Europe/London', count: 30 }],
  countries: [
    { name: 'GB', count: 30 },
    { name: 'RO', count: 20 },
    { name: 'Unknown', count: 7 },
  ],
  topClicks: [{ name: 'Apps', count: 25 }],
  topErrors: [{ name: 'GET /api/youtube/videos failed (503)', count: 3 }],
  themes: [
    { name: 'vice', count: 40 },
    { name: 'dark', count: 17 },
  ],
  themeSwitches: [{ name: 'vice → dark', count: 9 }],
  siteEvents: [
    { name: 'Message sent', count: 4 },
    { name: 'Subscribed', count: 2 },
  ],
}

export const EMPTY_SUMMARY: AnalyticsSummary = {
  ...SUMMARY,
  totals: { visitors: 0, sessions: 0, pageViews: 0, averageSessionSeconds: 0, bounceRate: 0, errors: 0 },
  series: SUMMARY.series.map((point) => ({ ...point, visitors: 0, sessions: 0, pageViews: 0, errors: 0 })),
  topPages: [],
  referrers: [],
  devices: [],
  browsers: [],
  timeZones: [],
  countries: [],
  topClicks: [],
  topErrors: [],
  themes: [],
  themeSwitches: [],
  siteEvents: [],
}

export const VISIT_ID = '3f2b8c1e-0000-4000-8000-000000000001'

export const VISIT_SUMMARY: VisitSummary = {
  id: VISIT_ID,
  startedAt: '2026-10-21T09:30:00Z',
  durationSeconds: 125,
  pageViews: 2,
  eventCount: 14,
  errorCount: 1,
  entryPath: '/apps',
  referrerHost: 'github.com',
  device: 'mobile',
  browser: 'Safari',
  operatingSystem: 'iOS',
  timeZone: 'Europe/London',
  theme: 'vice',
  lastTheme: 'dark',
}

export function pageOfVisits(items: VisitSummary[] = [VISIT_SUMMARY, { ...VISIT_SUMMARY, id: '3f2b8c1e-0000-4000-8000-000000000002', errorCount: 0, referrerHost: null, entryPath: '/' }], totalCount = items.length): Page<VisitSummary> {
  return { items, page: 1, pageSize: 20, totalCount }
}

const at = (seconds: number) => new Date(Date.parse('2026-10-21T09:30:00Z') + seconds * 1000).toISOString()

/** A visit that did a bit of everything the tracker records. */
export const VISIT: VisitDetails = {
  id: VISIT_ID,
  startedAt: at(0),
  lastSeenAt: at(125),
  entryPath: '/apps',
  referrer: 'github.com/jechel',
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1',
  device: 'mobile',
  browser: 'Safari',
  operatingSystem: 'iOS',
  country: 'GB',
  language: 'en-GB',
  timeZone: 'Europe/London',
  screenWidth: 390,
  screenHeight: 844,
  viewportWidth: 390,
  viewportHeight: 664,
  theme: 'vice',
  lastTheme: 'dark',
  events: [
    { seq: 1, occurredAt: at(0), type: 'pageview', path: '/apps', label: null, detail: null },
    { seq: 2, occurredAt: at(3), type: 'event', path: '/apps', label: 'Terms accepted', detail: null },
    { seq: 3, occurredAt: at(8), type: 'click', path: '/apps', label: 'Space Game', detail: { element: 'button' } },
    { seq: 4, occurredAt: at(12), type: 'event', path: '/apps', label: 'Swiped to another slide', detail: { app: 'Space Game', slide: '2 of 4' } },
    { seq: 5, occurredAt: at(20), type: 'click', path: '/apps', label: 'Building a game', detail: { element: 'iframe', href: 'https://www.youtube-nocookie.com/embed/abc' } },
    { seq: 6, occurredAt: at(31), type: 'key', path: '/apps', label: 'Escape', detail: null },
    { seq: 7, occurredAt: at(33), type: 'scroll', path: '/apps', label: '75%', detail: null },
    { seq: 8, occurredAt: at(34), type: 'click', path: '/apps', label: 'Contact', detail: { element: 'a', href: '/contact' } },
    { seq: 9, occurredAt: at(34), type: 'pageview', path: '/contact', label: null, detail: null },
    { seq: 10, occurredAt: at(50), type: 'change', path: '/contact', label: 'Message', detail: { element: 'textarea' } },
    { seq: 11, occurredAt: at(52), type: 'change', path: '/contact', label: 'Flag', detail: { element: 'select', value: 'Romania' } },
    { seq: 12, occurredAt: at(60), type: 'submit', path: '/contact', label: 'Contact', detail: { via: 'Enter' } },
    { seq: 13, occurredAt: at(61), type: 'error', path: '/contact', label: 'POST /api/contact failed (503)', detail: { kind: 'request', status: '503' } },
    { seq: 14, occurredAt: at(70), type: 'tab', path: '/contact', label: 'Hidden', detail: null },
    { seq: 15, occurredAt: at(120), type: 'tab', path: '/contact', label: 'Back', detail: null },
    { seq: 16, occurredAt: at(125), type: 'leave', path: '/contact', label: null, detail: null },
  ],
}
