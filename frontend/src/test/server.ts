import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { AboutContent, AnalyticsRange, AnalyticsSummary, BucketSize, AppCategory, AppCategoryRequest, AppDetails, AppRequest, TermsContent, TermsDocument, VisitDetails, VisitSummary } from '../services/api'

export const API = 'http://api.test'

export const TEST_USER = {
  email: 'admin@example.com',
  name: 'Claudiu Jechel',
  pictureUrl: null,
  sessionExpiresInSeconds: 600,
}

/** About Me content used by default. A fresh copy each call, so tests can't leak changes. */
export function aboutContent(): AboutContent {
  return {
    photoUrl: '',
    statuses: [
      { text: 'Romanian citizenship', flag: 'RO' },
      { text: 'UK Settled Status', flag: 'GB' },
    ],
    links: {
      resumeUrl: '/resume.pdf',
      gitHubUrl: 'https://github.com/claudiu',
      linkedInUrl: 'https://www.linkedin.com/in/claudiu',
      instagramUrl: '',
    },
    colors: {
      skills: { work: '#188038', academic: '#1a73e8', personal: '#e8710a' },
      places: { worked: '#188038', studied: '#1a73e8', visited: '#e8710a' },
    },
    places: [
      {
        id: 2643123,
        name: 'Manchester',
        region: 'England',
        country: 'United Kingdom',
        latitude: 53.481,
        longitude: -2.237,
        visits: [
          { kind: 'studied', note: 'BSc at [The University of Manchester](https://www.manchester.ac.uk)' },
          { kind: 'visited', note: '' },
        ],
      },
    ],
    problemSolving: { leetCodeUsername: '', neetCodeLists: [] },
    skills: [
      {
        name: 'C#',
        periods: [
          { start: '2016-10-01', end: '2019-06-01', uses: ['academic'] },
          { start: '2019-06-01', end: null, uses: ['work', 'personal'] },
        ],
      },
      { name: 'Python', periods: [{ start: '2015-10-01', end: '2020-12-01', uses: ['academic'] }] },
    ],
    experience: [
      { title: 'Senior Engineer', company: '[Acme](https://acme.example)', location: 'Remote', start: '2023-01-01', end: null, bullets: ['Built the platform', 'Led the team'] },
      { title: 'Engineer', company: 'Globex', location: '', start: '2019-06-01', end: '2022-12-01', bullets: [] },
    ],
    education: [{ title: 'BSc Computer Science', institution: 'Uni', location: 'Bucharest', start: '2015-10-01', end: '2019-06-01' }],
    papers: [
      { title: 'A paper about things (2020)', fileUrl: '' },
      { title: 'Scene reconstruction', fileUrl: '/api/files/33333333-3333-3333-3333-333333333333/scene.pdf' },
    ],
    qualifications: [{ title: 'Azure Developer Associate', issuer: 'Microsoft', obtained: '2024-03-01', grade: '' }],
    languages: [
      { name: 'Romanian', level: 'native' },
      { name: 'Danish', level: 'beginner' },
    ],
    licences: [
      { category: 'driving', code: 'B', name: 'Car' },
      { category: 'other', code: '', name: 'Forklift' },
    ],
    hackathons: [{ name: 'HackMCR', year: 2022, bullets: ['Built a game'] }],
  }
}

/** The terms used by default: never saved (no date), so their version is "default". A fresh copy each call. */
export function termsDocument(): TermsDocument {
  return {
    title: 'Terms and Conditions',
    intro: 'Please read these terms.',
    sections: [
      {
        heading: 'Using the website',
        blocks: [
          { kind: 'paragraph', text: 'You may browse the website.', items: [] },
          { kind: 'bullets', text: '', items: ['Be kind', 'No spam'] },
        ],
      },
      { heading: 'Changes', blocks: [{ kind: 'paragraph', text: 'These terms may change.', items: [] }] },
    ],
    updatedAt: null,
  }
}

/**
 * The terms API for the signed-in admin: PUT stores the body with a new date and GET returns it.
 * `saved` records every PUT body; a missing title is refused like the API does.
 */
export function termsApi(initial = termsDocument()) {
  let current = initial
  const saved: TermsContent[] = []
  const handlers = [
    http.get(`${API}/api/terms`, () => HttpResponse.json(current)),
    http.put(`${API}/api/terms`, async ({ request }) => {
      const body = (await request.json()) as TermsContent
      saved.push(body)
      if (!body.title.trim()) return HttpResponse.json({ status: 400, errors: { title: ['Required.'] } }, { status: 400 })
      current = { ...body, updatedAt: '2026-10-12T12:00:00Z' }
      return HttpResponse.json(current)
    }),
  ]
  return { handlers, saved }
}

