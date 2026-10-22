import { describe, expect, it } from 'vitest'
import { fakeHttp } from '../test/http'
import { api, ApiError, type AdminSession } from './api'

const USER = { email: 'admin@example.com', name: 'Admin', pictureUrl: null, sessionExpiresInSeconds: 600 }
const SESSION: AdminSession = {
  id: '5bfe56de-d91c-47f7-b7cb-c4d6343d3e2b',
  device: 'Chrome on macOS',
  deviceType: 'desktop',
  ipAddress: '203.0.113.7',
  country: 'GB',
  createdAt: '2026-10-21T09:00:00Z',
  lastSeenAt: '2026-10-21T09:05:00Z',
  endsAt: '2026-10-21T21:00:00Z',
  current: true,
}

// The real requests, below them only a fake network (test/http.ts).
describe('api.auth', () => {
  it('says who is signed in, or null for a visitor (401)', async () => {
    const { requests } = fakeHttp((r) => (r.url === '/api/auth/me' && requests.length === 1 ? { status: 200, body: USER } : { status: 401 }))

    expect(await api.auth.me()).toEqual(USER)
    expect(await api.auth.me()).toBeNull()
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/auth/me', 'GET /api/auth/me'])
  })

  it("doesn't take a failure for being signed out: it rejects", async () => {
    for (const answer of [{ status: 500 }, 'network-error'] as const) {
      fakeHttp(() => answer)
      const error = await api.auth.me().catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ApiError)
    }
  })

  it('signs out this device with a POST', async () => {
    const { requests } = fakeHttp(() => ({ status: 200 }))

    await api.auth.logout()

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /api/auth/logout'])
  })

  it('lists the signed-in devices', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: [SESSION] }))

    expect(await api.auth.listSessions()).toEqual([SESSION])
    expect(requests[0].url).toBe('/api/auth/sessions')
  })

  it('signs one device out, rejecting with a 404 when it already was', async () => {
    const { requests } = fakeHttp(() => (requests.length === 1 ? { status: 204 } : { status: 404 }))

    await api.auth.endSession(SESSION.id)
    const error = (await api.auth.endSession(SESSION.id).catch((e: unknown) => e)) as ApiError

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([`DELETE /api/auth/sessions/${SESSION.id}`, `DELETE /api/auth/sessions/${SESSION.id}`])
    expect(error.status).toBe(404)
  })

  it('signs out every other device and says how many', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: { count: 2 } }))

    expect(await api.auth.endOtherSessions()).toBe(2)
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /api/auth/sessions/end-others'])
  })

  it("starts Google's sign-in with a navigation, coming back to the given page", () => {
    expect(api.auth.googleLoginUrl()).toBe('/api/auth/login?returnUrl=%2F')
    expect(api.auth.googleLoginUrl('/youtube?page=2')).toBe('/api/auth/login?returnUrl=%2Fyoutube%3Fpage%3D2')
  })
})
