import { describe, expect, it, vi } from 'vitest'
import { pageOfVisits, SUMMARY, VISIT_ID } from '@/test/fixtures/analytics'
import { fakeHttp } from '@/test/http'
import { api, ApiError, type VisitBatch } from './api'

// The real requests behind the tracker and the Engagement tab, over a fake network.

const BATCH: VisitBatch = {
  sessionId: VISIT_ID,
  session: { path: '/apps', referrer: '', language: 'en-GB', timeZone: 'Europe/London', screenWidth: 390, screenHeight: 844, viewportWidth: 390, viewportHeight: 700, theme: 'vice', currentTheme: 'dark' },
  events: [{ seq: 1, type: 'pageview', path: '/apps', ageMs: 120 }],
}

describe('api.analytics', () => {
  it("sends a visit's batch", async () => {
    const { requests } = fakeHttp(() => ({ status: 204 }))

    await expect(api.analytics.send(BATCH)).resolves.toBeUndefined()

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /api/analytics/events'])
    expect(requests[0].body).toEqual(BATCH)
  })

  it('rejects when the API refuses a batch (too many), so the tracker can try again', async () => {
    fakeHttp(() => ({ status: 429 }))

    const error = (await api.analytics.send(BATCH).catch((e: unknown) => e)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(429)
  })

  it("hands a closing tab's batch to the browser as JSON, and says whether it took it", async () => {
    const beacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)

    expect(api.analytics.beacon(BATCH)).toBe(true)

    const [url, body] = beacon.mock.calls[0] as [string, Blob]
    expect(url).toBe('/api/analytics/events')
    expect(body.type).toBe('application/json')
    expect(JSON.parse(await body.text())).toEqual(BATCH)

    // Too big for a beacon: the browser says no, and the tracker sends it the usual way.
    beacon.mockReturnValue(false)
    expect(api.analytics.beacon(BATCH)).toBe(false)
  })

  it("says no where the browser has no beacons, instead of failing as the tab closes", () => {
    const own = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon')
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
    try {
      expect(api.analytics.beacon(BATCH)).toBe(false)
    } finally {
      if (own) Object.defineProperty(navigator, 'sendBeacon', own)
      else delete (navigator as unknown as Record<string, unknown>).sendBeacon
    }
  })

  it('asks for a period’s summary', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: SUMMARY }))

    expect(await api.analytics.summary('7d')).toEqual(SUMMARY)
    await api.analytics.summary('all')

    expect(requests.map((r) => r.url)).toEqual(['/api/analytics/summary?range=7d', '/api/analytics/summary?range=all'])
  })

  it('lists visits a page at a time, all of them or those with errors', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: pageOfVisits() }))

    expect(await api.analytics.listSessions()).toEqual(pageOfVisits())
    await api.analytics.listSessions(3, 50, true)

    expect(requests.map((r) => r.url)).toEqual(['/api/analytics/sessions?page=1&pageSize=20&errorsOnly=false', '/api/analytics/sessions?page=3&pageSize=50&errorsOnly=true'])
  })

  it('gets one visit and deletes it; one that is gone is a 404', async () => {
    const { requests } = fakeHttp(({ method }) => (method === 'DELETE' ? { status: 204 } : { status: 404 }))

    await expect(api.analytics.deleteSession(VISIT_ID)).resolves.toBeUndefined()
    const error = (await api.analytics.getSession(VISIT_ID).catch((e: unknown) => e)) as ApiError

    expect(error.status).toBe(404)
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([`DELETE /api/analytics/sessions/${VISIT_ID}`, `GET /api/analytics/sessions/${VISIT_ID}`])
  })

  it('a cancelled request is cancelled, not a failure', async () => {
    fakeHttp(() => 'never')
    const controller = new AbortController()

    const asked = api.analytics.summary('30d', controller.signal).catch((e: unknown) => e)
    controller.abort()

    expect(await asked).not.toBeInstanceOf(ApiError)
  })
})