// Default handlers: anonymous visitor, happy path. Override per test with server.use(...)
export const handlers = [
  http.get(`${API}/api/firstname`, () => HttpResponse.json({ firstName: 'Claudiu' })),
  http.get(`${API}/api/auth/me`, () => new HttpResponse(null, { status: 401 })),
  http.post(`${API}/api/auth/logout`, () => new HttpResponse(null, { status: 200 })),
  http.get(`${API}/api/about`, () => HttpResponse.json(aboutContent())),
  http.get(`${API}/api/terms`, () => HttpResponse.json(termsDocument())),
  http.get(`${API}/api/leetcode`, () => HttpResponse.json(LEETCODE_STATS)),
  http.get(`${API}/api/youtube/videos`, () => HttpResponse.json({ items: [], page: 1, pageSize: 9, totalCount: 0 })),
  http.get(`${API}/api/apps`, () => HttpResponse.json({ items: [], page: 1, pageSize: 9, totalCount: 0 })),
  // The visitor tracker (features/analytics) sends here; its own tests look at what it sends.
  http.post(`${API}/api/analytics/events`, () => new HttpResponse(null, { status: 204 })),
]

/**
 * The About Me API for the signed-in admin: PUT stores the body and GET returns it. `saved`
 * records every PUT body. Also answers the city search. (Uploads can't go through MSW: jsdom's
 * XHR can't send FormData, so tests stub `api.files` instead.)
 */
export function aboutApi(initial = aboutContent()) {
  let current = initial
  const saved: AboutContent[] = []
  const handlers = [
    http.get(`${API}/api/about`, () => HttpResponse.json(current)),
    http.put(`${API}/api/about`, async ({ request }) => {
      current = (await request.json()) as AboutContent
      saved.push(current)
      return HttpResponse.json(current)
    }),
    http.get(`${API}/api/places/search`, ({ request }) => {
      const q = new URL(request.url).searchParams.get('q')?.toLowerCase() ?? ''
      return HttpResponse.json(TEST_CITIES.filter((c) => c.name.toLowerCase().startsWith(q)))
    }),
  ]
  return { handlers, saved }
}

export const LEETCODE_STATS = {
  username: 'NeetCode',
  solved: { all: 205, easy: 103, medium: 98, hard: 4 },
  total: { all: 4073, easy: 969, medium: 2124, hard: 980 },
  fetchedAt: '2026-10-10T09:00:00Z',
}

/** `count` videos, newest first: video 1 is the newest. */
export function makeVideos(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `v${i + 1}`,
    title: `Video ${i + 1}`,
    description: `What happens in video ${i + 1}. `.repeat(20),
    thumbnailUrl: `https://i.ytimg.com/vi/v${i + 1}/hqdefault.jpg`,
    publishedAt: new Date(Date.UTC(2026, 8, 30 - i, 12)).toISOString(),
    url: `https://www.youtube.com/watch?v=v${i + 1}`,
  }))
}

/** GET /api/youtube/videos over `videos`, paged like the API. */
export function youtube(videos: ReturnType<typeof makeVideos>) {
  return http.get(`${API}/api/youtube/videos`, ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? 1)
    const pageSize = Number(url.searchParams.get('pageSize') ?? 9)
    return HttpResponse.json({ items: videos.slice((page - 1) * pageSize, page * pageSize), page, pageSize, totalCount: videos.length })
  })
}

export const TEST_APP_CATEGORIES: AppCategory[] = [
  { id: 1, name: 'Mobile app' },
  { id: 2, name: 'Website' },
  { id: 3, name: 'Video game' },
]

/**
 * `count` apps, newest first: app 1 is the newest. Each has an image; app 1 starts with a video,
 * is a mobile app and a game for iOS and Android, on the App Store. The others are websites.
 */
