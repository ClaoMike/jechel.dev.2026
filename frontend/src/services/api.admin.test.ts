import { describe, expect, it } from 'vitest'
import { ADA, pageOfMessages } from '../test/fixtures/contact'
import { todaysMeetings } from '../test/fixtures/meetings'
import { settings } from '../test/fixtures/settings'
import { TERMS } from '../test/fixtures/site'
import { fakeHttp } from '../test/http'
import { api, ApiError } from './api'

// The real requests behind the contact form, the inbox, meetings, settings and the terms, over a fake network.

const sent = (requests: { method: string; url: string }[]) => requests.map((r) => `${r.method} ${r.url}`)

describe('api.contact', () => {
  it('sends the form, and reads, marks, answers and deletes messages', async () => {
    const { requests } = fakeHttp((r) =>
      r.url.endsWith('/reply')
        ? { status: 200, body: { id: 9, text: 'Hi', sentAt: '2026-10-22T10:00:00Z', fromVisitor: false } }
        : r.url.startsWith('/api/contact/messages?')
          ? { status: 200, body: pageOfMessages() }
          : r.url === '/api/contact/messages/1' && r.method === 'GET'
            ? { status: 200, body: ADA }
            : { status: r.method === 'POST' && r.url === '/api/contact' ? 201 : 204 },
    )

    await api.contact.send({ name: 'Ada', email: 'ada@example.com', message: 'Hello' })
    expect(await api.contact.listMessages(2, 5)).toEqual(pageOfMessages())
    await api.contact.listMessages()
    expect(await api.contact.getMessage(1)).toEqual(ADA)
    await api.contact.markAsRead(1)
    expect((await api.contact.reply(1, 'Hi')).id).toBe(9)
    await api.contact.deleteMessage(1)

    expect(sent(requests)).toEqual([
      'POST /api/contact',
      'GET /api/contact/messages?page=2&pageSize=5',
      'GET /api/contact/messages?page=1&pageSize=10',
      'GET /api/contact/messages/1',
      'POST /api/contact/messages/1/read',
      'POST /api/contact/messages/1/reply',
      'DELETE /api/contact/messages/1',
    ])
    expect(requests[0].body).toEqual({ name: 'Ada', email: 'ada@example.com', message: 'Hello' })
    expect(requests[5].body).toEqual({ text: 'Hi' })
  })

  it('rejects the form with its field errors, and too many with a 429', async () => {
    fakeHttp(() => ({ status: 400, body: { errors: { email: ['Enter a valid email address.'] } } }))
    const invalid = (await api.contact.send({ name: 'Ada', email: 'x', message: 'Hi' }).catch((e: unknown) => e)) as ApiError
    expect(invalid.validationErrors).toEqual({ email: ['Enter a valid email address.'] })

    fakeHttp(() => ({ status: 429 }))
    const tooMany = (await api.contact.send({ name: 'Ada', email: 'ada@example.com', message: 'Hi' }).catch((e: unknown) => e)) as ApiError
    expect(tooMany.status).toBe(429)
  })
})

describe('api.meetings', () => {
  it('reads the booking link, lists a range, and decides with a message', async () => {
    const { requests } = fakeHttp((r) =>
      r.url === '/api/meetings/info'
        ? { status: 200, body: { bookingUrl: 'https://cal.com/claudiu/30min' } }
        : r.method === 'GET'
          ? { status: 200, body: todaysMeetings() }
          : { status: 200, body: { status: r.url.endsWith('/accept') ? 'accepted' : 'declined', emailSent: true } },
    )

    expect(await api.meetings.info()).toBe('https://cal.com/claudiu/30min')
    expect(await api.meetings.list(new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'))).toHaveLength(3)
    expect(await api.meetings.decide(1, true, 'See you')).toEqual({ status: 'accepted', emailSent: true })
    expect((await api.meetings.decide(2, false, '')).status).toBe('declined')

    expect(sent(requests)).toEqual([
      'GET /api/meetings/info',
      'GET /api/meetings?from=2026-10-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z',
      'POST /api/meetings/1/accept',
      'POST /api/meetings/2/decline',
    ])
    expect(requests[2].body).toEqual({ message: 'See you' })
  })

  it("rejects with the API's status when Cal.com refuses", async () => {
    fakeHttp(() => ({ status: 502, body: { detail: 'Cal.com refused it' } }))

    expect(((await api.meetings.decide(1, true, '').catch((e: unknown) => e)) as ApiError).status).toBe(502)
  })
})

describe('api.settings', () => {
  it('reads them, saves one by its escaped key, and tests a service', async () => {
    const { requests } = fakeHttp((r) => (r.url.startsWith('/api/settings/test/') ? { status: 200, body: { ok: true, message: 'Sent.' } } : { status: 200, body: settings() }))

    expect((await api.settings.get()).siteUrl).toBe('https://jechel.dev')
    await api.settings.save('Email:From', 'Claudiu <hello@jechel.dev>')
    expect(await api.settings.test('ntfy')).toEqual({ ok: true, message: 'Sent.' })

    expect(sent(requests)).toEqual(['GET /api/settings', 'PUT /api/settings/Email%3AFrom', 'POST /api/settings/test/ntfy'])
    expect(requests[1].body).toEqual({ value: 'Claudiu <hello@jechel.dev>' })
  })
})

describe('api.terms and api.profile', () => {
  it('reads and replaces the terms, and reads the first name', async () => {
    const { requests } = fakeHttp((r) => (r.url === '/api/firstname' ? { status: 200, body: { firstName: 'Claudiu' } } : { status: 200, body: TERMS }))

    expect(await api.terms.get()).toEqual(TERMS)
    expect(await api.terms.update(TERMS)).toEqual(TERMS)
    expect(await api.profile.getFirstName()).toBe('Claudiu')

    expect(sent(requests)).toEqual(['GET /api/terms', 'PUT /api/terms', 'GET /api/firstname'])
    expect(requests[1].body).toEqual(TERMS)
  })
})
