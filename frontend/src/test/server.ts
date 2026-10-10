import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { AboutContent } from '../services/api'

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

// Default handlers: anonymous visitor, happy path. Override per test with server.use(...)
export const handlers = [
  http.get(`${API}/api/firstname`, () => HttpResponse.json({ firstName: 'Claudiu' })),
  http.get(`${API}/api/auth/me`, () => new HttpResponse(null, { status: 401 })),
  http.post(`${API}/api/auth/logout`, () => new HttpResponse(null, { status: 200 })),
  http.get(`${API}/api/about`, () => HttpResponse.json(aboutContent())),
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
 * The admin inbox API over an in-memory list, which it mutates (marking as read), so tests can
 * inspect it afterwards. `calls` records the "read" requests.
 */
export function inbox(messages: TestMessage[]) {
  const calls = { markAsRead: [] as number[] }
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
  ]
  return { handlers, calls }
}
