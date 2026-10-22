import { describe, expect, it } from 'vitest'
import { ADA_CONVERSATION } from '../test/fixtures/contact'
import { fakeHttp } from '../test/http'
import { api, ApiError } from './api'

// The real requests behind a visitor's conversation, over a fake network.
describe('api.contact: a conversation', () => {
  it('reads it and writes back with its link, escaped in the path', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: ADA_CONVERSATION }))

    expect(await api.contact.getConversation('a/b+c')).toEqual(ADA_CONVERSATION)
    expect(await api.contact.writeBack('a/b+c', 'Tuesday?')).toEqual(ADA_CONVERSATION)

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/contact/conversations/a%2Fb%2Bc', 'POST /api/contact/conversations/a%2Fb%2Bc/messages'])
    expect(requests[1].body).toEqual({ text: 'Tuesday?' })
  })

  it('rejects with the reason: no such conversation, too many, or what is wrong with the text', async () => {
    for (const [status, body] of [
      [404, undefined],
      [429, undefined],
      [400, { errors: { text: ['Write your message first.'] } }],
    ] as const) {
      fakeHttp(() => ({ status, body }))
      const error = (await api.contact.writeBack('t', ' ').catch((e: unknown) => e)) as ApiError
      expect(error.status).toBe(status)
    }
  })
})
