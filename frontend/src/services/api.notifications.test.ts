import { describe, expect, it } from 'vitest'
import { KINDS, pageOfNotifications } from '../test/fixtures/notifications'
import { fakeHttp } from '../test/http'
import { api, ApiError } from './api'

// The real requests behind the Notifications tab, over a fake network.
describe('api.notifications', () => {
  it('lists the kinds, and switches one with the answer of every kind as it now is', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: KINDS }))

    expect(await api.notifications.listKinds()).toEqual(KINDS)
    expect(await api.notifications.saveKind('site-error', false)).toEqual(KINDS)

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/notifications/kinds', 'PUT /api/notifications/kinds/site-error'])
    expect(requests[1].body).toEqual({ enabled: false })
  })

  it('lists the history a page at a time, of every kind or one', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: pageOfNotifications() }))

    await api.notifications.list()
    await api.notifications.list(3, 10, 'coffee')

    expect(requests.map((r) => r.url)).toEqual(['/api/notifications?page=1&pageSize=20', '/api/notifications?page=3&pageSize=10&kind=coffee'])
  })

  it('escapes a kind in the path, and rejects an unknown one with 404', async () => {
    const { requests } = fakeHttp(() => ({ status: 404 }))

    const error = (await api.notifications.saveKind('a/b', true).catch((e: unknown) => e)) as ApiError

    expect(error.status).toBe(404)
    expect(requests[0].url).toBe('/api/notifications/kinds/a%2Fb')
  })
})
