import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API, server, signedIn, TEST_USER } from '../test/server'
import { api, ApiError } from './api'

describe('api.auth', () => {
  it('me returns the user when signed in', async () => {
    server.use(signedIn())

    await expect(api.auth.me()).resolves.toEqual(TEST_USER)
  })

  it('me returns null when not signed in', async () => {
    await expect(api.auth.me()).resolves.toBeNull()
  })

  it('me throws an ApiError on other errors', async () => {
    server.use(http.get(`${API}/api/auth/me`, () => new HttpResponse(null, { status: 500 })))

    await expect(api.auth.me()).rejects.toMatchObject({ name: 'Error', status: 500 })
    await expect(api.auth.me()).rejects.toBeInstanceOf(ApiError)
  })

  it('logout posts to the API', async () => {
    let called = false
    server.use(
      http.post(`${API}/api/auth/logout`, () => {
        called = true
        return new HttpResponse(null, { status: 200 })
      }),
    )

    await api.auth.logout()

    expect(called).toBe(true)
  })

  it('googleLoginUrl points at the API login endpoint with an encoded return url', () => {
    expect(api.auth.googleLoginUrl('/a b')).toBe(`${API}/api/auth/login?returnUrl=%2Fa%20b`)
  })
})

describe('api.profile', () => {
  it('getFirstName returns the first name', async () => {
    await expect(api.profile.getFirstName()).resolves.toBe('Claudiu')
  })

  it('getFirstName throws when the API responds with an error', async () => {
    server.use(http.get(`${API}/api/firstname`, () => new HttpResponse(null, { status: 404 })))

    await expect(api.profile.getFirstName()).rejects.toThrow('Request to /api/firstname failed with status 404')
  })

  it('getFirstName throws an ApiError with status 0 when the network fails', async () => {
    server.use(http.get(`${API}/api/firstname`, () => HttpResponse.error()))

    await expect(api.profile.getFirstName()).rejects.toMatchObject({ status: 0 })
  })

  it('getFirstName rejects without an ApiError when cancelled', async () => {
    const controller = new AbortController()
    controller.abort()

    const error = await api.profile.getFirstName(controller.signal).catch((e: unknown) => e)

    expect(error).not.toBeInstanceOf(ApiError)
  })
})

describe('api.contact', () => {
  it('send posts the message as JSON', async () => {
    let body: unknown
    server.use(
      http.post(`${API}/api/contact`, async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 201 })
      }),
    )

    await api.contact.send({ name: 'Ada', email: 'ada@example.com', message: 'Hi' })

    expect(body).toEqual({ name: 'Ada', email: 'ada@example.com', message: 'Hi' })
  })

  it('send exposes the field errors of a validation problem', async () => {
    server.use(
      http.post(`${API}/api/contact`, () =>
        HttpResponse.json({ status: 400, errors: { message: ['Message must be at least 100 characters.'] } }, { status: 400 }),
      ),
    )

    const error = await api.contact.send({ name: 'Ada', email: 'ada@example.com', message: 'Hi' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, validationErrors: { message: ['Message must be at least 100 characters.'] } })
  })

  it('errors without a validation body have no field errors', async () => {
    server.use(http.post(`${API}/api/contact`, () => new HttpResponse('oops', { status: 500 })))

    await expect(api.contact.send({ name: '', email: '', message: '' })).rejects.toMatchObject({ status: 500, validationErrors: null })
  })

  it('listMessages asks for the page and page size', async () => {
    let query = ''
    server.use(
      http.get(`${API}/api/contact/messages`, ({ request }) => {
        query = new URL(request.url).search
        return HttpResponse.json({ items: [], page: 3, pageSize: 5, totalCount: 0 })
      }),
    )

    await expect(api.contact.listMessages(3, 5)).resolves.toEqual({ items: [], page: 3, pageSize: 5, totalCount: 0 })
    expect(query).toBe('?page=3&pageSize=5')
  })

  it('getMessage and markAsRead call the message endpoints', async () => {
    const message = { id: 7, name: 'Ada', email: 'ada@example.com', message: 'Hi', receivedAt: '2026-10-08T12:00:00Z', readAt: null }
    let marked = false
    server.use(
      http.get(`${API}/api/contact/messages/7`, () => HttpResponse.json(message)),
      http.post(`${API}/api/contact/messages/7/read`, () => {
        marked = true
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(api.contact.getMessage(7)).resolves.toEqual(message)
    await api.contact.markAsRead(7)
    expect(marked).toBe(true)
  })

  it('the inbox calls fail with 401 when not signed in', async () => {
    server.use(http.get(`${API}/api/contact/messages`, () => new HttpResponse(null, { status: 401 })))

    await expect(api.contact.listMessages()).rejects.toMatchObject({ status: 401 })
  })
})
