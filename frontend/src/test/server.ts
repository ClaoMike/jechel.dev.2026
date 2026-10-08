import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const API = 'http://api.test'

export const TEST_USER = {
  email: 'admin@example.com',
  name: 'Claudiu Jechel',
  pictureUrl: null,
  sessionExpiresInSeconds: 600,
}

// Default handlers: anonymous visitor, happy path. Override per test with server.use(...)
export const handlers = [
  http.get(`${API}/api/firstname`, () => HttpResponse.json({ firstName: 'Claudiu' })),
  http.get(`${API}/api/auth/me`, () => new HttpResponse(null, { status: 401 })),
  http.post(`${API}/api/auth/logout`, () => new HttpResponse(null, { status: 200 })),
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
