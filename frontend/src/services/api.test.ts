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

    await expect(api.profile.getFirstName()).rejects.toThrow('status 404')
  })
})
