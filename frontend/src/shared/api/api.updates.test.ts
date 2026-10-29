import { describe, expect, it } from 'vitest'
import { SITE } from '@/test/fixtures/site'
import { DEFAULT_WORDING } from '@/test/fixtures/updateEmails'
import { fakeHttp } from '@/test/http'
import { api, ApiError } from './api'

// The real requests behind email updates, the site's switches and Buy me a coffee, over a fake network.
describe('api.updates', () => {
  it('subscribes an address and says what happened', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: { status: 'alreadySubscribed' } }))

    expect(await api.updates.subscribe('ada@example.com')).toBe('alreadySubscribed')
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /api/updates/subscribe'])
    expect(requests[0].body).toEqual({ email: 'ada@example.com' })
  })

  it("rejects a subscription with the address's error, or too many tries (429)", async () => {
    for (const [status, body] of [
      [400, { errors: { email: ['Enter a valid email address.'] } }],
      [429, undefined],
    ] as const) {
      fakeHttp(() => ({ status, body }))
      const error = (await api.updates.subscribe('nope').catch((e: unknown) => e)) as ApiError
      expect(error.status).toBe(status)
    }
  })

  it("confirms with the email's token and gives back the address", async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: { email: 'ada@example.com' } }))

    expect(await api.updates.confirm('tok/en+1')).toBe('ada@example.com')
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /api/updates/confirm?token=tok%2Fen%2B1'])
  })

  it('unsubscribes with the token', async () => {
    const { requests } = fakeHttp(() => ({ status: 204 }))

    await api.updates.unsubscribe('t1')

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /api/updates/unsubscribe?token=t1'])
  })

  it("reads, saves and resets the emails' wording", async () => {
    const document = { wording: DEFAULT_WORDING, defaults: DEFAULT_WORDING, updatedAt: null }
    const { requests } = fakeHttp(() => ({ status: 200, body: document }))

    expect(await api.updates.getEmails()).toEqual(document)
    expect(await api.updates.saveEmails(DEFAULT_WORDING)).toEqual(document)
    expect(await api.updates.resetEmails()).toEqual(document)

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/updates/emails', 'PUT /api/updates/emails', 'DELETE /api/updates/emails'])
    expect(requests[1].body).toEqual(DEFAULT_WORDING)
  })

  it("rejects wording with each field's error, keyed like the wording", async () => {
    fakeHttp(() => ({ status: 400, body: { errors: { 'video.subject': ['Required.'] } } }))

    const error = (await api.updates.saveEmails(DEFAULT_WORDING).catch((e: unknown) => e)) as ApiError

    expect(error.validationErrors).toEqual({ 'video.subject': ['Required.'] })
  })

  it('previews and tests one email in a draft wording', async () => {
    const { requests } = fakeHttp((r) => ({
      status: 200,
      body: r.url.endsWith('/test') ? { ok: true, message: 'Sent.' } : { from: 'a', subject: 's', html: '<p>h</p>', text: 't' },
    }))

    expect((await api.updates.previewEmail('video', DEFAULT_WORDING)).subject).toBe('s')
    expect(await api.updates.testEmail('app', DEFAULT_WORDING)).toEqual({ ok: true, message: 'Sent.' })

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /api/updates/emails/preview', 'POST /api/updates/emails/test'])
    expect(requests[0].body).toEqual({ kind: 'video', wording: DEFAULT_WORDING })
    expect(requests[1].body).toEqual({ kind: 'app', wording: DEFAULT_WORDING })
  })

  it("lists the admin's subscribers and update emails a page at a time", async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: { items: [], page: 2, pageSize: 20, totalCount: 0 } }))

    await api.updates.listSubscribers(2)
    await api.updates.listAnnouncements(3, 10)

    expect(requests.map((r) => r.url)).toEqual(['/api/updates/subscribers?page=2&pageSize=20', '/api/updates/announcements?page=3&pageSize=10'])
  })

  it('deletes a subscriber, and decides about an update email', async () => {
    const { requests } = fakeHttp((r) => (r.method === 'DELETE' ? { status: 204 } : { status: 200, body: { status: r.url.endsWith('send') ? 'approved' : 'ignored' } }))

    await api.updates.deleteSubscriber(4)
    expect(await api.updates.decide(7, 'send')).toBe('approved')
    expect(await api.updates.decide(8, 'ignore')).toBe('ignored')

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'DELETE /api/updates/subscribers/4',
      'POST /api/updates/announcements/7/send',
      'POST /api/updates/announcements/8/ignore',
    ])
  })
})

describe('api.site', () => {
  it('reads what visitors see, and saves only the changes given', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: SITE }))

    expect(await api.site.status()).toEqual(SITE)
    await api.site.save({ pages: { apps: false } })

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/site', 'PUT /api/site'])
    expect(requests[1].body).toEqual({ pages: { apps: false } })
  })
})

describe('api.support', () => {
  it("reads the coffee link, and lists the admin's donations", async () => {
    const { requests } = fakeHttp((r) => ({
      status: 200,
      body: r.url === '/api/support' ? { url: 'https://buymeacoffee.com/me' } : { items: [], page: 1, pageSize: 20, totalCount: 0 },
    }))

    expect(await api.support.get()).toEqual({ url: 'https://buymeacoffee.com/me' })
    await api.support.listDonations()

    expect(requests.map((r) => r.url)).toEqual(['/api/support', '/api/support/donations?page=1&pageSize=20'])
  })
})
