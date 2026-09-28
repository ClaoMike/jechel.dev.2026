import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API, server, signedIn, TEST_USER } from '../test/server'
import { getCurrentUser, googleLoginUrl } from './auth'

describe('getCurrentUser', () => {
  it('returns the user when signed in', async () => {
    server.use(signedIn())

    await expect(getCurrentUser()).resolves.toEqual(TEST_USER)
  })

  it('returns null when not signed in', async () => {
    await expect(getCurrentUser()).resolves.toBeNull()
  })

  it('throws on other errors', async () => {
    server.use(http.get(`${API}/api/auth/me`, () => new HttpResponse(null, { status: 500 })))

    await expect(getCurrentUser()).rejects.toThrow('status 500')
  })
})

describe('googleLoginUrl', () => {
  it('points at the API login endpoint with an encoded return url', () => {
    expect(googleLoginUrl('/a b')).toBe(`${API}/api/auth/login?returnUrl=%2Fa%20b`)
  })
})
