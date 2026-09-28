import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const API = 'http://api.test'

// Default happy-path handlers; override per test with server.use(...)
export const handlers = [
  http.get(`${API}/firstname`, () => HttpResponse.json({ firstName: 'Claudiu' })),
]

export const server = setupServer(...handlers)
