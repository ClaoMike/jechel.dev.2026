import { describe, expect, it } from 'vitest'
import { CHANNELS, HERE, KINDS, pageOfNotifications, PUSH } from '@/test/fixtures/notifications'
import { fakeHttp } from '@/test/http'
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

  it('lists both ways alerts go, and switches one with the answer of both as they now are', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: CHANNELS }))

    expect(await api.notifications.listChannels()).toEqual(CHANNELS)
    expect(await api.notifications.saveChannel('push', false)).toEqual(CHANNELS)

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/notifications/channels', 'PUT /api/notifications/channels/push'])
    expect(requests[1].body).toEqual({ enabled: false })
  })

  it("gets the site's key and devices, adds this device with its name, and removes one", async () => {
    const { requests } = fakeHttp(({ method }) => ({ status: 200, body: method === 'GET' ? PUSH : PUSH.devices }))
    const subscription = { endpoint: HERE, keys: { p256dh: 'device-key', auth: 'device-secret' } }

    expect(await api.notifications.getPush()).toEqual(PUSH)
    expect(await api.notifications.addPushDevice(subscription, 'iPhone · Home Screen app')).toEqual(PUSH.devices)
    expect(await api.notifications.removePushDevice(7)).toEqual(PUSH.devices)

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/notifications/push', 'POST /api/notifications/push/devices', 'DELETE /api/notifications/push/devices/7'])
    expect(requests[1].body).toEqual({ ...subscription, label: 'iPhone · Home Screen app' })
  })

  it("sends a test to one device, and rejects with the push service's refusal", async () => {
    const { requests } = fakeHttp(({ url }) => (url.endsWith('/7/test') ? { status: 204 } : { status: 502, body: { title: 'The push service refused it.' } }))

    await expect(api.notifications.testPushDevice(7)).resolves.toBeUndefined()
    const error = (await api.notifications.testPushDevice(8).catch((e: unknown) => e)) as ApiError

    expect(error.status).toBe(502)
    expect(error.problem.detail).toBe('The push service refused it.')
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /api/notifications/push/devices/7/test', 'POST /api/notifications/push/devices/8/test'])
  })
})
