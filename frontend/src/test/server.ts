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