export function makeApps(count: number): AppDetails[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `App ${i + 1}`,
    description: `What app ${i + 1} does, on [GitHub](https://github.com/x/app${i + 1}).`,
    categories: i === 0 ? [TEST_APP_CATEGORIES[0], TEST_APP_CATEGORIES[2]] : [TEST_APP_CATEGORIES[1]],
    platforms: i === 0 ? ['iOS', 'Android'] : [],
    links: i === 0 ? [{ label: 'App Store', url: 'https://apps.apple.com/app/app1' }] : [],
    media: [
      ...(i === 0 ? [{ url: '/api/files/00000000-0000-0000-0000-000000000001/demo.mp4', kind: 'video' as const }] : []),
      { url: `/api/files/00000000-0000-0000-0000-0000000001${String(i).padStart(2, '0')}/image.webp`, kind: 'image' as const },
      { url: `/api/files/00000000-0000-0000-0000-0000000002${String(i).padStart(2, '0')}/image.webp`, kind: 'image' as const },
    ],
    createdAt: new Date(Date.UTC(2026, 9, 1) - i * 86_400_000).toISOString(),
  }))
}

/**
 * The Apps API over an in-memory list (newest first), which it changes. `sent` records the
 * bodies of creates and updates; a missing title is refused like the API does.
 */
export function appsApi(apps: AppDetails[], categories: AppCategory[] = [...TEST_APP_CATEGORIES]) {
  const sent: { method: string; body: AppRequest }[] = []
  const deleted: number[] = []
  const savedCategories: AppCategoryRequest[][] = []
  const toApp = ({ categoryIds, ...body }: AppRequest) => ({ ...body, categories: categories.filter((c) => categoryIds.includes(c.id)) })
  const invalid = (body: AppRequest) => (body.title.trim() ? null : HttpResponse.json({ status: 400, errors: { title: ['Required.'] } }, { status: 400 }))
  const handlers = [
    http.get(`${API}/api/apps/categories`, () => HttpResponse.json(categories)),
    http.put(`${API}/api/apps/categories`, async ({ request }) => {
      const body = (await request.json()) as AppCategoryRequest[]
      savedCategories.push(body)
      if (body.some((c) => !c.name.trim())) return HttpResponse.json({ status: 400, errors: { [`[${body.findIndex((c) => !c.name.trim())}].name`]: ['Required.'] } }, { status: 400 })
      let next = Math.max(0, ...categories.map((c) => c.id))
      categories = body.map((c) => ({ id: c.id ?? ++next, name: c.name.trim() }))
      for (const app of apps) app.categories = categories.filter((c) => app.categories.some((a) => a.id === c.id))
      return HttpResponse.json(categories)
    }),
    http.get(`${API}/api/apps`, ({ request }) => {
      const url = new URL(request.url)
      const page = Number(url.searchParams.get('page') ?? 1)
      const pageSize = Number(url.searchParams.get('pageSize') ?? 9)
      return HttpResponse.json({ items: apps.slice((page - 1) * pageSize, page * pageSize), page, pageSize, totalCount: apps.length })
    }),
    http.post(`${API}/api/apps`, async ({ request }) => {
      const body = (await request.json()) as AppRequest
      sent.push({ method: 'POST', body })
      const error = invalid(body)
      if (error) return error
      const app = { ...toApp(body), id: Math.max(0, ...apps.map((a) => a.id)) + 1, createdAt: new Date().toISOString() }
      apps.unshift(app)
      return HttpResponse.json(app, { status: 201 })
    }),
    http.put(`${API}/api/apps/:id`, async ({ request, params }) => {
      const body = (await request.json()) as AppRequest
      sent.push({ method: 'PUT', body })
      const error = invalid(body)
      if (error) return error
      const index = apps.findIndex((a) => a.id === Number(params.id))
      apps[index] = { ...apps[index], ...toApp(body) }
      return HttpResponse.json(apps[index])
    }),
    http.delete(`${API}/api/apps/:id`, ({ params }) => {
      deleted.push(Number(params.id))
      apps.splice(apps.findIndex((a) => a.id === Number(params.id)), 1)
      return new HttpResponse(null, { status: 204 })
    }),
  ]
  return { handlers, sent, deleted, savedCategories }
}

export const TEST_CITIES = [
  { id: 2643743, name: 'London', region: 'England', country: 'United Kingdom', latitude: 51.509, longitude: -0.126, population: 8961989 },
  { id: 6058560, name: 'London', region: 'Ontario', country: 'Canada', latitude: 42.984, longitude: -81.233, population: 422324 },
  { id: 2643123, name: 'Manchester', region: 'England', country: 'United Kingdom', latitude: 53.481, longitude: -2.237, population: 568996 },
]

export const signedIn = () => http.get(`${API}/api/auth/me`, () => HttpResponse.json(TEST_USER))

export const server = setupServer(...handlers)

export const LONG_MESSAGE =
  'Hello Claudiu! I watched your latest video and I would love to talk about working together on a new app idea.'

export interface TestMessage {
  id: number
  name: string
  email: string
  message: string
  receivedAt: string
  readAt: string | null
}

/** `count` messages, newest first (id 1 is the newest); every third one already read. */
export function makeMessages(count: number): TestMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Sender ${i + 1}`,
    email: `sender${i + 1}@example.com`,
    message: `${LONG_MESSAGE} (#${i + 1})`,
    receivedAt: new Date(Date.UTC(2026, 9, 8, 12, 0) - i * 3_600_000).toISOString(),
    readAt: i % 3 === 2 ? '2026-10-08T13:00:00.000Z' : null,
  }))
}

/**
 * The admin inbox API over an in-memory list, which it mutates (marking as read, deleting), so
 * tests can inspect it afterwards. `calls` records the "read" and delete requests.
 */
export function inbox(messages: TestMessage[]) {
  const calls = { markAsRead: [] as number[], deleted: [] as number[] }
  const handlers = [
    http.get(`${API}/api/contact/messages`, ({ request }) => {
      const url = new URL(request.url)
      const page = Number(url.searchParams.get('page') ?? 1)
      const pageSize = Number(url.searchParams.get('pageSize') ?? 10)
      const items = messages
        .slice((page - 1) * pageSize, page * pageSize)
        .map(({ id, name, receivedAt, readAt }) => ({ id, name, receivedAt, isRead: readAt !== null }))
      return HttpResponse.json({ items, page, pageSize, totalCount: messages.length })
    }),
    http.get(`${API}/api/contact/messages/:id`, ({ params }) => {
      const message = messages.find((m) => m.id === Number(params.id))
      return message ? HttpResponse.json(message) : new HttpResponse(null, { status: 404 })
    }),
    http.post(`${API}/api/contact/messages/:id/read`, ({ params }) => {
      const message = messages.find((m) => m.id === Number(params.id))
      if (!message) return new HttpResponse(null, { status: 404 })
      calls.markAsRead.push(message.id)
      message.readAt ??= new Date().toISOString()
      return new HttpResponse(null, { status: 204 })
    }),
    http.delete(`${API}/api/contact/messages/:id`, ({ params }) => {
      const index = messages.findIndex((m) => m.id === Number(params.id))
      if (index === -1) return new HttpResponse(null, { status: 404 })
      calls.deleted.push(messages[index].id)
      messages.splice(index, 1)
      return new HttpResponse(null, { status: 204 })
    }),
  ]
  return { handlers, calls }
}

/** The columns each period has, as the API makes them (see AnalyticsRange.cs). */
const TEST_RANGES: Record<AnalyticsRange, [BucketSize, number]> = {
  '1h': ['5m', 12],
  '24h': ['hour', 24],
  '7d': ['day', 7],
  '30d': ['day', 30],
  '90d': ['day', 90],
  '1y': ['month', 12],
  '5y': ['month', 60],
  all: ['month', 3],
}

/** A few visits up to 12 Oct 2026, 14:00 UTC; the last column has the iPhone visit that hit an error. */
export function analyticsSummary(range: AnalyticsRange = '30d'): AnalyticsSummary {
  const [bucketSize, count] = TEST_RANGES[range]
  const step = (i: number) => {
    const back = count - 1 - i
    if (bucketSize === '5m') return Date.UTC(2026, 9, 12, 14, -5 * back)
    if (bucketSize === 'hour') return Date.UTC(2026, 9, 12, 14 - back)
    if (bucketSize === 'day') return Date.UTC(2026, 9, 12 - back)
    return Date.UTC(2026, 9 - back, 1)
  }
  const series = Array.from({ length: count }, (_, i) => {
    const last = i === count - 1
    return { start: new Date(step(i)).toISOString(), visitors: last ? 3 : i % 3, sessions: last ? 4 : i % 3, pageViews: last ? 9 : (i % 3) * 2, errors: last ? 1 : 0 }
  })
  return {
    range,
    bucketSize,
    from: series[0].start,
    totals: { visitors: 12, sessions: 15, pageViews: 40, averageSessionSeconds: 95, bounceRate: 0.4, errors: 1 },
    series,
    topPages: [
      { name: '/', count: 20 },
      { name: '/apps', count: 12 },
    ],
    referrers: [
      { name: 'Direct', count: 9 },
      { name: 'linkedin.com', count: 6 },
    ],
    devices: [{ name: 'desktop', count: 10 }],
    browsers: [{ name: 'Chrome', count: 10 }],
    timeZones: [{ name: 'Europe/London', count: 10 }],
    topClicks: [{ name: 'Check it on App Store', count: 4 }],
    topErrors: [{ name: 'TypeError: boom', count: 1 }],
    themes: [
      { name: 'vice', count: 8 },
      { name: 'dark', count: 5 },
    ],
    themeSwitches: [{ name: 'vice → dark', count: 3 }],
  }
}

export const TEST_VISITS: VisitSummary[] = [
  {
    id: 'visit-error',
    startedAt: '2026-10-12T10:00:00Z',
    durationSeconds: 9,
    pageViews: 2,
    eventCount: 4,
    errorCount: 1,
    entryPath: '/',
    referrerHost: 'linkedin.com',
    device: 'mobile',
    browser: 'Safari',
    operatingSystem: 'iOS',
    timeZone: 'Europe/London',
    theme: 'vice',
    lastTheme: 'dark',
  },
  {
    id: 'visit-fine',
    startedAt: '2026-10-11T09:00:00Z',
    durationSeconds: 65,
    pageViews: 1,
    eventCount: 1,
    errorCount: 0,
    entryPath: '/about',
    referrerHost: null,
    device: 'desktop',
    browser: 'Chrome',
    operatingSystem: 'macOS',
    timeZone: 'Europe/Bucharest',
    theme: 'light',
    lastTheme: 'light',
  },
]

export function visitDetails(summary: VisitSummary): VisitDetails {
  return {
    id: summary.id,
    startedAt: summary.startedAt,
    lastSeenAt: new Date(Date.parse(summary.startedAt) + summary.durationSeconds * 1000).toISOString(),
    entryPath: summary.entryPath,
    referrer: summary.referrerHost && `www.${summary.referrerHost}/feed`,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    device: summary.device,
    browser: summary.browser,
    operatingSystem: summary.operatingSystem,
    country: null,
    language: 'en-GB',
    timeZone: summary.timeZone,
    screenWidth: 393,
    screenHeight: 852,
    viewportWidth: 393,
    viewportHeight: 660,
    theme: summary.theme,
    lastTheme: summary.lastTheme,
    events: [
      { seq: 1, occurredAt: summary.startedAt, type: 'pageview', path: '/', label: null, detail: null },
      { seq: 2, occurredAt: '2026-10-12T10:00:04Z', type: 'click', path: '/', label: 'Apps', detail: { element: 'a', href: '/apps' } },
      { seq: 3, occurredAt: '2026-10-12T10:00:05Z', type: 'pageview', path: '/apps', label: null, detail: null },
      {
        seq: 4,
        occurredAt: '2026-10-12T10:00:09Z',
        type: 'error',
        path: '/apps',
        label: 'TypeError: boom',
        detail: { kind: 'script', stack: 'TypeError: boom\n    at AppsPage (AppsPage.tsx:12:5)' },
      },
    ],
  }
}

/** The admin's analytics endpoints over `visits`; `requests` records the list queries, `deleted` the ids deleted. */
export function analyticsApi(visits: VisitSummary[] = TEST_VISITS) {
  let current = [...visits]
  const requests: URLSearchParams[] = []
  const deleted: string[] = []
  return {
    requests,
    deleted,
    handlers: [
      http.get(`${API}/api/analytics/summary`, ({ request }) => HttpResponse.json(analyticsSummary((new URL(request.url).searchParams.get('range') ?? '30d') as AnalyticsRange))),
      http.get(`${API}/api/analytics/sessions`, ({ request }) => {
        const params = new URL(request.url).searchParams
        requests.push(params)
        const items = params.get('errorsOnly') === 'true' ? current.filter((v) => v.errorCount > 0) : current
        return HttpResponse.json({ items, page: Number(params.get('page')), pageSize: Number(params.get('pageSize')), totalCount: items.length })
      }),
      http.get(`${API}/api/analytics/sessions/:id`, ({ params }) => {
        const visit = current.find((v) => v.id === params.id)
        return visit ? HttpResponse.json(visitDetails(visit)) : new HttpResponse(null, { status: 404 })
      }),
      http.delete(`${API}/api/analytics/sessions/:id`, ({ params }) => {
        deleted.push(String(params.id))
        current = current.filter((v) => v.id !== params.id)
        return new HttpResponse(null, { status: 204 })
      }),
    ],
  }
}
